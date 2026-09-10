import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  formatDeploymentPreflight,
  parseCliArguments,
  runDeploymentPreflight,
} from "../deployment-preflight.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function validEnvironment() {
  return {
    DATABASE_URL:
      "postgresql://piphacklup:Db_7Qx9kL2mN5pR8vT@db.production.net/piphacklup?sslmode=require",
    DISCORD_CLIENT_ID: "1512918151313231983",
    DISCORD_CLIENT_SECRET: "DcS_8mK4pQ2xV7nR5tY9wL3z",
    DISCORD_INSTALL_PERMISSIONS: "1099914365968",
    DISCORD_TEST_GUILD_ID: "1536112346458624091",
    DISCORD_TOKEN: "test_token_value_that_is_long_enough",
    NEXTAUTH_SECRET: "NaS_2rT8yU4iO9pL5kJ7hG3fD6sA1qW0eZxC",
    NEXTAUTH_URL: "https://piphacklup.vercel.app",
    PIPHACKLUP_AMBIENT_QA_ENABLED: "false",
    PIPHACKLUP_PUBLIC_URL: "https://piphacklup.vercel.app",
    PORT: "8787",
  };
}

function createMigrationBundle({ mismatch = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "piphacklup-preflight-"));
  const migrations = join(root, "packages", "db", "drizzle");
  const metadata = join(migrations, "meta");
  mkdirSync(metadata, { recursive: true });
  const entries = [
    { idx: 0, tag: "0000_initial", version: "7" },
    { idx: 1, tag: "0001_accounts", version: "7" },
  ];
  writeFileSync(
    join(metadata, "_journal.json"),
    JSON.stringify({ dialect: "postgresql", entries, version: "7" }),
  );
  for (const entry of entries) {
    writeFileSync(join(migrations, `${entry.tag}.sql`), "select 1;\n");
    writeFileSync(
      join(metadata, `${String(entry.idx).padStart(4, "0")}_snapshot.json`),
      JSON.stringify({ id: `snapshot-${entry.idx}` }),
    );
  }
  if (mismatch)
    writeFileSync(join(migrations, "0002_untracked.sql"), "select 2;\n");
  return root;
}

describe("deployment preflight", () => {
  it("accepts a complete combined web and bot contract offline", () => {
    const result = runDeploymentPreflight({
      env: validEnvironment(),
      repositoryRoot: createMigrationBundle(),
      target: "all",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.checks.every((check) => check.ok),
      true,
    );
    assert.equal(
      result.checks.find((check) => check.id === "MIGRATION_BUNDLE")?.message,
      "Migration journal, SQL files, and snapshots agree (2 migrations).",
    );
  });

  it("does not invoke network APIs", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = () => {
      fetchCalled = true;
      throw new Error("network access is forbidden in preflight");
    };
    try {
      const result = runDeploymentPreflight({
        env: validEnvironment(),
        repositoryRoot: createMigrationBundle(),
        target: "all",
      });
      assert.equal(result.ok, true);
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed on missing or malformed required values", () => {
    const env = validEnvironment();
    env.DISCORD_CLIENT_ID = "not-a-snowflake";
    env.DISCORD_CLIENT_SECRET = "secret";
    env.DISCORD_TOKEN = "token";
    env.NEXTAUTH_SECRET = "short";
    env.NEXTAUTH_URL = "http://localhost:3000/path?leak=true";
    env.PIPHACKLUP_PUBLIC_URL = "https://different.vercel.app";
    env.PIPHACKLUP_AMBIENT_QA_ENABLED = "maybe";
    env.PORT = "70000";

    const result = runDeploymentPreflight({
      env,
      repositoryRoot: createMigrationBundle(),
      target: "all",
    });

    assert.equal(result.ok, false);
    for (const id of [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_TOKEN",
      "NEXTAUTH_SECRET",
      "NEXTAUTH_URL",
      "DISCORD_OAUTH_CALLBACK",
      "PORT",
      "PIPHACKLUP_AMBIENT_QA_ENABLED",
      "SHARED_PUBLIC_ORIGIN",
    ]) {
      assert.equal(
        result.checks.find((check) => check.id === id)?.ok,
        false,
        `${id} should fail`,
      );
    }
  });

  it("keeps web-only and bot-only host contracts separate", () => {
    const migrationsRoot = createMigrationBundle();
    const webEnv = validEnvironment();
    delete webEnv.PIPHACKLUP_PUBLIC_URL;
    delete webEnv.PIPHACKLUP_AMBIENT_QA_ENABLED;
    delete webEnv.DISCORD_TEST_GUILD_ID;
    delete webEnv.PORT;
    const web = runDeploymentPreflight({
      env: webEnv,
      repositoryRoot: migrationsRoot,
      target: "web",
    });

    const botEnv = validEnvironment();
    delete botEnv.DISCORD_CLIENT_SECRET;
    delete botEnv.NEXTAUTH_SECRET;
    delete botEnv.NEXTAUTH_URL;
    delete botEnv.DISCORD_INSTALL_PERMISSIONS;
    const bot = runDeploymentPreflight({
      env: botEnv,
      repositoryRoot: migrationsRoot,
      target: "bot",
    });

    assert.equal(web.ok, true);
    assert.equal(bot.ok, true);
    assert.equal(
      web.checks.some((check) => check.id === "PIPHACKLUP_PUBLIC_URL"),
      false,
    );
    assert.equal(
      bot.checks.some((check) => check.id === "NEXTAUTH_SECRET"),
      false,
    );
  });

  it("rejects URL, placeholder, snowflake, and bitfield edge cases", () => {
    const cases = [
      ["NEXTAUTH_URL", "https://user:password@app.acme.net"],
      ["NEXTAUTH_URL", "https://internal"],
      ["PIPHACKLUP_PUBLIC_URL", "https://app.acme.net/base"],
      ["DATABASE_URL", "postgres://user:password@host:5432/piphacklup"],
      [
        "DATABASE_URL",
        "postgres://piphacklup:password@db.production.net/piphacklup",
      ],
      ["DISCORD_CLIENT_ID", "00000000000000000"],
      ["DISCORD_TEST_GUILD_ID", "1234"],
      ["DISCORD_INSTALL_PERMISSIONS", "-1"],
    ];

    for (const [name, value] of cases) {
      const env = validEnvironment();
      env[name] = value;
      const result = runDeploymentPreflight({
        env,
        repositoryRoot: createMigrationBundle(),
        target: "all",
      });
      assert.equal(result.ok, false, `${name} should fail closed`);
    }
  });

  it("rejects a missing or inconsistent migration bundle", () => {
    const missing = runDeploymentPreflight({
      env: validEnvironment(),
      repositoryRoot: mkdtempSync(join(tmpdir(), "piphacklup-empty-")),
      target: "all",
    });
    const mismatched = runDeploymentPreflight({
      env: validEnvironment(),
      repositoryRoot: createMigrationBundle({ mismatch: true }),
      target: "all",
    });

    assert.equal(missing.ok, false);
    assert.equal(
      missing.checks.find((check) => check.id === "MIGRATION_BUNDLE")?.ok,
      false,
    );
    assert.equal(mismatched.ok, false);
  });

  it("never returns or formats Discord IDs, credentials, or database URLs", () => {
    const env = validEnvironment();
    const result = runDeploymentPreflight({
      env,
      repositoryRoot: createMigrationBundle(),
      target: "all",
    });
    const serializedResult = JSON.stringify(result);
    const output = formatDeploymentPreflight(result);

    for (const value of [
      env.DATABASE_URL,
      env.DISCORD_CLIENT_ID,
      env.DISCORD_CLIENT_SECRET,
      env.DISCORD_TEST_GUILD_ID,
      env.DISCORD_TOKEN,
      env.NEXTAUTH_SECRET,
    ]) {
      assert.equal(serializedResult.includes(value), false);
      assert.equal(output.includes(value), false);
    }
  });

  it("parses safe target arguments and rejects unknown input", () => {
    assert.deepEqual(parseCliArguments([]), { help: false, target: "all" });
    assert.deepEqual(parseCliArguments(["--target", "web"]), {
      help: false,
      target: "web",
    });
    assert.deepEqual(parseCliArguments(["--target=bot"]), {
      help: false,
      target: "bot",
    });
    assert.throws(() => parseCliArguments(["--root", "/tmp"]));
    assert.throws(() => parseCliArguments(["--target", "preview"]));
  });

  it("sets CLI exit status from the fail-closed result without leaking values", () => {
    const script = join(repositoryRoot, "scripts", "deployment-preflight.mjs");
    const env = validEnvironment();
    const success = spawnSync(process.execPath, [script, "--target=web"], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    });

    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /RESULT: READY/u);
    for (const value of [
      env.DATABASE_URL,
      env.DISCORD_CLIENT_ID,
      env.DISCORD_CLIENT_SECRET,
      env.DISCORD_TOKEN,
      env.NEXTAUTH_SECRET,
    ]) {
      assert.equal(success.stdout.includes(value), false);
    }

    const failure = spawnSync(process.execPath, [script, "--target=web"], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(failure.status, 1);
    assert.match(failure.stdout, /RESULT: NOT READY/u);

    const invalidArguments = spawnSync(
      process.execPath,
      [script, "--unknown"],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(invalidArguments.status, 2);
    assert.doesNotMatch(invalidArguments.stderr, /--unknown/u);
  });
});
