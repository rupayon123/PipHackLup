import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  acquireDiscordAccountTokenRefreshLease,
  completeDiscordAccountTokenRefresh,
  createDiscordAuthSession,
  getActiveDiscordAuthSession,
  getDiscordAccount,
  releaseDiscordAccountTokenRefreshLease,
  revokeDiscordAuthSession,
  revokeDiscordAuthSessionsForAccountIfTokenVersion,
  touchDiscordAuthSession,
  updateDiscordAccountIdentity,
  upsertDiscordAccount,
  type DiscordAccountRecord,
  type DiscordAuthSessionWithAccount,
} from "@piphacklup/db";
import { cookies } from "next/headers";

const SESSION_COOKIE = "piphacklup_discord_session";
const PENDING_REVOCATIONS_COOKIE = "piphacklup_pending_session_revocations";
const STATE_COOKIE = "piphacklup_oauth_state";
const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_TOKEN_URL = `${DISCORD_API}/oauth2/token`;
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1_000;
const MAX_PENDING_SESSION_REVOCATIONS = 48;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const TOKEN_REFRESH_LEASE_MS = 60_000;
const TOKEN_REFRESH_WAIT_TIMEOUT_MS = 12_000;
const TOKEN_REFRESH_POLL_MS = 100;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_TAG_BYTES = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/;
const PERMISSIONS_PATTERN = /^\d{1,32}$/;
const REFRESH_LEASE_PATTERN = /^[A-Za-z0-9_-]{24}$/;

type DiscordTokenKind = "access" | "refresh";

export interface ManagedDiscordGuild {
  id: string;
  name: string;
  iconUrl?: string;
  isOwner: boolean;
  permissions: string;
  canManage: boolean;
}

export interface DiscordSession {
  user: {
    id: string;
    username: string;
    globalName?: string;
    avatarUrl?: string;
  };
  guilds: ManagedDiscordGuild[];
  issuedAt: number;
}

export interface CreatedDiscordSession {
  expiresAt: Date;
  sessionToken: string;
}

export interface DiscordSessionCookieStore {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      sameSite: "lax" | "strict";
      secure: boolean;
      expires: Date;
      path: string;
    },
  ): void;
  delete(name: string): void;
}

export interface DiscordSessionCookieDependencies {
  getCookieStore: () => Promise<DiscordSessionCookieStore>;
  revokeSession: (tokenHash: string) => Promise<void>;
  hasSessionStore: () => boolean;
  appUrl: () => string;
  now: () => number;
}

export interface DiscordLogoutResult {
  revocationPending: boolean;
}

interface ParsedDiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

export interface ParsedDiscordToken {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string;
}

export interface DiscordTokenRefreshDependencies {
  acquireLease: typeof acquireDiscordAccountTokenRefreshLease;
  completeRefresh: typeof completeDiscordAccountTokenRefresh;
  createLeaseId: () => string;
  exchangeRefreshToken: (refreshToken: string) => Promise<ParsedDiscordToken>;
  getAccount: typeof getDiscordAccount;
  now: () => number;
  releaseLease: typeof releaseDiscordAccountTokenRefreshLease;
  wait: (milliseconds: number) => Promise<void>;
}

class DiscordAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordAuthorizationError";
  }
}

export class DiscordAuthUnavailableError extends Error {
  constructor(message = "Discord authentication is temporarily unavailable.") {
    super(message);
    this.name = "DiscordAuthUnavailableError";
  }
}

class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(`Discord API request failed during ${operation}.`);
    this.name = "DiscordApiError";
  }
}

export function hasDiscordAuthConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return Boolean(
    env.DISCORD_CLIENT_ID &&
    SNOWFLAKE_PATTERN.test(env.DISCORD_CLIENT_ID) &&
    env.DISCORD_CLIENT_SECRET &&
    env.NEXTAUTH_SECRET &&
    Buffer.byteLength(env.NEXTAUTH_SECRET, "utf8") >= 32 &&
    hasDiscordSessionStoreConfiguration(env) &&
    hasValidAppUrlConfiguration(env),
  );
}

export function hasDiscordSessionStoreConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const databaseUrl = env.DATABASE_URL;
  return Boolean(
    databaseUrl &&
    !databaseUrl.includes("user:password@host") &&
    !databaseUrl.includes("example.com"),
  );
}

export function isDiscordAuthConfigured(): boolean {
  return hasDiscordAuthConfiguration(process.env);
}

export function buildDiscordAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state: input.state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function buildDiscordTokenRequest(
  input:
    | { code: string; grantType: "authorization_code"; redirectUri: string }
    | { grantType: "refresh_token"; refreshToken: string },
  client: { clientId: string; clientSecret: string },
): URLSearchParams {
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: input.grantType,
  });
  if (input.grantType === "authorization_code") {
    body.set("code", input.code);
    body.set("redirect_uri", input.redirectUri);
  } else {
    body.set("refresh_token", input.refreshToken);
  }
  return body;
}

export function getDiscordAuthorizeUrl(state: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId || !SNOWFLAKE_PATTERN.test(clientId)) {
    throw new Error(
      "DISCORD_CLIENT_ID must be a valid Discord application ID.",
    );
  }
  return buildDiscordAuthorizeUrl({
    clientId,
    redirectUri: getDiscordRedirectUri(),
    state,
  });
}

export function getDiscordRedirectUri(): string {
  return `${getAppUrl()}/api/auth/discord/callback`;
}

export function getAppUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.NEXTAUTH_URL;
  if (configured) return normalizeAppOrigin(configured, "NEXTAUTH_URL");
  if (env.VERCEL_URL) {
    return normalizeAppOrigin(`https://${env.VERCEL_URL}`, "VERCEL_URL");
  }
  return "http://localhost:3000";
}

function hasValidAppUrlConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  try {
    getAppUrl(env);
    return true;
  } catch {
    return false;
  }
}

function normalizeAppOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) origin.`);
  }

  const localHttpHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && localHttpHosts.has(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be an HTTPS origin without credentials, a path, a query, or a fragment; HTTP is allowed only for localhost.`,
    );
  }
  return url.origin;
}

export function createOauthState(): string {
  return randomBytes(24).toString("base64url");
}

export function oauthStatesMatch(
  stored: string | null | undefined,
  received: string | null | undefined,
): boolean {
  if (
    !stored ||
    !received ||
    !OAUTH_STATE_PATTERN.test(stored) ||
    !OAUTH_STATE_PATTERN.test(received)
  )
    return false;
  const left = Buffer.from(stored, "utf8");
  const right = Buffer.from(received, "utf8");
  return timingSafeEqual(left, right);
}

export async function setOauthStateCookie(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getAppUrl().startsWith("https://"),
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
  });
}

export async function consumeOauthStateCookie(
  state: string | null,
): Promise<boolean> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  return oauthStatesMatch(stored, state);
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken, "utf8").digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function shouldRefreshDiscordToken(
  expiresAt: Date,
  nowMs: number = Date.now(),
): boolean {
  return (
    !isValidDate(expiresAt) ||
    expiresAt.getTime() <= nowMs + TOKEN_REFRESH_SKEW_MS
  );
}

export function encryptDiscordToken(
  plaintext: string,
  secret: string,
  context: string,
): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty Discord token.");
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    deriveEncryptionKey(secret),
    iv,
    { authTagLength: ENCRYPTION_TAG_BYTES },
  );
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptDiscordToken(
  encrypted: string,
  secret: string,
  context: string,
): string {
  const [version, ivEncoded, ciphertextEncoded, tagEncoded, extra] =
    encrypted.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivEncoded ||
    !ciphertextEncoded ||
    !tagEncoded ||
    !BASE64URL_PATTERN.test(ivEncoded) ||
    !BASE64URL_PATTERN.test(ciphertextEncoded) ||
    !BASE64URL_PATTERN.test(tagEncoded) ||
    extra
  ) {
    throw new Error("Encrypted Discord token has an invalid format.");
  }

  const iv = Buffer.from(ivEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  if (
    iv.length !== ENCRYPTION_IV_BYTES ||
    tag.length !== ENCRYPTION_TAG_BYTES ||
    ciphertext.length === 0
  ) {
    throw new Error("Encrypted Discord token has invalid components.");
  }

  try {
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      deriveEncryptionKey(secret),
      iv,
      { authTagLength: ENCRYPTION_TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted Discord token authentication failed.");
  }
}

export function canManageGuild(permissions: string, isOwner: boolean): boolean {
  if (isOwner) return true;
  if (!PERMISSIONS_PATTERN.test(permissions)) return false;
  try {
    const granted = BigInt(permissions);
    return (
      (granted & ADMINISTRATOR) === ADMINISTRATOR ||
      (granted & MANAGE_GUILD) === MANAGE_GUILD
    );
  } catch {
    return false;
  }
}

export function parseManagedDiscordGuilds(
  value: unknown,
): ManagedDiscordGuild[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;

  const guilds: ManagedDiscordGuild[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = parseSnowflake(item.id);
    const name = parseBoundedString(item.name, 1, 100);
    const permissions = parseDecimalString(item.permissions);
    const owner = item.owner === undefined ? false : item.owner;
    const icon = parseOptionalNullableString(item.icon, 256);
    if (
      !id ||
      !name ||
      !permissions ||
      typeof owner !== "boolean" ||
      icon === undefined
    ) {
      return null;
    }

    const manageable = canManageGuild(permissions, owner);
    if (!manageable) continue;
    guilds.push({
      id,
      name,
      ...(icon
        ? {
            iconUrl: `https://cdn.discordapp.com/icons/${id}/${encodeURIComponent(icon)}.png?size=128`,
          }
        : {}),
      isOwner: owner,
      permissions,
      canManage: true,
    });
  }
  return guilds;
}

export function parseStoredDiscordAuthSession(
  value: unknown,
  now: Date = new Date(),
  expectedTokenHash?: string,
): DiscordAuthSessionWithAccount | null {
  if (!isRecord(value) || !isRecord(value.account) || !isRecord(value.session))
    return null;
  const account = parseStoredDiscordAccount(value.account);
  const session = value.session;
  if (
    !account ||
    !("revokedAt" in session) ||
    !("lastSeenAt" in session) ||
    typeof session.tokenHash !== "string" ||
    !SESSION_HASH_PATTERN.test(session.tokenHash) ||
    (expectedTokenHash !== undefined &&
      session.tokenHash !== expectedTokenHash) ||
    session.discordUserId !== account.discordUserId ||
    !isValidDate(session.expiresAt) ||
    session.expiresAt <= now ||
    session.revokedAt !== null ||
    (session.lastSeenAt !== null && !isValidDate(session.lastSeenAt)) ||
    !isValidDate(session.createdAt) ||
    !isValidDate(session.updatedAt)
  ) {
    return null;
  }
  return {
    account,
    session: session as unknown as DiscordAuthSessionWithAccount["session"],
  };
}

export function isPostOriginAllowed(
  origin: string | null,
  appUrl: string,
): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

export async function createDiscordSessionFromCode(
  code: string,
): Promise<CreatedDiscordSession> {
  if (!isDiscordAuthConfigured()) {
    throw new Error("Discord OAuth is not configured.");
  }
  if (!code || code.length > 1_024) {
    throw new Error("Discord OAuth code is invalid.");
  }

  const token = await exchangeDiscordToken({
    code,
    grantType: "authorization_code",
  });
  const { user } = await fetchDiscordIdentity(token.accessToken);
  const secret = getSessionSecret();
  const avatarUrl = buildDiscordAvatarUrl(user);
  await runSessionStoreOperation(() =>
    upsertDiscordAccount({
      discordUserId: user.id,
      username: user.username,
      globalName: user.globalName,
      avatarUrl,
      accessTokenEncrypted: encryptDiscordToken(
        token.accessToken,
        secret,
        tokenEncryptionContext(user.id, "access"),
      ),
      refreshTokenEncrypted: encryptDiscordToken(
        token.refreshToken,
        secret,
        tokenEncryptionContext(user.id, "refresh"),
      ),
      tokenExpiresAt: token.expiresAt,
    }),
  );

  const sessionToken = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await runSessionStoreOperation(() =>
    createDiscordAuthSession({
      tokenHash: hashSessionToken(sessionToken),
      discordUserId: user.id,
      expiresAt,
    }),
  );
  return { expiresAt, sessionToken };
}

export async function setDiscordSessionCookie(
  created: CreatedDiscordSession,
  dependencies: DiscordSessionCookieDependencies = sessionCookieDependencies(),
): Promise<void> {
  const cookieStore = await dependencies.getCookieStore();
  const displacedSessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (
    displacedSessionToken &&
    SESSION_TOKEN_PATTERN.test(displacedSessionToken) &&
    displacedSessionToken !== created.sessionToken
  ) {
    if (!dependencies.hasSessionStore()) {
      queuePendingSessionRevocation(
        cookieStore,
        hashSessionToken(created.sessionToken),
        dependencies,
      );
      throw new DiscordAuthUnavailableError(
        "Discord session storage is not configured.",
      );
    }
    try {
      await runSessionStoreOperation(() =>
        dependencies.revokeSession(hashSessionToken(displacedSessionToken)),
      );
    } catch (error) {
      queuePendingSessionRevocation(
        cookieStore,
        hashSessionToken(created.sessionToken),
        dependencies,
      );
      throw error;
    }
  }
  cookieStore.set(SESSION_COOKIE, created.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: dependencies.appUrl().startsWith("https://"),
    expires: created.expiresAt,
    path: "/",
  });
}

export async function clearDiscordSessionCookie(
  dependencies: DiscordSessionCookieDependencies = sessionCookieDependencies(),
): Promise<DiscordLogoutResult> {
  const cookieStore = await dependencies.getCookieStore();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);
  if (!sessionToken || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
    return {
      revocationPending:
        parsePendingSessionRevocations(
          cookieStore.get(PENDING_REVOCATIONS_COOKIE)?.value,
        ).length > 0,
    };
  }
  const tokenHash = hashSessionToken(sessionToken);
  if (!dependencies.hasSessionStore()) {
    queuePendingSessionRevocation(cookieStore, tokenHash, dependencies);
    console.error(
      "PipHackLup cleared the browser session but could not revoke it in storage.",
    );
    return { revocationPending: true };
  }
  try {
    await runSessionStoreOperation(() => dependencies.revokeSession(tokenHash));
    const remaining = removePendingSessionRevocation(
      cookieStore,
      tokenHash,
      dependencies,
    );
    return { revocationPending: remaining > 0 };
  } catch {
    queuePendingSessionRevocation(cookieStore, tokenHash, dependencies);
    console.error(
      "PipHackLup cleared the browser session but could not revoke it in storage.",
    );
    return { revocationPending: true };
  }
}

export async function retryPendingDiscordSessionRevocations(
  dependencies: DiscordSessionCookieDependencies = sessionCookieDependencies(),
): Promise<number> {
  const cookieStore = await dependencies.getCookieStore();
  const pending = parsePendingSessionRevocations(
    cookieStore.get(PENDING_REVOCATIONS_COOKIE)?.value,
  );
  if (!pending.length) return 0;
  if (!dependencies.hasSessionStore()) return pending.length;

  const remaining: string[] = [];
  for (const tokenHash of pending) {
    try {
      await runSessionStoreOperation(() =>
        dependencies.revokeSession(tokenHash),
      );
    } catch {
      remaining.push(tokenHash);
    }
  }
  writePendingSessionRevocations(cookieStore, remaining, dependencies);
  if (remaining.length) {
    console.error(
      "PipHackLup could not finish one or more pending session revocations.",
    );
  }
  return remaining.length;
}

export async function hasPendingDiscordSessionRevocations(
  dependencies: DiscordSessionCookieDependencies = sessionCookieDependencies(),
): Promise<boolean> {
  const cookieStore = await dependencies.getCookieStore();
  return (
    parsePendingSessionRevocations(
      cookieStore.get(PENDING_REVOCATIONS_COOKIE)?.value,
    ).length > 0
  );
}

function sessionCookieDependencies(): DiscordSessionCookieDependencies {
  return {
    getCookieStore: async () =>
      (await cookies()) as unknown as DiscordSessionCookieStore,
    revokeSession: revokeDiscordAuthSession,
    hasSessionStore: () => hasDiscordSessionStoreConfiguration(process.env),
    appUrl: getAppUrl,
    now: Date.now,
  };
}

function queuePendingSessionRevocation(
  cookieStore: DiscordSessionCookieStore,
  tokenHash: string,
  dependencies: DiscordSessionCookieDependencies,
): void {
  const pending = parsePendingSessionRevocations(
    cookieStore.get(PENDING_REVOCATIONS_COOKIE)?.value,
  );
  const combined = [...new Set([...pending, tokenHash])];
  if (combined.length > MAX_PENDING_SESSION_REVOCATIONS) {
    console.error(
      "PipHackLup reached the browser limit for pending session revocations.",
    );
  }
  writePendingSessionRevocations(
    cookieStore,
    combined.slice(-MAX_PENDING_SESSION_REVOCATIONS),
    dependencies,
  );
}

function removePendingSessionRevocation(
  cookieStore: DiscordSessionCookieStore,
  tokenHash: string,
  dependencies: DiscordSessionCookieDependencies,
): number {
  const pending = parsePendingSessionRevocations(
    cookieStore.get(PENDING_REVOCATIONS_COOKIE)?.value,
  ).filter((candidate) => candidate !== tokenHash);
  writePendingSessionRevocations(cookieStore, pending, dependencies);
  return pending.length;
}

function writePendingSessionRevocations(
  cookieStore: DiscordSessionCookieStore,
  tokenHashes: string[],
  dependencies: DiscordSessionCookieDependencies,
): void {
  if (!tokenHashes.length) {
    cookieStore.delete(PENDING_REVOCATIONS_COOKIE);
    return;
  }
  cookieStore.set(PENDING_REVOCATIONS_COOKIE, tokenHashes.join("."), {
    httpOnly: true,
    sameSite: "strict",
    secure: dependencies.appUrl().startsWith("https://"),
    expires: new Date(dependencies.now() + SESSION_DURATION_MS),
    path: "/",
  });
}

function parsePendingSessionRevocations(value: string | undefined): string[] {
  if (!value || value.length > MAX_PENDING_SESSION_REVOCATIONS * (64 + 1))
    return [];
  const hashes = value.split(".");
  if (!hashes.length || hashes.length > MAX_PENDING_SESSION_REVOCATIONS)
    return [];
  return hashes.every((hash) => SESSION_HASH_PATTERN.test(hash)) ? hashes : [];
}

export async function readDiscordSession(): Promise<DiscordSession | null> {
  if (!isDiscordAuthConfigured()) return null;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken || !SESSION_TOKEN_PATTERN.test(sessionToken)) return null;
  const tokenHash = hashSessionToken(sessionToken);
  const now = new Date();

  const stored = await runSessionStoreOperation(() =>
    getActiveDiscordAuthSession(tokenHash, now),
  );
  if (!stored) return null;
  const loaded = parseStoredDiscordAuthSession(stored, now, tokenHash);
  if (!loaded) {
    throw new DiscordAuthUnavailableError(
      "Stored Discord authentication data is invalid.",
    );
  }

  let authorizationTokenVersion = loaded.account.tokenVersion;
  try {
    let authorized = await getAuthorizedAccessToken(loaded.account, false);
    authorizationTokenVersion = authorized.account.tokenVersion;
    let identity;
    try {
      identity = await fetchDiscordIdentity(authorized.accessToken);
    } catch (error) {
      if (
        !(error instanceof DiscordApiError) ||
        (error.status !== 401 && error.status !== 403)
      )
        throw error;
      authorized = await getAuthorizedAccessToken(authorized.account, true);
      authorizationTokenVersion = authorized.account.tokenVersion;
      identity = await fetchDiscordIdentity(authorized.accessToken);
    }

    if (identity.user.id !== loaded.account.discordUserId) {
      throw new DiscordAuthorizationError("Discord account identity changed.");
    }

    const avatarUrl = buildDiscordAvatarUrl(identity.user);
    const [, sessionStillActive] = await Promise.all([
      runSessionStoreOperation(() =>
        updateDiscordAccountIdentity({
          discordUserId: identity.user.id,
          username: identity.user.username,
          globalName: identity.user.globalName,
          avatarUrl,
        }),
      ),
      runSessionStoreOperation(() => touchDiscordAuthSession(tokenHash)),
    ]);
    if (!sessionStillActive) return null;

    return {
      user: {
        id: identity.user.id,
        username: identity.user.username,
        ...(identity.user.globalName
          ? { globalName: identity.user.globalName }
          : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      guilds: identity.guilds,
      issuedAt: loaded.session.createdAt.getTime(),
    };
  } catch (error) {
    if (
      error instanceof DiscordAuthorizationError ||
      (error instanceof DiscordApiError &&
        (error.status === 401 || error.status === 403))
    ) {
      const revoked = await runSessionStoreOperation(() =>
        revokeDiscordAuthSessionsForAccountIfTokenVersion(
          loaded.account.discordUserId,
          authorizationTokenVersion,
        ),
      );
      if (revoked) return null;

      const stillActive = await runSessionStoreOperation(() =>
        getActiveDiscordAuthSession(tokenHash),
      );
      if (!stillActive) return null;
      throw new DiscordAuthUnavailableError(
        "Discord credentials changed while authorization was checked.",
      );
    }
    throw error;
  }
}

export function findManagedGuild(
  session: DiscordSession,
  guildId: string,
): ManagedDiscordGuild | null {
  return session.guilds.find((guild) => guild.id === guildId) ?? null;
}

async function getAuthorizedAccessToken(
  account: DiscordAccountRecord,
  forceRefresh: boolean,
): Promise<{ account: DiscordAccountRecord; accessToken: string }> {
  const secret = getSessionSecret();
  if (!forceRefresh && !shouldRefreshDiscordToken(account.tokenExpiresAt)) {
    return { account, accessToken: decryptStoredAccessToken(account, secret) };
  }

  return refreshDiscordAccessTokenWithLease(account, secret);
}

export async function refreshDiscordAccessTokenWithLease(
  initialAccount: DiscordAccountRecord,
  secret: string,
  dependencies: DiscordTokenRefreshDependencies = createDiscordTokenRefreshDependencies(),
): Promise<{ account: DiscordAccountRecord; accessToken: string }> {
  let account = requireStoredDiscordAccount(initialAccount);
  const deadline = dependencies.now() + TOKEN_REFRESH_WAIT_TIMEOUT_MS;

  for (let attempt = 0; attempt < 125; attempt += 1) {
    const nowMs = dependencies.now();
    if (nowMs > deadline) break;

    const leaseId = dependencies.createLeaseId();
    if (!REFRESH_LEASE_PATTERN.test(leaseId)) {
      throw new DiscordAuthUnavailableError(
        "Discord token refresh coordination is unavailable.",
      );
    }

    const leasedValue = await runSessionStoreOperation(() =>
      dependencies.acquireLease({
        discordUserId: account.discordUserId,
        expectedTokenVersion: account.tokenVersion,
        leaseId,
        leaseExpiresAt: new Date(nowMs + TOKEN_REFRESH_LEASE_MS),
        now: new Date(nowMs),
      }),
    );
    if (leasedValue) {
      const leased = requireStoredDiscordAccount(leasedValue);
      if (
        leased.tokenVersion !== account.tokenVersion ||
        leased.tokenRefreshLeaseId !== leaseId
      ) {
        throw new DiscordAuthUnavailableError(
          "Discord token refresh coordination is invalid.",
        );
      }

      try {
        const refreshToken = decryptStoredRefreshToken(leased, secret);
        const token = await dependencies.exchangeRefreshToken(refreshToken);
        const completedValue = await runSessionStoreOperation(() =>
          dependencies.completeRefresh({
            discordUserId: leased.discordUserId,
            expectedTokenVersion: leased.tokenVersion,
            leaseId,
            accessTokenEncrypted: encryptDiscordToken(
              token.accessToken,
              secret,
              tokenEncryptionContext(leased.discordUserId, "access"),
            ),
            refreshTokenEncrypted: encryptDiscordToken(
              token.refreshToken,
              secret,
              tokenEncryptionContext(leased.discordUserId, "refresh"),
            ),
            tokenExpiresAt: token.expiresAt,
          }),
        );
        if (completedValue) {
          return {
            account: requireStoredDiscordAccount(completedValue),
            accessToken: token.accessToken,
          };
        }

        const current = await loadDiscordAccountForRefresh(
          leased.discordUserId,
          dependencies,
        );
        const recovered = recoverNewerDiscordAccessToken(
          leased,
          current,
          secret,
          dependencies.now(),
        );
        if (recovered) return recovered;
        throw new DiscordAuthUnavailableError(
          "Discord token refresh could not be committed.",
        );
      } catch (error) {
        await runSessionStoreOperation(() =>
          dependencies.releaseLease({
            discordUserId: leased.discordUserId,
            expectedTokenVersion: leased.tokenVersion,
            leaseId,
          }),
        );

        if (error instanceof DiscordAuthorizationError) {
          const current = await loadDiscordAccountForRefresh(
            leased.discordUserId,
            dependencies,
          );
          const recovered = recoverNewerDiscordAccessToken(
            leased,
            current,
            secret,
            dependencies.now(),
          );
          if (recovered) return recovered;
        }
        throw error;
      }
    }

    const current = await loadDiscordAccountForRefresh(
      account.discordUserId,
      dependencies,
    );
    if (!current) {
      throw new DiscordAuthorizationError("Discord account no longer exists.");
    }
    if (current.tokenVersion < account.tokenVersion) {
      throw new DiscordAuthUnavailableError(
        "Stored Discord token version is invalid.",
      );
    }
    const recovered = recoverNewerDiscordAccessToken(
      account,
      current,
      secret,
      nowMs,
    );
    if (recovered) return recovered;

    account = current;
    await dependencies.wait(TOKEN_REFRESH_POLL_MS);
  }

  throw new DiscordAuthUnavailableError(
    "Discord token refresh is temporarily busy.",
  );
}

function createDiscordTokenRefreshDependencies(): DiscordTokenRefreshDependencies {
  return {
    acquireLease: acquireDiscordAccountTokenRefreshLease,
    completeRefresh: completeDiscordAccountTokenRefresh,
    createLeaseId: () => randomBytes(18).toString("base64url"),
    exchangeRefreshToken: (refreshToken) =>
      exchangeDiscordToken({ grantType: "refresh_token", refreshToken }),
    getAccount: getDiscordAccount,
    now: () => Date.now(),
    releaseLease: releaseDiscordAccountTokenRefreshLease,
    wait: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

async function loadDiscordAccountForRefresh(
  discordUserId: string,
  dependencies: DiscordTokenRefreshDependencies,
): Promise<DiscordAccountRecord | null> {
  const value = await runSessionStoreOperation(() =>
    dependencies.getAccount(discordUserId),
  );
  return value ? requireStoredDiscordAccount(value) : null;
}

function recoverNewerDiscordAccessToken(
  previous: DiscordAccountRecord,
  current: DiscordAccountRecord | null,
  secret: string,
  nowMs: number,
): { account: DiscordAccountRecord; accessToken: string } | null {
  if (
    !current ||
    current.tokenVersion <= previous.tokenVersion ||
    current.tokenExpiresAt.getTime() <= nowMs
  ) {
    return null;
  }
  return {
    account: current,
    accessToken: decryptStoredAccessToken(current, secret),
  };
}

function decryptStoredAccessToken(
  account: DiscordAccountRecord,
  secret: string,
): string {
  try {
    return decryptDiscordToken(
      account.accessTokenEncrypted,
      secret,
      tokenEncryptionContext(account.discordUserId, "access"),
    );
  } catch {
    throw new DiscordAuthorizationError("Stored Discord token is unavailable.");
  }
}

function decryptStoredRefreshToken(
  account: DiscordAccountRecord,
  secret: string,
): string {
  try {
    return decryptDiscordToken(
      account.refreshTokenEncrypted,
      secret,
      tokenEncryptionContext(account.discordUserId, "refresh"),
    );
  } catch {
    throw new DiscordAuthorizationError("Stored Discord token is unavailable.");
  }
}

async function exchangeDiscordToken(
  input:
    | { code: string; grantType: "authorization_code" }
    | { grantType: "refresh_token"; refreshToken: string },
): Promise<ParsedDiscordToken> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth is not configured.");
  }
  const body = buildDiscordTokenRequest(
    input.grantType === "authorization_code"
      ? {
          code: input.code,
          grantType: input.grantType,
          redirectUri: getDiscordRedirectUri(),
        }
      : input,
    { clientId, clientSecret },
  );

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new DiscordAuthorizationError("Discord rejected the OAuth token.");
    }
    throw new DiscordApiError(response.status, "OAuth token exchange");
  }
  const parsed = parseDiscordTokenResponse(await response.json());
  if (!parsed) {
    throw new DiscordAuthorizationError("Discord returned an invalid token.");
  }
  return parsed;
}

async function fetchDiscordIdentity(accessToken: string): Promise<{
  guilds: ManagedDiscordGuild[];
  user: ParsedDiscordUser;
}> {
  const [userValue, guildValue] = await Promise.all([
    fetchDiscordJson("/users/@me", accessToken, "user lookup"),
    fetchDiscordJson(
      "/users/@me/guilds?limit=200",
      accessToken,
      "guild lookup",
    ),
  ]);
  const user = parseDiscordUserResponse(userValue);
  const guilds = parseManagedDiscordGuilds(guildValue);
  if (!user || !guilds) {
    throw new DiscordAuthorizationError(
      "Discord identity response is invalid.",
    );
  }
  return { guilds, user };
}

async function fetchDiscordJson(
  path: string,
  accessToken: string,
  operation: string,
): Promise<unknown> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DiscordApiError(response.status, operation);
  return response.json() as Promise<unknown>;
}

function parseDiscordUserResponse(value: unknown): ParsedDiscordUser | null {
  if (!isRecord(value)) return null;
  const id = parseSnowflake(value.id);
  const username = parseBoundedString(value.username, 1, 32);
  const globalName = parseOptionalNullableString(value.global_name, 100);
  const avatarHash = parseOptionalNullableString(value.avatar, 256);
  if (!id || !username || globalName === undefined || avatarHash === undefined)
    return null;
  return { avatarHash, globalName, id, username };
}

export function parseDiscordTokenResponse(
  value: unknown,
  nowMs: number = Date.now(),
): ParsedDiscordToken | null {
  if (!isRecord(value)) return null;
  const accessToken = parseBoundedString(value.access_token, 1, 4_096);
  const refreshToken = parseBoundedString(value.refresh_token, 1, 4_096);
  const tokenType = parseBoundedString(value.token_type, 1, 32);
  const expiresIn = value.expires_in;
  if (
    !accessToken ||
    !refreshToken ||
    tokenType?.toLowerCase() !== "bearer" ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    expiresIn > 366 * 24 * 60 * 60
  ) {
    return null;
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(nowMs + expiresIn * 1_000),
  };
}

function buildDiscordAvatarUrl(user: ParsedDiscordUser): string | null {
  return user.avatarHash
    ? `https://cdn.discordapp.com/avatars/${user.id}/${encodeURIComponent(user.avatarHash)}.png?size=128`
    : null;
}

function tokenEncryptionContext(
  discordUserId: string,
  kind: DiscordTokenKind,
): string {
  return `piphacklup:discord-oauth:${discordUserId}:${kind}:v1`;
}

function deriveEncryptionKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("NEXTAUTH_SECRET must contain at least 32 bytes.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("piphacklup-auth", "utf8"),
      Buffer.from("discord-token-encryption-v1", "utf8"),
      32,
    ),
  );
}

function getSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("NEXTAUTH_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function requireStoredDiscordAccount(value: unknown): DiscordAccountRecord {
  const account = parseStoredDiscordAccount(value);
  if (!account) {
    throw new DiscordAuthUnavailableError(
      "Stored Discord account data is invalid.",
    );
  }
  return account;
}

function parseStoredDiscordAccount(
  value: unknown,
): DiscordAccountRecord | null {
  if (
    !isRecord(value) ||
    !("globalName" in value) ||
    !("avatarUrl" in value) ||
    !("tokenRefreshLeaseId" in value) ||
    !("tokenRefreshLeaseExpiresAt" in value) ||
    !parseSnowflake(value.discordUserId) ||
    !parseBoundedString(value.username, 1, 32) ||
    parseOptionalNullableString(value.globalName, 100) === undefined ||
    parseOptionalNullableString(value.avatarUrl, 2_048) === undefined ||
    !isEncryptedToken(value.accessTokenEncrypted) ||
    !isEncryptedToken(value.refreshTokenEncrypted) ||
    !isValidDate(value.tokenExpiresAt) ||
    typeof value.tokenVersion !== "number" ||
    !Number.isSafeInteger(value.tokenVersion) ||
    value.tokenVersion < 1 ||
    !isValidDate(value.createdAt) ||
    !isValidDate(value.updatedAt)
  ) {
    return null;
  }

  const leaseId = value.tokenRefreshLeaseId;
  const leaseExpiresAt = value.tokenRefreshLeaseExpiresAt;
  if (
    (leaseId !== null &&
      (typeof leaseId !== "string" || !REFRESH_LEASE_PATTERN.test(leaseId))) ||
    (leaseExpiresAt !== null && !isValidDate(leaseExpiresAt)) ||
    (leaseId === null) !== (leaseExpiresAt === null)
  ) {
    return null;
  }

  return value as unknown as DiscordAccountRecord;
}

async function runSessionStoreOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DiscordAuthUnavailableError) throw error;
    throw new DiscordAuthUnavailableError(
      "Discord session storage is temporarily unavailable.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isEncryptedToken(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const [version, ivEncoded, ciphertextEncoded, tagEncoded, extra] =
    value.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivEncoded ||
    !ciphertextEncoded ||
    !tagEncoded ||
    !BASE64URL_PATTERN.test(ivEncoded) ||
    !BASE64URL_PATTERN.test(ciphertextEncoded) ||
    !BASE64URL_PATTERN.test(tagEncoded) ||
    extra
  )
    return false;
  try {
    return (
      Buffer.from(ivEncoded, "base64url").length === ENCRYPTION_IV_BYTES &&
      Buffer.from(ciphertextEncoded, "base64url").length > 0 &&
      Buffer.from(tagEncoded, "base64url").length === ENCRYPTION_TAG_BYTES
    );
  } catch {
    return false;
  }
}

function parseSnowflake(value: unknown): string | null {
  return typeof value === "string" && SNOWFLAKE_PATTERN.test(value)
    ? value
    : null;
}

function parseDecimalString(value: unknown): string | null {
  if (typeof value !== "string" || !PERMISSIONS_PATTERN.test(value))
    return null;
  try {
    BigInt(value);
    return value;
  } catch {
    return null;
  }
}

function parseBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  return typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength
    ? value
    : null;
}

function parseOptionalNullableString(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.length <= maximumLength
    ? value
    : undefined;
}
