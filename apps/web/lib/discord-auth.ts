import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "piphacklup_discord_session";
const STATE_COOKIE = "piphacklup_oauth_state";
const DISCORD_API = "https://discord.com/api/v10";
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

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

interface DiscordUserResponse {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordGuildResponse {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions: string;
}

export function isDiscordAuthConfigured(): boolean {
  return Boolean(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.NEXTAUTH_SECRET,
  );
}

export function getDiscordAuthorizeUrl(state: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) throw new Error("DISCORD_CLIENT_ID is required.");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getDiscordRedirectUri(),
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function getDiscordRedirectUri(): string {
  return `${getAppUrl()}/api/auth/discord/callback`;
}

export function getAppUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function createOauthState(): string {
  return randomBytes(24).toString("base64url");
}

export async function setOauthStateCookie(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getAppUrl().startsWith("https://"),
    maxAge: 60 * 10,
    path: "/",
  });
}

export async function consumeOauthStateCookie(
  state: string | null,
): Promise<boolean> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  return Boolean(stored && state && stored === state);
}

export async function createDiscordSessionFromCode(
  code: string,
): Promise<DiscordSession> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth is not configured.");
  }

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordRedirectUri(),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Discord rejected the OAuth code.");
  }

  const token = (await tokenResponse.json()) as { access_token: string };
  const [user, guilds] = await Promise.all([
    fetchDiscord<DiscordUserResponse>("/users/@me", token.access_token),
    fetchDiscord<DiscordGuildResponse[]>(
      "/users/@me/guilds",
      token.access_token,
    ),
  ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      ...(user.global_name ? { globalName: user.global_name } : {}),
      ...(user.avatar
        ? {
            avatarUrl: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`,
          }
        : {}),
    },
    guilds: guilds
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        ...(guild.icon
          ? {
              iconUrl: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`,
            }
          : {}),
        isOwner: guild.owner === true,
        permissions: guild.permissions,
        canManage: canManageGuild(guild.permissions, guild.owner === true),
      }))
      .filter((guild) => guild.canManage)
      .slice(0, 25),
    issuedAt: Date.now(),
  };
}

export async function setDiscordSessionCookie(
  session: DiscordSession,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: getAppUrl().startsWith("https://"),
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
  });
}

export async function clearDiscordSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function readDiscordSession(): Promise<DiscordSession | null> {
  if (!process.env.NEXTAUTH_SECRET) return null;
  const cookieStore = await cookies();
  const signed = cookieStore.get(SESSION_COOKIE)?.value;
  if (!signed) return null;
  return verifySession(signed);
}

export function findManagedGuild(
  session: DiscordSession,
  guildId: string,
): ManagedDiscordGuild | null {
  return session.guilds.find((guild) => guild.id === guildId) ?? null;
}

async function fetchDiscord<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Discord API failed for ${path}.`);
  return (await response.json()) as T;
}

function canManageGuild(permissions: string, isOwner: boolean): boolean {
  if (isOwner) return true;
  const granted = BigInt(permissions);
  return (
    (granted & ADMINISTRATOR) === ADMINISTRATOR ||
    (granted & MANAGE_GUILD) === MANAGE_GUILD
  );
}

function signSession(session: DiscordSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(signed: string): DiscordSession | null {
  const [payload, signature] = signed.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null;

  try {
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as DiscordSession;
  } catch {
    return null;
  }
}

function getSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error("NEXTAUTH_SECRET is required for dashboard auth.");
  return secret;
}
