import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH_ORIGIN = "https://discord.com";
const DISCORD_OAUTH_PATH = "/oauth2/authorize";
const SNOWFLAKE_PATTERN = /^[1-9]\d{16,19}$/u;
const COMMAND_NAME_PATTERN = /^[a-z0-9_-]{1,32}$/u;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{32}$/u;
const REDIRECT_STATUSES = new Set([302, 303, 307]);
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MUTATION_ARGUMENTS = new Set([
  "--deploy",
  "--install",
  "--leave-guild",
  "--mutate",
  "--register-commands",
  "--remove",
  "--setup",
  "--write",
]);

export const PRODUCTION_FIXTURE_PATHS = Object.freeze([
  "/dev-fixtures/control-room",
  "/dev-fixtures/training",
]);

export const EXPECTED_COMMAND_NAMES = Object.freeze([
  "ask",
  "train",
  "setup",
  "onboard",
  "queue",
  "team",
  "mod",
]);

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_JSON_BYTES = 1_000_000;

export class VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VerificationError";
  }
}

export function parseArguments(argv) {
  const parsed = {
    allowLocalHttp: false,
    discordReadOnly: false,
    expectedCommands: [],
    help: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  const singletonOptions = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      MUTATION_ARGUMENTS.has(argument) ||
      [...MUTATION_ARGUMENTS].some((item) => argument.startsWith(`${item}=`))
    ) {
      throw new VerificationError(
        `Mutation option ${argument.split("=", 1)[0]} is forbidden; this verifier is read-only.`,
      );
    }

    switch (argument) {
      case "--allow-local-http":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.allowLocalHttp = true;
        break;
      case "--base-url":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.baseUrl = readArgumentValue(argv, ++index, argument);
        break;
      case "--discord-read-only":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.discordReadOnly = true;
        break;
      case "--expected-command":
        parsed.expectedCommands.push(
          readArgumentValue(argv, ++index, argument),
        );
        break;
      case "--expected-client-id":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.expectedClientId = readArgumentValue(argv, ++index, argument);
        break;
      case "--expected-guild-name":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.expectedGuildName = readArgumentValue(argv, ++index, argument);
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--test-guild-id":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.testGuildId = readArgumentValue(argv, ++index, argument);
        break;
      case "--timeout-ms":
        assertOptionUsedOnce(singletonOptions, argument);
        parsed.timeoutMs = parseTimeout(
          readArgumentValue(argv, ++index, argument),
        );
        break;
      default:
        throw new VerificationError(
          `Unknown option ${safeArgumentLabel(argument)}.`,
        );
    }
  }

  return parsed;
}

export function buildConfiguration(parsed, environment = process.env) {
  if (!parsed.baseUrl) {
    throw new VerificationError("--base-url is required.");
  }
  if (
    !parsed.expectedClientId ||
    !SNOWFLAKE_PATTERN.test(parsed.expectedClientId)
  ) {
    throw new VerificationError(
      "--expected-client-id must be the deployed Discord application's snowflake.",
    );
  }

  const configuration = {
    baseUrl: normalizeBaseUrl(parsed.baseUrl, parsed.allowLocalHttp),
    expectedDiscordClientId: parsed.expectedClientId,
    timeoutMs: parsed.timeoutMs,
  };

  const hasDiscordArguments = Boolean(
    parsed.testGuildId ||
    parsed.expectedGuildName ||
    parsed.expectedCommands.length > 0,
  );
  if (!parsed.discordReadOnly && hasDiscordArguments) {
    throw new VerificationError(
      "Discord guild options require the explicit --discord-read-only flag.",
    );
  }
  if (!parsed.discordReadOnly) return configuration;

  const clientId = environment.DISCORD_CLIENT_ID;
  const token = environment.DISCORD_TOKEN;
  if (!clientId || !SNOWFLAKE_PATTERN.test(clientId)) {
    throw new VerificationError(
      "DISCORD_CLIENT_ID must contain the isolated bot application's snowflake.",
    );
  }
  if (clientId !== configuration.expectedDiscordClientId) {
    throw new VerificationError(
      "DISCORD_CLIENT_ID does not match --expected-client-id.",
    );
  }
  if (!isUsableToken(token)) {
    throw new VerificationError(
      "DISCORD_TOKEN must be supplied through the environment for read-only Discord verification.",
    );
  }
  if (!parsed.testGuildId || !SNOWFLAKE_PATTERN.test(parsed.testGuildId)) {
    throw new VerificationError(
      "--test-guild-id must be the exact isolated Discord test-server snowflake.",
    );
  }
  if (!isExpectedGuildName(parsed.expectedGuildName)) {
    throw new VerificationError(
      "--expected-guild-name is required and must exactly name the isolated test server.",
    );
  }

  const expectedCommands =
    parsed.expectedCommands.length > 0
      ? parsed.expectedCommands
      : [...EXPECTED_COMMAND_NAMES];
  assertExpectedCommands(expectedCommands);

  configuration.discord = {
    clientId,
    expectedCommands: [...new Set(expectedCommands)].toSorted(),
    expectedGuildName: parsed.expectedGuildName,
    testGuildId: parsed.testGuildId,
    token,
  };
  return configuration;
}

export function normalizeBaseUrl(value, allowLocalHttp = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new VerificationError("--base-url must be a valid absolute URL.");
  }

  if (url.username || url.password) {
    throw new VerificationError("--base-url must not contain credentials.");
  }
  if (url.search || url.hash) {
    throw new VerificationError(
      "--base-url must not contain a query string or fragment.",
    );
  }
  if (url.pathname !== "/") {
    throw new VerificationError("--base-url must be an origin without a path.");
  }

  const isAllowedLocalHttp =
    allowLocalHttp &&
    url.protocol === "http:" &&
    LOCAL_HTTP_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !isAllowedLocalHttp) {
    throw new VerificationError(
      "--base-url must use HTTPS; loopback HTTP requires --allow-local-http.",
    );
  }
  return url.origin;
}

export async function readOnlyFetch(fetchImplementation, url, options = {}) {
  const method = String(options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new VerificationError(
      `HTTP ${method} is forbidden; live verification is read-only.`,
    );
  }
  if (options.body !== undefined && options.body !== null) {
    throw new VerificationError(
      "Request bodies are forbidden during read-only verification.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  headers.set("user-agent", "PipHackLup-release-verifier/1.0");

  return fetchImplementation(url, {
    cache: "no-store",
    headers,
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function verifyWebRelease(
  configuration,
  fetchImplementation = fetch,
) {
  const results = [];
  const healthResponse = await requestReadOnly(
    fetchImplementation,
    new URL("/api/health", configuration.baseUrl),
    {
      label: "Web health",
      timeoutMs: configuration.timeoutMs,
    },
  );
  assertStatus(healthResponse, 200, "Web health");
  const health = await readJson(healthResponse, "Web health");
  if (
    !isRecord(health) ||
    health.ok !== true ||
    health.app !== "PipHackLup web" ||
    health.status !== "ready"
  ) {
    throw new VerificationError(
      "Web health did not report PipHackLup as ready.",
    );
  }
  if (!hasNoStoreDirective(healthResponse.headers.get("cache-control"))) {
    throw new VerificationError(
      "Web health is missing the required no-store cache directive.",
    );
  }
  results.push({ check: "web-health", detail: "ready" });

  const authResponse = await requestReadOnly(
    fetchImplementation,
    new URL("/api/auth/discord/start", configuration.baseUrl),
    {
      accept: "text/html,application/xhtml+xml",
      label: "Discord OAuth start",
      timeoutMs: configuration.timeoutMs,
    },
  );
  verifyOauthRedirect(
    authResponse,
    configuration.baseUrl,
    configuration.expectedDiscordClientId,
  );
  results.push({
    check: "discord-oauth-redirect",
    detail: "Discord authorize endpoint and callback verified",
  });

  for (const fixturePath of PRODUCTION_FIXTURE_PATHS) {
    const fixtureResponse = await requestReadOnly(
      fetchImplementation,
      new URL(fixturePath, configuration.baseUrl),
      {
        accept: "text/html,application/xhtml+xml",
        label: `Production fixture ${fixturePath}`,
        timeoutMs: configuration.timeoutMs,
      },
    );
    assertStatus(fixtureResponse, 404, `Production fixture ${fixturePath}`);
    results.push({ check: "fixture-not-exposed", detail: fixturePath });
  }

  return results;
}

export async function verifyDiscordRelease(
  configuration,
  fetchImplementation = fetch,
) {
  if (!configuration.discord) {
    throw new VerificationError(
      "Discord verification was not explicitly configured.",
    );
  }

  const { discord } = configuration;
  const requestDiscord = async (path, label) => {
    const url = new URL(`${DISCORD_API}${path}`);
    if (url.origin !== new URL(DISCORD_API).origin) {
      throw new VerificationError("Discord API origin validation failed.");
    }
    const response = await requestReadOnly(fetchImplementation, url, {
      authorization: `Bot ${discord.token}`,
      label,
      timeoutMs: configuration.timeoutMs,
    });
    assertStatus(response, 200, label);
    return readJson(response, label);
  };

  const application = await requestDiscord(
    "/oauth2/applications/@me",
    "Discord application identity",
  );
  if (!isRecord(application) || application.id !== discord.clientId) {
    throw new VerificationError(
      "Discord credentials do not belong to the expected application.",
    );
  }

  const botUser = await requestDiscord("/users/@me", "Discord bot identity");
  if (
    !isRecord(botUser) ||
    botUser.id !== discord.clientId ||
    botUser.bot !== true
  ) {
    throw new VerificationError(
      "Discord credentials do not identify the expected bot user.",
    );
  }

  const encodedGuildId = encodeURIComponent(discord.testGuildId);
  const guild = await requestDiscord(
    `/guilds/${encodedGuildId}`,
    "Isolated Discord guild",
  );
  if (
    !isRecord(guild) ||
    guild.id !== discord.testGuildId ||
    guild.name !== discord.expectedGuildName
  ) {
    throw new VerificationError(
      "Discord returned a guild that does not exactly match the isolated test server.",
    );
  }

  const member = await requestDiscord(
    `/guilds/${encodedGuildId}/members/${encodeURIComponent(botUser.id)}`,
    "Isolated Discord bot membership",
  );
  if (
    !isRecord(member) ||
    !isRecord(member.user) ||
    member.user.id !== botUser.id ||
    member.user.bot !== true
  ) {
    throw new VerificationError(
      "The expected bot member is not present in the isolated test server.",
    );
  }

  const commands = await requestDiscord(
    `/applications/${encodeURIComponent(discord.clientId)}/guilds/${encodedGuildId}/commands`,
    "Isolated Discord guild commands",
  );
  verifyGuildCommands(commands, discord);

  return [
    {
      check: "discord-application",
      detail: "expected bot application and user verified",
    },
    {
      check: "discord-isolated-guild",
      detail: `exact guild name and bot membership verified`,
    },
    {
      check: "discord-guild-commands",
      detail: `${discord.expectedCommands.length} expected commands registered`,
    },
  ];
}

export async function runVerification(
  configuration,
  fetchImplementation = fetch,
) {
  const web = await verifyWebRelease(configuration, fetchImplementation);
  const discord = configuration.discord
    ? await verifyDiscordRelease(configuration, fetchImplementation)
    : [];
  return {
    discord,
    discordSkipped: !configuration.discord,
    interactiveE2ERequired: true,
    web,
  };
}

export function redactSecrets(value, secrets = []) {
  let output = String(value ?? "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 4) {
      output = output.split(secret).join("[REDACTED]");
    }
  }
  return output
    .replace(/\b(Bot|Bearer)\s+\S+/giu, "$1 [REDACTED]")
    .replace(
      /\b[A-Za-z\d_-]{20,}\.[A-Za-z\d_-]{6,}\.[A-Za-z\d_-]{20,}\b/gu,
      "[REDACTED]",
    );
}

export function collectSecretValues(environment = process.env) {
  return Object.entries(environment)
    .filter(([key, value]) =>
      Boolean(
        value && /(API_KEY|DATABASE_URL|PASSWORD|SECRET|TOKEN)/iu.test(key),
      ),
    )
    .map(([, value]) => value);
}

function verifyOauthRedirect(response, baseUrl, expectedClientId) {
  if (!REDIRECT_STATUSES.has(response.status)) {
    throw new VerificationError(
      `Discord OAuth start returned HTTP ${response.status}; expected a redirect.`,
    );
  }
  if (!hasNoStoreDirective(response.headers.get("cache-control"))) {
    throw new VerificationError(
      "Discord OAuth start is missing the required no-store cache directive.",
    );
  }

  const location = response.headers.get("location");
  let authorizeUrl;
  try {
    authorizeUrl = location ? new URL(location) : null;
  } catch {
    authorizeUrl = null;
  }
  if (
    !authorizeUrl ||
    authorizeUrl.origin !== DISCORD_OAUTH_ORIGIN ||
    authorizeUrl.pathname !== DISCORD_OAUTH_PATH
  ) {
    throw new VerificationError(
      "Discord OAuth start did not redirect to Discord's authorize endpoint.",
    );
  }

  const clientId = authorizeUrl.searchParams.get("client_id");
  const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
  const responseType = authorizeUrl.searchParams.get("response_type");
  const state = authorizeUrl.searchParams.get("state");
  const scopes = new Set(
    (authorizeUrl.searchParams.get("scope") ?? "")
      .split(/\s+/u)
      .filter(Boolean),
  );
  const singularParameters = [
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
  ];
  const expectedCallback = new URL(
    "/api/auth/discord/callback",
    baseUrl,
  ).toString();
  if (
    singularParameters.some(
      (name) => authorizeUrl.searchParams.getAll(name).length !== 1,
    ) ||
    ["client_secret", "token", "access_token"].some((name) =>
      authorizeUrl.searchParams.has(name),
    ) ||
    clientId !== expectedClientId ||
    redirectUri !== expectedCallback ||
    responseType !== "code" ||
    !state ||
    !OAUTH_STATE_PATTERN.test(state) ||
    scopes.size !== 2 ||
    !scopes.has("identify") ||
    !scopes.has("guilds")
  ) {
    throw new VerificationError(
      "Discord OAuth redirect has invalid client, callback, state, response type, or scopes.",
    );
  }

  const stateCookies = response.headers
    .getSetCookie()
    .filter((cookie) => cookie.startsWith("piphacklup_oauth_state="));
  const stateCookie = stateCookies.length === 1 ? stateCookies[0] : null;
  if (
    !stateCookie ||
    stateCookie.split(";", 1)[0] !== `piphacklup_oauth_state=${state}` ||
    !/;\s*HttpOnly(?:;|$)/iu.test(stateCookie) ||
    !/;\s*Secure(?:;|$)/iu.test(stateCookie) ||
    !/;\s*SameSite=Lax(?:;|$)/iu.test(stateCookie) ||
    !/;\s*Path=\/(?:;|$)/iu.test(stateCookie) ||
    !/;\s*Max-Age=600(?:;|$)/iu.test(stateCookie) ||
    /;\s*Domain=/iu.test(stateCookie)
  ) {
    throw new VerificationError(
      "Discord OAuth state cookie is missing required security attributes.",
    );
  }
}

function verifyGuildCommands(value, discord) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new VerificationError(
      "Discord returned an invalid isolated-guild command list.",
    );
  }

  const names = new Set();
  for (const command of value) {
    if (
      !isRecord(command) ||
      typeof command.name !== "string" ||
      !COMMAND_NAME_PATTERN.test(command.name) ||
      typeof command.id !== "string" ||
      !SNOWFLAKE_PATTERN.test(command.id) ||
      command.application_id !== discord.clientId ||
      command.guild_id !== discord.testGuildId ||
      command.type !== 1 ||
      names.has(command.name)
    ) {
      throw new VerificationError(
        "Discord returned malformed, duplicate, or wrong-scope guild commands.",
      );
    }
    names.add(command.name);
  }

  const expectedNames = new Set(discord.expectedCommands);
  const missing = discord.expectedCommands.filter((name) => !names.has(name));
  const unexpected = [...names].filter((name) => !expectedNames.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new VerificationError(
      `The isolated Discord guild command set does not exactly match the release (${missing.length} missing, ${unexpected.length} unexpected).`,
    );
  }
}

async function requestReadOnly(
  fetchImplementation,
  url,
  { accept = "application/json", authorization, label, timeoutMs },
) {
  const headers = new Headers({ accept });
  if (authorization) headers.set("authorization", authorization);
  try {
    return await readOnlyFetch(fetchImplementation, url, {
      headers,
      timeoutMs,
    });
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    if (
      isRecord(error) &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new VerificationError(`${label} timed out.`);
    }
    throw new VerificationError(`${label} request failed.`);
  }
}

async function readJson(response, label) {
  const lengthHeader = response.headers.get("content-length");
  const contentLength = lengthHeader ? Number(lengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    throw new VerificationError(`${label} response is unexpectedly large.`);
  }

  let text;
  try {
    text = await readBoundedResponseBody(response, MAX_JSON_BYTES, label);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError(`${label} response body could not be read.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new VerificationError(`${label} did not return valid JSON.`);
  }
}

async function readBoundedResponseBody(response, maximumBytes, label) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new VerificationError(`${label} response is unexpectedly large.`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new VerificationError(
      `${label} returned HTTP ${response.status}; expected ${expected}.`,
    );
  }
}

function hasNoStoreDirective(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes("no-store");
}

function readArgumentValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new VerificationError(`${option} requires a value.`);
  }
  return value;
}

function assertOptionUsedOnce(seen, option) {
  if (seen.has(option)) {
    throw new VerificationError(`${option} may be provided only once.`);
  }
  seen.add(option);
}

function safeArgumentLabel(argument) {
  return argument.startsWith("-")
    ? argument.split("=", 1)[0]
    : "[REDACTED ARGUMENT]";
}

function parseTimeout(value) {
  if (!/^\d+$/u.test(value)) {
    throw new VerificationError("--timeout-ms must be an integer.");
  }
  const timeoutMs = Number(value);
  if (timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new VerificationError(
      `--timeout-ms must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`,
    );
  }
  return timeoutMs;
}

function isUsableToken(value) {
  return Boolean(
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 512 &&
    !/\s/u.test(value) &&
    !/(change[-_ ]?me|example|placeholder)/iu.test(value),
  );
}

function isExpectedGuildName(value) {
  return Boolean(
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    value.trim() === value &&
    !/[\u0000-\u001F\u007F]/u.test(value),
  );
}

function assertExpectedCommands(commands) {
  if (
    commands.length === 0 ||
    commands.length > 100 ||
    commands.some((name) => !COMMAND_NAME_PATTERN.test(name)) ||
    new Set(commands).size !== commands.length
  ) {
    throw new VerificationError(
      "Expected Discord commands must be unique lowercase command names.",
    );
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function printUsage() {
  console.log(`Usage:
  node scripts/verify-live-release.mjs \\
    --base-url https://piphacklup.vercel.app \\
    --expected-client-id 123456789012345678

Optional isolated Discord verification (GET requests only, with DISCORD_CLIENT_ID
and DISCORD_TOKEN already injected by a secure environment/secret store):
  node scripts/verify-live-release.mjs \\
    --base-url https://piphacklup.vercel.app \\
    --expected-client-id 123456789012345678 \\
    --discord-read-only \\
    --test-guild-id 123456789012345678 \\
    --expected-guild-name "PipHackLup Release Lab"

Options:
  --base-url URL              Deployed web origin (required)
  --expected-client-id ID     Exact deployed Discord application snowflake
  --timeout-ms MS             Per-request timeout, 1000-30000 (default 10000)
  --allow-local-http          Permit HTTP only for localhost/loopback testing
  --discord-read-only         Explicitly enable isolated Discord GET checks
  --test-guild-id ID          Exact isolated Discord test-server snowflake
  --expected-guild-name NAME  Exact isolated Discord test-server name
  --expected-command NAME     Override expected command set; repeat per command
  --help                      Show this help

Credentials are accepted only through environment variables. This verifier has
no install, remove, setup, registration, deployment, or other mutation mode.
Passing this preflight does not replace interactive command/session E2E.`);
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    return;
  }

  const configuration = buildConfiguration(parsed, process.env);
  const report = await runVerification(configuration);
  for (const result of report.web) {
    console.log(`PASS ${result.check}: ${result.detail}`);
  }
  if (report.discordSkipped) {
    console.log(
      "SKIP discord-read-only: explicit isolated-guild credentials were not requested",
    );
  } else {
    for (const result of report.discord) {
      console.log(`PASS ${result.check}: ${result.detail}`);
    }
  }
  console.log("PASS read-only release preflight completed without mutations");
  console.log(
    "REQUIRED interactive isolated-server command/session E2E remains a separate release gate",
  );
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    console.error(
      `FAIL ${redactSecrets(message, collectSecretValues(process.env))}`,
    );
    process.exitCode = 1;
  });
}
