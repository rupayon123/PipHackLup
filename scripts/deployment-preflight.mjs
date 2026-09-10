#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CALLBACK_PATH = "/api/auth/discord/callback";
const DEFAULT_REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DISCORD_SNOWFLAKE = /^[1-9]\d{16,19}$/u;
const MIGRATION_TAG = /^\d{4}_[a-z0-9_]+$/u;
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const TARGETS = new Set(["all", "bot", "web"]);

/**
 * Run deterministic deployment checks without loading dotenv files, contacting a
 * provider, or returning environment values in the result.
 */
export function runDeploymentPreflight({
  env = process.env,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  target = "all",
} = {}) {
  if (!TARGETS.has(target)) {
    throw new TypeError("target must be one of: all, bot, web");
  }

  const checks = [];
  const checkedIds = new Set();
  const addCheck = (id, ok, passMessage, failMessage) => {
    if (checkedIds.has(id)) return;
    checkedIds.add(id);
    checks.push({ id, ok, message: ok ? passMessage : failMessage });
  };

  const includeWeb = target === "all" || target === "web";
  const includeBot = target === "all" || target === "bot";

  addSnowflakeCheck(addCheck, env, "DISCORD_CLIENT_ID", true);
  addDatabaseCheck(addCheck, env);

  if (includeWeb) {
    addSecretCheck(addCheck, env, "DISCORD_CLIENT_SECRET", 16);
    addSecretCheck(addCheck, env, "DISCORD_TOKEN", 20);
    addSecretCheck(addCheck, env, "NEXTAUTH_SECRET", 32);
    addHttpsOriginCheck(addCheck, env, "NEXTAUTH_URL");

    const appOrigin = parseHttpsOrigin(env.NEXTAUTH_URL);
    addCheck(
      "DISCORD_OAUTH_CALLBACK",
      Boolean(appOrigin),
      `Discord OAuth callback resolves to the exact ${CALLBACK_PATH} path.`,
      `Discord OAuth callback cannot be derived until NEXTAUTH_URL is a valid HTTPS origin.`,
    );

    const permissions = env.DISCORD_INSTALL_PERMISSIONS;
    addCheck(
      "DISCORD_INSTALL_PERMISSIONS",
      permissions === undefined || isPositiveUnsignedBitfield(permissions),
      permissions === undefined
        ? "Discord install permissions will use the application default."
        : "Discord install permissions contain a positive numeric bitfield.",
      "DISCORD_INSTALL_PERMISSIONS must be a positive unsigned numeric bitfield when set.",
    );
  }

  if (includeBot) {
    addSecretCheck(addCheck, env, "DISCORD_TOKEN", 20);
    addHttpsOriginCheck(addCheck, env, "PIPHACKLUP_PUBLIC_URL");
    addOptionalSnowflakeCheck(addCheck, env, "DISCORD_TEST_GUILD_ID");

    const port = env.PORT;
    addCheck(
      "PORT",
      port === undefined || isValidPort(port),
      port === undefined
        ? "Bot health server will use its default port."
        : "Bot health server port is valid.",
      "PORT must be an integer from 1 through 65535 when set.",
    );

    addCheck(
      "PIPHACKLUP_AMBIENT_QA_ENABLED",
      env.PIPHACKLUP_AMBIENT_QA_ENABLED === "true" ||
        env.PIPHACKLUP_AMBIENT_QA_ENABLED === "false",
      "Ambient Q&A intent choice is explicitly configured.",
      "PIPHACKLUP_AMBIENT_QA_ENABLED must be explicitly set to true or false.",
    );
  }

  if (includeWeb && includeBot) {
    const appOrigin = parseHttpsOrigin(env.NEXTAUTH_URL);
    const publicOrigin = parseHttpsOrigin(env.PIPHACKLUP_PUBLIC_URL);
    addCheck(
      "SHARED_PUBLIC_ORIGIN",
      Boolean(appOrigin && publicOrigin && appOrigin === publicOrigin),
      "Web OAuth and bot links use the same public origin.",
      "NEXTAUTH_URL and PIPHACKLUP_PUBLIC_URL must be the same HTTPS origin.",
    );
  }

  checks.push(validateMigrationBundle(repositoryRoot));

  return {
    checks,
    ok: checks.every((check) => check.ok),
    target,
  };
}

export function formatDeploymentPreflight(result) {
  const lines = [
    `PipHackLup deployment preflight (${result.target}, offline)`,
    "",
    ...result.checks.map(
      (check) => `${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.message}`,
    ),
    "",
    result.ok
      ? `RESULT: READY (${result.checks.length}/${result.checks.length} checks passed)`
      : `RESULT: NOT READY (${result.checks.filter((check) => check.ok).length}/${result.checks.length} checks passed)`,
    "No network requests were made. No environment values were printed.",
  ];
  return lines.join("\n");
}

export function parseCliArguments(arguments_) {
  let target = "all";
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h")
      return { help: true, target };
    if (argument === "--target") {
      target = arguments_[index + 1];
      index += 1;
    } else if (argument?.startsWith("--target=")) {
      target = argument.slice("--target=".length);
    } else {
      throw new TypeError("unknown command-line argument");
    }
  }
  if (!TARGETS.has(target)) {
    throw new TypeError("target must be one of: all, bot, web");
  }
  return { help: false, target };
}

function addDatabaseCheck(addCheck, env) {
  addCheck(
    "DATABASE_URL",
    isProductionPostgresUrl(env.DATABASE_URL),
    "Production PostgreSQL connection URL is configured.",
    "DATABASE_URL must be a non-placeholder PostgreSQL URL with credentials, host, and database name.",
  );
}

function addSecretCheck(addCheck, env, name, minimumBytes) {
  addCheck(
    name,
    isConfiguredSecret(env[name], minimumBytes),
    `${name} is present and is not an obvious placeholder.`,
    `${name} is missing, too short, malformed, or an obvious placeholder.`,
  );
}

function addSnowflakeCheck(addCheck, env, name, required) {
  const value = env[name];
  addCheck(
    name,
    (!required && value === undefined) ||
      (typeof value === "string" && DISCORD_SNOWFLAKE.test(value)),
    `${name} is a valid Discord snowflake.`,
    `${name} must be a ${required ? "configured " : ""}17-to-20-digit Discord snowflake.`,
  );
}

function addOptionalSnowflakeCheck(addCheck, env, name) {
  const value = env[name];
  addCheck(
    name,
    value === undefined || DISCORD_SNOWFLAKE.test(value),
    value === undefined
      ? `${name} is unset, so command registration is not locked to a test guild.`
      : `${name} is a valid Discord snowflake.`,
    `${name} must be a 17-to-20-digit Discord snowflake when set.`,
  );
}

function addHttpsOriginCheck(addCheck, env, name) {
  addCheck(
    name,
    Boolean(parseHttpsOrigin(env[name])),
    `${name} is a production HTTPS origin with no credentials, path, query, or fragment.`,
    `${name} must be a production HTTPS origin with no credentials, path, query, or fragment.`,
  );
}

function parseHttpsOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || !value)
    return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash ||
    !isPublicProductionHostname(url.hostname)
  ) {
    return null;
  }
  return url.origin;
}

function isProductionPostgresUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || !value)
    return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const username = decodeUrlComponent(url.username);
  const password = decodeUrlComponent(url.password);
  const databaseName = decodeUrlComponent(url.pathname.slice(1));
  return Boolean(
    POSTGRES_PROTOCOLS.has(url.protocol) &&
    isProductionHostname(url.hostname) &&
    !url.hash &&
    username &&
    password &&
    databaseName &&
    !databaseName.includes("/") &&
    !isPlaceholder(username) &&
    !isPlaceholder(password) &&
    !isPlaceholder(databaseName),
  );
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isPublicProductionHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return Boolean(
    isProductionHostname(normalized) &&
    normalized.includes(".") &&
    isIP(normalized) === 0,
  );
}

function isProductionHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return Boolean(
    normalized &&
    normalized !== "host" &&
    normalized !== "localhost" &&
    normalized !== "0.0.0.0" &&
    normalized !== "127.0.0.1" &&
    normalized !== "::1" &&
    !normalized.endsWith(".local") &&
    !normalized.endsWith(".test") &&
    !normalized.endsWith(".example") &&
    !normalized.endsWith(".invalid") &&
    !["example.com", "example.net", "example.org"].some(
      (reserved) =>
        normalized === reserved || normalized.endsWith(`.${reserved}`),
    ),
  );
}

function isConfiguredSecret(value, minimumBytes) {
  return Boolean(
    typeof value === "string" &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    Buffer.byteLength(value, "utf8") >= minimumBytes &&
    !isPlaceholder(value),
  );
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return Boolean(
    !normalized ||
    /^(?:<[^>]+>|\$\{[^}]+\}|change[-_ ]?me|example|placeholder|password|replace[-_ ].*|secret|token|your[-_ ].*|(?:discord[-_ ]?)?(?:bot[-_ ]?token|client[-_ ]?secret)|nextauth[-_ ]?secret)$/u.test(
      normalized,
    ) ||
    normalized.includes("user:password@host") ||
    normalized.includes("example.com"),
  );
}

function isPositiveUnsignedBitfield(value) {
  if (!/^\d+$/u.test(value)) return false;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= 18_446_744_073_709_551_615n;
  } catch {
    return false;
  }
}

function isValidPort(value) {
  if (!/^\d+$/u.test(value)) return false;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535;
}

function validateMigrationBundle(repositoryRoot) {
  const migrationsDirectory = join(
    resolve(repositoryRoot),
    "packages",
    "db",
    "drizzle",
  );
  const metadataDirectory = join(migrationsDirectory, "meta");

  try {
    const journal = JSON.parse(
      readFileSync(join(metadataDirectory, "_journal.json"), "utf8"),
    );
    if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
      return failedMigrationCheck();
    }

    const tags = [];
    const indexes = [];
    for (const [index, entry] of journal.entries.entries()) {
      if (
        !entry ||
        typeof entry !== "object" ||
        entry.idx !== index ||
        typeof entry.tag !== "string" ||
        !MIGRATION_TAG.test(entry.tag)
      ) {
        return failedMigrationCheck();
      }
      tags.push(entry.tag);
      indexes.push(String(index).padStart(4, "0"));
    }

    const migrationFiles = readdirSync(migrationsDirectory);
    const sqlTags = migrationFiles
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, -4))
      .sort();
    if (!sameStrings([...tags].sort(), sqlTags)) return failedMigrationCheck();
    for (const tag of tags) {
      if (
        !readFileSync(join(migrationsDirectory, `${tag}.sql`), "utf8").trim()
      ) {
        return failedMigrationCheck();
      }
    }

    const snapshotIndexes = readdirSync(metadataDirectory)
      .filter((name) => name.endsWith("_snapshot.json"))
      .map((name) => name.slice(0, -"_snapshot.json".length))
      .sort();
    if (!sameStrings([...indexes].sort(), snapshotIndexes)) {
      return failedMigrationCheck();
    }
    for (const index of indexes) {
      const snapshot = JSON.parse(
        readFileSync(join(metadataDirectory, `${index}_snapshot.json`), "utf8"),
      );
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot)
      ) {
        return failedMigrationCheck();
      }
    }

    return {
      id: "MIGRATION_BUNDLE",
      message: `Migration journal, SQL files, and snapshots agree (${tags.length} migrations).`,
      ok: true,
    };
  } catch {
    return failedMigrationCheck();
  }
}

function failedMigrationCheck() {
  return {
    id: "MIGRATION_BUNDLE",
    message:
      "Migration journal, SQL files, and snapshots must exist, parse, and match exactly.",
    ok: false,
  };
}

function sameStrings(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function printHelp() {
  console.log(`Usage: node scripts/deployment-preflight.mjs [--target all|web|bot]

Validates deployment environment shape and the committed migration bundle.
The check is offline and never prints environment values.`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const result = runDeploymentPreflight({ target: options.target });
      console.log(formatDeploymentPreflight(result));
      if (!result.ok) process.exitCode = 1;
    }
  } catch {
    console.error(
      "Deployment preflight arguments are invalid. Use --help for safe usage information.",
    );
    process.exitCode = 2;
  }
}
