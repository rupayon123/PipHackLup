#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const PRIVATE_KEY_HEADER = new RegExp(
  [
    "-{5}BEGIN ",
    "(?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?",
    "PRIVATE KEY-{5}",
  ].join(""),
  "u",
);
const POSTGRES_URL = new RegExp(
  [
    "postgres",
    "(?:ql)?",
    ":\\/\\/",
    "[^\\s\\x22\\x27\\x60<>\\\\\\x29\\x5d\\x7d]+",
  ].join(""),
  "giu",
);
const DISCORD_TOKEN = new RegExp(
  [
    "(?:",
    "mfa\\.[A-Za-z0-9_-]{40,}",
    "|",
    "[A-Za-z0-9_-]{23,32}\\.[A-Za-z0-9_-]{6}\\.[A-Za-z0-9_-]{20,}",
    ")",
  ].join(""),
  "u",
);
const GITHUB_TOKEN = new RegExp(
  [
    "(?:",
    ["gh", "[pousr]", "_"].join(""),
    "[A-Za-z0-9]{36,255}",
    "|",
    ["github", "_pat_"].join(""),
    "[A-Za-z0-9_]{40,255}",
    ")",
  ].join(""),
  "u",
);
const OPENAI_TOKEN = new RegExp(
  [["s", "k", "-"].join(""), "(?!ant-)[A-Za-z0-9_-]{32,}"].join(""),
  "u",
);
const PROVIDER_TOKENS = [
  new RegExp(
    [["s", "k", "-ant-"].join(""), "[A-Za-z0-9_-]{32,}"].join(""),
    "u",
  ),
  new RegExp([["g", "sk_"].join(""), "[A-Za-z0-9]{40,}"].join(""), "u"),
  new RegExp([["h", "f_"].join(""), "[A-Za-z0-9]{30,}"].join(""), "u"),
  new RegExp([["n", "pm_"].join(""), "[A-Za-z0-9]{30,}"].join(""), "u"),
  new RegExp([["ver", "cel_"].join(""), "[A-Za-z0-9]{20,}"].join(""), "u"),
  new RegExp(
    [
      "(?:",
      ["s", "k_live_"].join(""),
      "|",
      ["r", "k_live_"].join(""),
      ")[A-Za-z0-9]{16,}",
    ].join(""),
    "u",
  ),
  new RegExp([["xox", "[baprs]-"].join(""), "[A-Za-z0-9-]{20,}"].join(""), "u"),
  new RegExp([["AI", "za"].join(""), "[A-Za-z0-9_-]{35}"].join(""), "u"),
  new RegExp(["(?:AKIA|ASIA)", "[0-9A-Z]{16}"].join(""), "u"),
  new RegExp(
    [["S", "G\\."].join(""), "[A-Za-z0-9_-]{16,}\\.[A-Za-z0-9_-]{20,}"].join(
      "",
    ),
    "u",
  ),
];
const SECRET_ASSIGNMENT = new RegExp(
  [
    "(?:^|[\\s\\x7b,;])",
    "[\\x22\\x27]?",
    "(NEXTAUTH_SECRET|DISCORD_CLIENT_SECRET)",
    "[\\x22\\x27]?\\s*(?:=|:)\\s*",
    "(?:\\x22([^\\x22\\r\\n]*)\\x22|\\x27([^\\x27\\r\\n]*)\\x27|([^\\s,;\\x23\\r\\n]+))",
  ].join(""),
  "gu",
);
const RULE_ORDER = [
  "postgres-credentials",
  "discord-token",
  "github-token",
  "openai-token",
  "provider-token",
  "nextauth-secret-assignment",
  "discord-client-secret-assignment",
  "private-key",
];
const RULE_MESSAGES = Object.freeze({
  "discord-client-secret-assignment":
    "A concrete Discord client secret assignment is present.",
  "discord-token": "A Discord credential-shaped token is present.",
  "github-token": "A GitHub credential-shaped token is present.",
  "nextauth-secret-assignment":
    "A concrete NextAuth session secret assignment is present.",
  "openai-token": "An OpenAI credential-shaped token is present.",
  "postgres-credentials":
    "A credential-bearing non-local PostgreSQL URL is present.",
  "private-key": "A PEM private-key block is present.",
  "provider-token": "A provider credential-shaped token is present.",
});
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".db",
  ".dll",
  ".doc",
  ".docx",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tiff",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

/**
 * The allowlist is deliberately value-based, never directory-wide:
 *
 * - loopback, single-label development hosts, RFC documentation hosts, and
 *   reserved example domains are local/documentation PostgreSQL fixtures;
 * - explicit interpolation syntax and obvious fixture words such as
 *   `change-me`, `client-secret`, `password`, `placeholder`, `test-only`, and
 *   `too-short` are non-credentials;
 * - three exact, hashed synthetic values in deployment-preflight tests predate
 *   this scanner. Their path and digest must both match, so replacing a fixture
 *   with any other value fails closed.
 *
 * Token-shaped values and entire test directories are never allowlisted.
 */
const KNOWN_PREFLIGHT_FIXTURE_DIGESTS = new Set([
  "a8fa78528710439291bcd416885e00c47362b0af4efd174bb28a5c63192aa6f1",
  "4e07183c3866162317424287924ae8da75c3a6e6582dcbb5f0d55377b9f73b28",
  "0b3b148de2f03fe84cc36d765068fe070020c6f726a02cd3475ce14559c15921",
]);

export function scanSecrets({ cwd = process.cwd(), paths = [] } = {}) {
  const baseDirectory = resolve(cwd);
  const explicitPaths = Array.isArray(paths) ? paths : [];
  const collection = explicitPaths.length
    ? collectExplicitFiles(baseDirectory, explicitPaths)
    : collectTrackedFiles(baseDirectory);
  const findings = [];
  const errors = [...collection.errors];
  let scannedFiles = 0;
  let skippedFiles = collection.skippedFiles;

  for (const candidate of collection.files) {
    let metadata;
    try {
      metadata = lstatSync(candidate.absolutePath);
    } catch (error) {
      if (collection.source === "tracked" && error?.code === "ENOENT") {
        skippedFiles += 1;
        continue;
      }
      errors.push({ code: safeErrorCode(error), path: candidate.path });
      continue;
    }

    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      skippedFiles += 1;
      continue;
    }
    if (BINARY_EXTENSIONS.has(extname(candidate.absolutePath).toLowerCase())) {
      skippedFiles += 1;
      continue;
    }
    if (metadata.size > MAX_TEXT_FILE_BYTES) {
      errors.push({ code: "FILE_TOO_LARGE", path: candidate.path });
      continue;
    }

    let buffer;
    try {
      buffer = readFileSync(candidate.absolutePath);
    } catch (error) {
      errors.push({ code: safeErrorCode(error), path: candidate.path });
      continue;
    }
    if (buffer.includes(0)) {
      skippedFiles += 1;
      continue;
    }

    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      skippedFiles += 1;
      continue;
    }

    scannedFiles += 1;
    findings.push(...scanText(text, candidate.path));
  }

  findings.sort(compareFindings);
  errors.sort(comparePathEntries);
  return {
    errors,
    findings,
    ok: errors.length === 0 && findings.length === 0,
    scannedFiles,
    skippedFiles,
    source: collection.source,
  };
}

export function formatSecretScan(result) {
  const lines = [
    `PipHackLup secret scan (${result.source})`,
    `Scanned ${result.scannedFiles} text file${result.scannedFiles === 1 ? "" : "s"}; skipped ${result.skippedFiles}.`,
  ];

  for (const finding of result.findings) {
    lines.push(
      `FAIL ${safeOutputPath(finding.path)}:${finding.line} [${finding.ruleId}] ${RULE_MESSAGES[finding.ruleId]}`,
    );
  }
  for (const error of result.errors) {
    lines.push(
      `ERROR ${safeOutputPath(error.path)} [${error.code}] File could not be scanned safely.`,
    );
  }

  if (result.errors.length) {
    lines.push(
      `RESULT: ERROR (${result.errors.length} scan error${result.errors.length === 1 ? "" : "s"})`,
    );
  } else if (result.findings.length) {
    lines.push(
      `RESULT: FAIL (${result.findings.length} potential secret${result.findings.length === 1 ? "" : "s"})`,
    );
  } else {
    lines.push("RESULT: PASS (no potential secrets found)");
  }
  lines.push("Matched values are never printed.");
  return lines.join("\n");
}

export function parseCliArguments(arguments_) {
  const paths = [];
  let help = false;
  let positionalOnly = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (positionalOnly) {
      paths.push(argument);
      continue;
    }
    if (argument === "--") {
      positionalOnly = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--path") {
      const path = arguments_[index + 1];
      if (!path) throw new TypeError("path is required");
      paths.push(path);
      index += 1;
    } else if (argument?.startsWith("--path=")) {
      const path = argument.slice("--path=".length);
      if (!path) throw new TypeError("path is required");
      paths.push(path);
    } else if (argument?.startsWith("-")) {
      throw new TypeError("unknown command-line argument");
    } else {
      paths.push(argument);
    }
  }

  return { help, paths };
}

function collectTrackedFiles(cwd) {
  const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (rootResult.status !== 0 || !rootResult.stdout.trim()) {
    throw new Error("repository root unavailable");
  }
  const repositoryRoot = resolve(rootResult.stdout.trim());
  const filesResult = spawnSync(
    "git",
    ["-C", repositoryRoot, "ls-files", "--cached", "-z"],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  if (filesResult.status !== 0) {
    throw new Error("tracked file list unavailable");
  }

  const files = filesResult.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => ({
      absolutePath: resolve(repositoryRoot, path),
      path: normalizeDisplayPath(path),
    }))
    .sort(comparePathEntries);
  return { errors: [], files, skippedFiles: 0, source: "tracked" };
}

function collectExplicitFiles(cwd, paths) {
  const files = [];
  const errors = [];
  let skippedFiles = 0;

  const visit = (absolutePath) => {
    let metadata;
    try {
      metadata = lstatSync(absolutePath);
    } catch (error) {
      errors.push({
        code: safeErrorCode(error),
        path: displayPath(cwd, absolutePath),
      });
      return;
    }

    if (metadata.isSymbolicLink()) {
      skippedFiles += 1;
      return;
    }
    if (metadata.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(basename(absolutePath))) {
        skippedFiles += 1;
        return;
      }
      let entries;
      try {
        entries = readdirSync(absolutePath, { withFileTypes: true });
      } catch (error) {
        errors.push({
          code: safeErrorCode(error),
          path: displayPath(cwd, absolutePath),
        });
        return;
      }
      entries
        .sort((left, right) => left.name.localeCompare(right.name, "en"))
        .forEach((entry) => visit(join(absolutePath, entry.name)));
      return;
    }
    if (!metadata.isFile()) {
      skippedFiles += 1;
      return;
    }
    files.push({
      absolutePath,
      path: displayPath(cwd, absolutePath),
    });
  };

  for (const path of paths) visit(resolve(cwd, path));
  files.sort(comparePathEntries);
  errors.sort(comparePathEntries);
  return { errors, files, skippedFiles, source: "explicit paths" };
}

function scanText(text, path) {
  const findings = [];
  const lines = text.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matchedRules = new Set();

    if (containsPostgresCredentials(line, path))
      matchedRules.add("postgres-credentials");
    if (DISCORD_TOKEN.test(line)) matchedRules.add("discord-token");
    if (GITHUB_TOKEN.test(line)) matchedRules.add("github-token");
    if (OPENAI_TOKEN.test(line)) matchedRules.add("openai-token");
    if (PROVIDER_TOKENS.some((pattern) => pattern.test(line)))
      matchedRules.add("provider-token");
    if (PRIVATE_KEY_HEADER.test(line)) matchedRules.add("private-key");

    for (const match of line.matchAll(SECRET_ASSIGNMENT)) {
      const name = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      if (isAllowedAssignment(value, path)) continue;
      matchedRules.add(
        name === "NEXTAUTH_SECRET"
          ? "nextauth-secret-assignment"
          : "discord-client-secret-assignment",
      );
    }

    for (const ruleId of RULE_ORDER) {
      if (matchedRules.has(ruleId))
        findings.push({ line: index + 1, path, ruleId });
    }
  }
  return findings;
}

function containsPostgresCredentials(line, path) {
  for (const match of line.matchAll(POSTGRES_URL)) {
    const candidate = match[0].replace(/[.,;:]+$/u, "");
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (
      !POSTGRES_PROTOCOLS.has(url.protocol) ||
      !url.username ||
      !url.password ||
      isLocalOrDocumentationHost(url.hostname) ||
      isObviousPlaceholder(decodeUrlComponent(url.password)) ||
      isKnownPreflightFixture(candidate, path)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function isAllowedAssignment(value, path) {
  const normalized = value.trim();
  return Boolean(
    !normalized ||
    isObviousPlaceholder(normalized) ||
    /^(?:\$\{[^}]+\}|\{\{[^}]+\}\}|<[^>]+>|(?:process\.)?env(?:\.[A-Z0-9_]+|\[[^\]]+\])|import\.meta\.env\.[A-Z0-9_]+)$/u.test(
      normalized,
    ) ||
    isKnownPreflightFixture(normalized, path),
  );
}

function isObviousPlaceholder(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return Boolean(
    /^(?:change[-_ ]?me|client[-_ ]?secret|example(?:[-_ ].*)?|fake(?:[-_ ].*)?|local(?:[-_ ].*)?|password|placeholder(?:[-_ ].*)?|replace[-_ ].*|secret|test(?:[-_ ].*)?|token|too[-_ ]?short|your[-_ ].*)$/u.test(
      normalized,
    ) || /^(?:<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\})$/u.test(normalized),
  );
}

function isKnownPreflightFixture(value, path) {
  if (
    !normalizeDisplayPath(path).endsWith(
      "scripts/test/deployment-preflight.test.mjs",
    )
  ) {
    return false;
  }
  const digest = createHash("sha256").update(value).digest("hex");
  return KNOWN_PREFLIGHT_FIXTURE_DIGESTS.has(digest);
}

function isLocalOrDocumentationHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split(".").map(Number);
    return Boolean(
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
      (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113),
    );
  }
  if (ipVersion === 6) {
    return normalized === "::1" || normalized.startsWith("2001:db8:");
  }
  return Boolean(
    !normalized.includes(".") ||
    normalized === "localhost" ||
    normalized === "host.docker.internal" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".invalid") ||
    ["example.com", "example.net", "example.org"].some(
      (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
    ),
  );
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function displayPath(cwd, absolutePath) {
  const relativePath = relative(cwd, absolutePath);
  if (
    relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  ) {
    return normalizeDisplayPath(relativePath);
  }
  return normalizeDisplayPath(absolutePath);
}

function normalizeDisplayPath(path) {
  return path.split(sep).join("/");
}

function safeOutputPath(path) {
  return String(path).replace(/[\u0000-\u001f\u007f]/gu, "?");
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]+$/u.test(error.code)
    ? error.code
    : "READ_FAILED";
}

function comparePathEntries(left, right) {
  return left.path.localeCompare(right.path, "en");
}

function compareFindings(left, right) {
  return (
    comparePathEntries(left, right) ||
    left.line - right.line ||
    RULE_ORDER.indexOf(left.ruleId) - RULE_ORDER.indexOf(right.ruleId)
  );
}

function helpText() {
  return [
    "Usage: node scripts/scan-secrets.mjs [--path <file-or-directory> ...]",
    "",
    "Without paths, scan Git-tracked text files. Explicit paths are intended",
    "for focused local checks and deterministic fixture tests.",
    "",
    "Exit codes: 0 clean, 1 potential secret found, 2 scan/usage error.",
    "Matched values are never printed.",
  ].join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const options = parseCliArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
    } else {
      const result = scanSecrets({
        cwd: process.cwd() || DEFAULT_REPOSITORY_ROOT,
        paths: options.paths,
      });
      process.stdout.write(`${formatSecretScan(result)}\n`);
      process.exitCode = result.errors.length
        ? 2
        : result.findings.length
          ? 1
          : 0;
    }
  } catch {
    process.stderr.write(
      "Secret scan could not start. Use --help for supported arguments.\n",
    );
    process.exitCode = 2;
  }
}
