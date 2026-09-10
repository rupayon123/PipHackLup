#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(repositoryRoot, "apps", "web");
const nextBin = join(webRoot, "node_modules", "next", "dist", "bin", "next");
const host = "localhost";
const port = 31_399;
const origin = `http://${host}:${port}`;
const configurationKeys = [
  "DATABASE_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_TOKEN",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "PIPHACKLUP_UI_TEST_MODE",
  "VERCEL_URL",
];

const childEnvironment = { ...process.env, NODE_ENV: "production" };
for (const key of configurationKeys) delete childEnvironment[key];

const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", host, "--port", String(port)],
  {
    cwd: webRoot,
    env: childEnvironment,
    stdio: "ignore",
  },
);
let spawnFailed = false;
server.on("error", () => {
  spawnFailed = true;
});

try {
  await waitForServer(server, `${origin}/`);

  const home = await get("/");
  assertStatus(home, 200, "homepage");

  const health = await get("/api/health");
  assertStatus(health, 503, "unconfigured health");
  const healthBody = await health.json();
  if (
    healthBody?.ok !== false ||
    healthBody?.app !== "PipHackLup web" ||
    healthBody?.status !== "not_ready"
  ) {
    throw new Error("unconfigured health did not fail closed");
  }
  if (!hasNoStore(health.headers.get("cache-control"))) {
    throw new Error("unconfigured health is missing no-store");
  }

  const auth = await get("/api/auth/discord/start");
  if (
    ![302, 303, 307].includes(auth.status) ||
    auth.headers.get("location") !== `${origin}/dashboard?auth=missing`
  ) {
    throw new Error(
      "unconfigured OAuth did not redirect to the safe recovery state",
    );
  }

  for (const path of ["/dev-fixtures/control-room", "/dev-fixtures/training"]) {
    assertStatus(await get(path), 404, `production fixture ${path}`);
  }

  const dashboard = await get("/dashboard");
  assertStatus(dashboard, 200, "signed-out dashboard");
  const dashboardHtml = await dashboard.text();
  for (const forbidden of ["Preview Hackathon Server", "Sample Hackathon"]) {
    if (dashboardHtml.includes(forbidden)) {
      throw new Error("signed-out production dashboard exposed fixture data");
    }
  }

  console.log(
    "Production web smoke passed: next start booted, configuration failed closed, fixtures stayed hidden, and no sample guild data rendered.",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  console.error(`Production web smoke failed: ${message}.`);
  if (server.exitCode !== null) {
    console.error("The production Next.js process exited before verification.");
  }
  process.exitCode = 1;
} finally {
  await stopServer(server);
}

async function get(path) {
  return fetch(`${origin}${path}`, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
  });
}

async function waitForServer(process_, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnFailed) {
      throw new Error("production Next.js process could not be started");
    }
    if (process_.exitCode !== null) {
      throw new Error("production Next.js process exited during startup");
    }
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status > 0) return;
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(
    "production Next.js process did not become ready in 30 seconds",
  );
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(
      `${label} returned HTTP ${response.status}, expected ${expected}`,
    );
  }
}

function hasNoStore(value) {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("no-store");
}

async function stopServer(process_) {
  if (spawnFailed) return;
  if (process_.exitCode !== null) return;
  process_.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolvePromise) =>
      process_.once("exit", () => resolvePromise(true)),
    ),
    new Promise((resolvePromise) =>
      setTimeout(() => resolvePromise(false), 5_000),
    ),
  ]);
  if (!exited && process_.exitCode === null) process_.kill("SIGKILL");
}
