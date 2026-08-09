import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  formatSecretScan,
  parseCliArguments,
  scanSecrets,
} from "../scan-secrets.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const scriptPath = join(repositoryRoot, "scripts", "scan-secrets.mjs");

function fixtureDirectory() {
  return mkdtempSync(join(tmpdir(), "piphacklup-secret-scan-"));
}

function writeFixture(root, name, content) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function syntheticSecrets() {
  const discord = `${"A".repeat(24)}.${"b".repeat(6)}.${"C".repeat(30)}`;
  const github = `${["gh", "p", "_"].join("")}${"d".repeat(40)}`;
  const openai = `${["s", "k", "-"].join("")}${"E7".repeat(24)}`;
  const provider = `${["xox", "b", "-"].join("")}${"12Ab".repeat(8)}`;
  const databasePassword = "R8qM4wT9nK2zV7cX";
  const database = `${"postgres" + "ql"}://release_user:${databasePassword}@db.hosting-provider.com:5432/piphacklup`;
  const nextAuth = "R3leaseSessionKey9zQ8mW7vT6cP5nL4";
  const discordClient = "ClientCredential8mQ4wT9nK2zV";
  const privateKey = [
    ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
    "ZmFrZS1rZXktbWF0ZXJpYWw=",
    ["-----END ", "PRIVATE KEY-----"].join(""),
  ].join("\n");

  return {
    database,
    databasePassword,
    discord,
    discordClient,
    github,
    nextAuth,
    openai,
    privateKey,
    provider,
  };
}

describe("repository secret scanner", () => {
  it("detects supported credential families through explicit path input", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    const nextAuthName = [["NEXT", "AUTH"].join(""), "SECRET"].join("_");
    const discordClientName = ["DISCORD", "CLIENT", "SECRET"].join("_");

    writeFixture(root, "database.env", `DATABASE_URL=${values.database}\n`);
    writeFixture(root, "discord.txt", `${values.discord}\n`);
    writeFixture(root, "github.txt", `${values.github}\n`);
    writeFixture(root, "openai.txt", `${values.openai}\n`);
    writeFixture(root, "provider.txt", `${values.provider}\n`);
    writeFixture(
      root,
      "assignments.env",
      `${nextAuthName}=${values.nextAuth}\n${discordClientName}=${values.discordClient}\n`,
    );
    writeFixture(root, "identity.pem", `${values.privateKey}\n`);

    const result = scanSecrets({ cwd: root, paths: [root] });
    const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

    assert.equal(result.ok, false);
    assert.deepEqual([...ruleIds].sort(), [
      "discord-client-secret-assignment",
      "discord-token",
      "github-token",
      "nextauth-secret-assignment",
      "openai-token",
      "postgres-credentials",
      "private-key",
      "provider-token",
    ]);
    assert.equal(result.errors.length, 0);
  });

  it("never returns or formats matched credential values", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    const path = writeFixture(
      root,
      "secrets.txt",
      `${values.database}\n${values.discord}\n${values.github}\n${values.openai}\n`,
    );

    const result = scanSecrets({ cwd: root, paths: [path] });
    const serialized = JSON.stringify(result);
    const formatted = formatSecretScan(result);

    for (const value of [
      values.database,
      values.databasePassword,
      values.discord,
      values.github,
      values.openai,
    ]) {
      assert.equal(serialized.includes(value), false);
      assert.equal(formatted.includes(value), false);
    }
  });

  it("documents and narrowly allows local or obvious placeholder fixtures", () => {
    const root = fixtureDirectory();
    const nextAuthName = [["NEXT", "AUTH"].join(""), "SECRET"].join("_");
    const discordClientName = ["DISCORD", "CLIENT", "SECRET"].join("_");
    const content = [
      `${"postgres" + "ql"}://local_user:local_password@127.0.0.1:5432/app`,
      `${"postgres" + "ql"}://example_user:fake-password@db.example.com/app`,
      `${nextAuthName}=change-me`,
      `${discordClientName}=test-only-placeholder`,
      `${discordClientName}=client-secret`,
      `${nextAuthName}=too-short`,
      `${nextAuthName}=\${FROM_ENVIRONMENT}`,
    ].join("\n");
    const path = writeFixture(root, "allowed.env", `${content}\n`);

    const result = scanSecrets({ cwd: root, paths: [path] });

    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
    assert.equal(result.scannedFiles, 1);
  });

  it("defaults to tracked files and excludes untracked files", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    writeFixture(root, "tracked.txt", `${values.openai}\n`);
    writeFixture(root, "untracked.txt", `${values.github}\n`);

    const init = spawnSync("git", ["init", "--quiet"], {
      cwd: root,
      encoding: "utf8",
    });
    const add = spawnSync("git", ["add", "tracked.txt"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(init.status, 0, init.stderr);
    assert.equal(add.status, 0, add.stderr);

    const result = scanSecrets({ cwd: root });

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0]?.path, "tracked.txt");
    assert.equal(result.findings[0]?.ruleId, "openai-token");
    assert.equal(result.scannedFiles, 1);
  });

  it("skips binary files and symbolic links instead of following them", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    const binary = join(root, "image.bin");
    writeFileSync(
      binary,
      Buffer.concat([
        Buffer.from(values.github, "utf8"),
        Buffer.from([0]),
        Buffer.from("binary", "utf8"),
      ]),
    );
    const target = writeFixture(root, "target.txt", `${values.discord}\n`);
    const link = join(root, "link.txt");
    symlinkSync(target, link);

    const result = scanSecrets({ cwd: root, paths: [binary, link] });

    assert.equal(result.ok, true);
    assert.equal(result.scannedFiles, 0);
    assert.equal(result.skippedFiles, 2);
  });

  it("reports deterministic paths, line numbers, and rule order", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    writeFixture(root, "z-last.txt", `safe\n${values.github}\n`);
    writeFixture(root, "a-first.txt", `${values.discord}\n`);

    const result = scanSecrets({ cwd: root, paths: [root] });

    assert.deepEqual(
      result.findings.map(({ line, path, ruleId }) => ({ line, path, ruleId })),
      [
        { line: 1, path: "a-first.txt", ruleId: "discord-token" },
        { line: 2, path: "z-last.txt", ruleId: "github-token" },
      ],
    );
  });

  it("parses explicit paths and keeps CLI output value-free", () => {
    const root = fixtureDirectory();
    const values = syntheticSecrets();
    const path = writeFixture(root, "leak.env", `${values.database}\n`);

    assert.deepEqual(parseCliArguments([]), { help: false, paths: [] });
    assert.deepEqual(parseCliArguments(["--path", path]), {
      help: false,
      paths: [path],
    });
    assert.deepEqual(parseCliArguments(["--path=one", "--", "two"]), {
      help: false,
      paths: ["one", "two"],
    });
    assert.throws(() => parseCliArguments(["--unknown"]));

    const failure = spawnSync(process.execPath, [scriptPath, "--path", path], {
      cwd: root,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(failure.status, 1, failure.stderr);
    assert.match(failure.stdout, /RESULT: FAIL/u);
    assert.equal(failure.stdout.includes(values.database), false);
    assert.equal(failure.stdout.includes(values.databasePassword), false);

    const cleanPath = writeFixture(root, "clean.txt", "no credentials here\n");
    const success = spawnSync(
      process.execPath,
      [scriptPath, "--path", cleanPath],
      {
        cwd: root,
        encoding: "utf8",
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /RESULT: PASS/u);
  });
});
