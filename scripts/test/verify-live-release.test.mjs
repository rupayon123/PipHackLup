import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPECTED_COMMAND_NAMES,
  PRODUCTION_FIXTURE_PATHS,
  VerificationError,
  buildConfiguration,
  normalizeBaseUrl,
  parseArguments,
  readOnlyFetch,
  redactSecrets,
  runVerification,
  verifyDiscordRelease,
  verifyWebRelease,
} from "../verify-live-release.mjs";

const BASE_URL = "https://release.example";
const CLIENT_ID = "1536112346458624090";
const GUILD_ID = "1536112346458624091";
const GUILD_NAME = "PipHackLup Release Lab";
const BOT_TOKEN = "test_token_value_that_is_long_enough";
const OAUTH_STATE = "a".repeat(32);
const RELEASE_SHA = "be10970eb0770448cd507a1ebccf67809bb0bd75";

test("default expected commands mirror the bot's top-level slash commands", async () => {
  const definitions = await readFile(
    new URL("../../apps/bot/src/commands/definitions.ts", import.meta.url),
    "utf8",
  );
  const commandNames = [
    ...definitions.matchAll(
      /^  new SlashCommandBuilder\(\)\n    \.setName\("([a-z0-9_-]+)"\)/gmu,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(commandNames, [...EXPECTED_COMMAND_NAMES]);
});

test("buildConfiguration keeps Discord disabled unless explicitly requested", () => {
  const configuration = buildConfiguration(
    parseArguments([
      "--base-url",
      BASE_URL,
      "--expected-client-id",
      CLIENT_ID,
      "--expected-release-sha",
      RELEASE_SHA,
    ]),
    {
      DISCORD_CLIENT_ID: CLIENT_ID,
      DISCORD_TOKEN: BOT_TOKEN,
    },
  );

  assert.equal(configuration.baseUrl, BASE_URL);
  assert.equal(configuration.discord, undefined);
});

test("Discord guild options require the explicit read-only opt-in", () => {
  assert.throws(
    () =>
      buildConfiguration(
        parseArguments([
          "--base-url",
          BASE_URL,
          "--expected-client-id",
          CLIENT_ID,
          "--expected-release-sha",
          RELEASE_SHA,
          "--test-guild-id",
          GUILD_ID,
        ]),
      ),
    /explicit --discord-read-only flag/u,
  );
});

test("Discord verification requires environment-only credentials and exact guild identity", () => {
  const parsed = parseArguments([
    "--base-url",
    BASE_URL,
    "--expected-client-id",
    CLIENT_ID,
    "--expected-release-sha",
    RELEASE_SHA,
    "--discord-read-only",
    "--test-guild-id",
    GUILD_ID,
    "--expected-guild-name",
    GUILD_NAME,
  ]);

  assert.throws(() => buildConfiguration(parsed, {}), /DISCORD_CLIENT_ID/u);
  assert.throws(
    () =>
      buildConfiguration(parsed, {
        DISCORD_CLIENT_ID: CLIENT_ID,
        DISCORD_TOKEN: "placeholder",
      }),
    /DISCORD_TOKEN/u,
  );
  assert.throws(
    () =>
      buildConfiguration(parsed, {
        DISCORD_CLIENT_ID: "1536112346458624099",
        DISCORD_TOKEN: BOT_TOKEN,
      }),
    /does not match --expected-client-id/u,
  );

  const configuration = buildConfiguration(parsed, {
    DISCORD_CLIENT_ID: CLIENT_ID,
    DISCORD_TOKEN: BOT_TOKEN,
  });
  assert.deepEqual(
    configuration.discord.expectedCommands,
    [...EXPECTED_COMMAND_NAMES].toSorted(),
  );
  assert.equal(configuration.discord.expectedGuildName, GUILD_NAME);
  assert.equal(configuration.discord.testGuildId, GUILD_ID);
});

test("mutation and unknown CLI options fail closed", () => {
  for (const argument of [
    "--deploy",
    "--install",
    "--register-commands",
    "--remove",
    "--setup",
    "--write",
  ]) {
    assert.throws(
      () => parseArguments([argument]),
      /forbidden; this verifier is read-only/u,
    );
  }
  assert.throws(() => parseArguments(["--surprise"]), /Unknown option/u);
  assert.throws(
    () => parseArguments(["--base-url", BASE_URL, "--base-url", BASE_URL]),
    /may be provided only once/u,
  );
  assert.throws(
    () => parseArguments(["accidental-secret-value"]),
    (error) => {
      assert.equal(error.message.includes("accidental-secret-value"), false);
      return true;
    },
  );
});

test("the web gate requires an exact release commit", () => {
  assert.throws(
    () =>
      buildConfiguration(
        parseArguments([
          "--base-url",
          BASE_URL,
          "--expected-client-id",
          CLIENT_ID,
        ]),
      ),
    /--expected-release-sha/u,
  );
  assert.throws(
    () =>
      buildConfiguration(
        parseArguments([
          "--base-url",
          BASE_URL,
          "--expected-client-id",
          CLIENT_ID,
          "--expected-release-sha",
          "not-a-commit",
        ]),
      ),
    /40-character Git commit SHA/u,
  );
});

test("base URLs require a clean HTTPS origin or explicit loopback opt-in", () => {
  assert.equal(normalizeBaseUrl(`${BASE_URL}/`), BASE_URL);
  assert.equal(
    normalizeBaseUrl("http://127.0.0.1:3000", true),
    "http://127.0.0.1:3000",
  );
  assert.throws(
    () => normalizeBaseUrl("http://release.example"),
    /must use HTTPS/u,
  );
  assert.throws(
    () => normalizeBaseUrl("https://user:password@release.example"),
    /must not contain credentials/u,
  );
  assert.throws(
    () => normalizeBaseUrl("https://release.example/path"),
    /without a path/u,
  );
  assert.throws(
    () => normalizeBaseUrl("https://release.example?token=secret"),
    /query string/u,
  );
});

test("readOnlyFetch rejects mutation methods and request bodies before transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };

  await assert.rejects(
    readOnlyFetch(transport, `${BASE_URL}/api/example`, { method: "POST" }),
    /HTTP POST is forbidden/u,
  );
  await assert.rejects(
    readOnlyFetch(transport, `${BASE_URL}/api/example`, { body: "payload" }),
    /Request bodies are forbidden/u,
  );
  assert.equal(calls, 0);
});

test("web verification proves ready health, a hardened Discord redirect, and hidden fixtures", async () => {
  const calls = [];
  const transport = createHappyWebTransport(calls);

  const results = await verifyWebRelease(webConfiguration(), transport);

  assert.deepEqual(
    results.map((result) => result.check),
    [
      "web-health",
      "discord-oauth-redirect",
      ...PRODUCTION_FIXTURE_PATHS.map(() => "fixture-not-exposed"),
    ],
  );
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.method, "GET");
    assert.equal(call.redirect, "manual");
    assert.equal(call.cache, "no-store");
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(call.authorization, null);
  }
});

test("web verification fails when health is not ready or a fixture is exposed", async (context) => {
  await context.test("not-ready health", async () => {
    const transport = async (input) => {
      if (new URL(input).pathname === "/api/health") {
        return jsonResponse(
          { ok: false, app: "PipHackLup web", status: "not_ready" },
          503,
        );
      }
      throw new Error("unexpected request");
    };
    await assert.rejects(
      verifyWebRelease(webConfiguration(), transport),
      /Web health returned HTTP 503/u,
    );
  });

  await context.test("wrong deployed release", async () => {
    const transport = async (input) => {
      if (new URL(input).pathname === "/api/health") {
        return jsonResponse(
          {
            ok: true,
            app: "PipHackLup web",
            status: "ready",
            release: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          200,
          { "cache-control": "no-store" },
        );
      }
      throw new Error("unexpected request");
    };
    await assert.rejects(
      verifyWebRelease(webConfiguration(), transport),
      /expected ready release/u,
    );
  });

  await context.test("exposed fixture", async () => {
    const transport = createHappyWebTransport([], {
      exposedFixture: PRODUCTION_FIXTURE_PATHS[0],
    });
    await assert.rejects(
      verifyWebRelease(webConfiguration(), transport),
      /returned HTTP 200; expected 404/u,
    );
  });
});

test("web verification rejects OAuth redirects away from Discord", async () => {
  const transport = createHappyWebTransport([], {
    oauthLocation: "https://attacker.example/oauth2/authorize",
  });
  await assert.rejects(
    verifyWebRelease(webConfiguration(), transport),
    /did not redirect to Discord/u,
  );
});

test("web verification binds the hardened state cookie to the OAuth redirect", async () => {
  const transport = createHappyWebTransport([], {
    mismatchedStateCookie: true,
  });
  await assert.rejects(
    verifyWebRelease(webConfiguration(), transport),
    /state cookie is missing required security attributes/u,
  );
});

test("web verification rejects a different Discord client, borrowed cookie attributes, and permanent redirects", async (context) => {
  await context.test("different valid client ID", async () => {
    await assert.rejects(
      verifyWebRelease(
        webConfiguration(),
        createHappyWebTransport([], {
          oauthClientId: "1536112346458624099",
        }),
      ),
      /invalid client, callback, state, response type, or scopes/u,
    );
  });

  await context.test("attributes on a different cookie", async () => {
    await assert.rejects(
      verifyWebRelease(
        webConfiguration(),
        createHappyWebTransport([], { borrowedCookieAttributes: true }),
      ),
      /state cookie is missing required security attributes/u,
    );
  });

  await context.test("permanent redirect", async () => {
    await assert.rejects(
      verifyWebRelease(
        webConfiguration(),
        createHappyWebTransport([], { oauthStatus: 308 }),
      ),
      /expected a redirect/u,
    );
  });

  await context.test("cacheable redirect", async () => {
    await assert.rejects(
      verifyWebRelease(
        webConfiguration(),
        createHappyWebTransport([], {
          oauthCacheControl: "public, max-age=60",
        }),
      ),
      /OAuth start is missing the required no-store/u,
    );
  });
});

test("web verification cancels a streamed JSON response above the byte limit", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
    },
  });
  const transport = async () =>
    new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-length": "1",
        "content-type": "application/json",
      },
      status: 200,
    });

  await assert.rejects(
    verifyWebRelease(webConfiguration(), transport),
    /Web health response is unexpectedly large/u,
  );
  assert.equal(cancelled, true);
});

test("Discord verification reads only the exact bot, guild, membership, and guild commands", async () => {
  const calls = [];
  const configuration = liveDiscordConfiguration();
  const transport = createHappyDiscordTransport(calls);

  const results = await verifyDiscordRelease(configuration, transport);

  assert.deepEqual(
    results.map((result) => result.check),
    ["discord-application", "discord-isolated-guild", "discord-guild-commands"],
  );
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/api/v10/oauth2/applications/@me",
      "/api/v10/users/@me",
      `/api/v10/guilds/${GUILD_ID}`,
      `/api/v10/guilds/${GUILD_ID}/members/${CLIENT_ID}`,
      `/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`,
    ],
  );
  for (const call of calls) {
    assert.equal(call.origin, "https://discord.com");
    assert.equal(call.method, "GET");
    assert.equal(call.authorization, `Bot ${BOT_TOKEN}`);
    assert.ok(call.signal instanceof AbortSignal);
  }
  assert.ok(calls.every((call) => call.path !== "/api/v10/users/@me/guilds"));
});

test("Discord verification fails closed on the wrong guild or command set", async (context) => {
  await context.test("wrong guild name", async () => {
    await assert.rejects(
      verifyDiscordRelease(
        liveDiscordConfiguration(),
        createHappyDiscordTransport([], { guildName: "Production Community" }),
      ),
      /does not exactly match the isolated test server/u,
    );
  });

  await context.test("missing expected command", async () => {
    await assert.rejects(
      verifyDiscordRelease(
        liveDiscordConfiguration(),
        createHappyDiscordTransport([], { missingCommand: "setup" }),
      ),
      /1 missing, 0 unexpected/u,
    );
  });

  await context.test("unexpected obsolete command", async () => {
    await assert.rejects(
      verifyDiscordRelease(
        liveDiscordConfiguration(),
        createHappyDiscordTransport([], { extraCommand: "obsolete" }),
      ),
      /0 missing, 1 unexpected/u,
    );
  });
});

test("transport failures and formatter output never expose a Discord token", async () => {
  const configuration = liveDiscordConfiguration();
  await assert.rejects(
    verifyDiscordRelease(configuration, async () => {
      throw new Error(`transport echoed ${BOT_TOKEN}`);
    }),
    (error) => {
      assert.ok(error instanceof VerificationError);
      assert.equal(error.message.includes(BOT_TOKEN), false);
      return true;
    },
  );

  assert.equal(
    redactSecrets(`Authorization: Bot ${BOT_TOKEN}`, [BOT_TOKEN]),
    "Authorization: Bot [REDACTED]",
  );
});

test("combined verification skips Discord by default", async () => {
  const report = await runVerification(
    webConfiguration(),
    createHappyWebTransport([]),
  );
  assert.equal(report.discordSkipped, true);
  assert.deepEqual(report.discord, []);
  assert.equal(report.interactiveE2ERequired, true);
});

function webConfiguration() {
  return {
    baseUrl: BASE_URL,
    expectedDiscordClientId: CLIENT_ID,
    expectedReleaseSha: RELEASE_SHA,
    timeoutMs: 5_000,
  };
}

function liveDiscordConfiguration() {
  return {
    baseUrl: BASE_URL,
    discord: {
      clientId: CLIENT_ID,
      expectedCommands: [...EXPECTED_COMMAND_NAMES].toSorted(),
      expectedGuildName: GUILD_NAME,
      testGuildId: GUILD_ID,
      token: BOT_TOKEN,
    },
    expectedDiscordClientId: CLIENT_ID,
    expectedReleaseSha: RELEASE_SHA,
    timeoutMs: 5_000,
  };
}

function createHappyWebTransport(
  calls,
  {
    borrowedCookieAttributes = false,
    exposedFixture,
    mismatchedStateCookie = false,
    oauthCacheControl = "private, no-store",
    oauthClientId = CLIENT_ID,
    oauthLocation,
    oauthStatus = 307,
  } = {},
) {
  return async (input, init) => {
    const url = new URL(input);
    calls.push({
      authorization: new Headers(init.headers).get("authorization"),
      cache: init.cache,
      method: init.method,
      path: url.pathname,
      redirect: init.redirect,
      signal: init.signal,
    });

    if (url.pathname === "/api/health") {
      return jsonResponse(
        {
          ok: true,
          app: "PipHackLup web",
          status: "ready",
          release: RELEASE_SHA,
        },
        200,
        { "cache-control": "private, no-store" },
      );
    }
    if (url.pathname === "/api/auth/discord/start") {
      const authorize = new URL(
        oauthLocation ?? "https://discord.com/oauth2/authorize",
      );
      if (!oauthLocation) {
        authorize.searchParams.set("client_id", oauthClientId);
        authorize.searchParams.set(
          "redirect_uri",
          `${BASE_URL}/api/auth/discord/callback`,
        );
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("scope", "identify guilds");
        authorize.searchParams.set("state", OAUTH_STATE);
      }
      const headers = new Headers({
        "cache-control": oauthCacheControl,
        location: authorize.toString(),
      });
      const stateCookie = `piphacklup_oauth_state=${mismatchedStateCookie ? "b".repeat(32) : OAUTH_STATE}`;
      if (borrowedCookieAttributes) {
        headers.append("set-cookie", `${stateCookie}; Path=/`);
        headers.append(
          "set-cookie",
          "unrelated_cookie=value; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax",
        );
      } else {
        headers.append(
          "set-cookie",
          `${stateCookie}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        );
      }
      return new Response(null, { headers, status: oauthStatus });
    }
    if (PRODUCTION_FIXTURE_PATHS.includes(url.pathname)) {
      return new Response("Not found", {
        headers: { "content-type": "text/html" },
        status: url.pathname === exposedFixture ? 200 : 404,
      });
    }
    throw new Error(`Unexpected web request ${url.pathname}`);
  };
}

function createHappyDiscordTransport(
  calls,
  { extraCommand, guildName = GUILD_NAME, missingCommand } = {},
) {
  return async (input, init) => {
    const url = new URL(input);
    calls.push({
      authorization: new Headers(init.headers).get("authorization"),
      method: init.method,
      origin: url.origin,
      path: url.pathname,
      signal: init.signal,
    });

    switch (url.pathname) {
      case "/api/v10/oauth2/applications/@me":
        return jsonResponse({ id: CLIENT_ID, name: "PipHackLup" });
      case "/api/v10/users/@me":
        return jsonResponse({
          bot: true,
          id: CLIENT_ID,
          username: "PipHackLup",
        });
      case `/api/v10/guilds/${GUILD_ID}`:
        return jsonResponse({ id: GUILD_ID, name: guildName });
      case `/api/v10/guilds/${GUILD_ID}/members/${CLIENT_ID}`:
        return jsonResponse({
          roles: [],
          user: { bot: true, id: CLIENT_ID, username: "PipHackLup" },
        });
      case `/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`:
        return jsonResponse(
          [
            ...EXPECTED_COMMAND_NAMES.filter((name) => name !== missingCommand),
            ...(extraCommand ? [extraCommand] : []),
          ].map((name, index) => ({
            application_id: CLIENT_ID,
            guild_id: GUILD_ID,
            id: `15361123464586241${String(index).padStart(2, "0")}`,
            name,
            type: 1,
          })),
        );
      default:
        throw new Error(`Unexpected Discord request ${url.pathname}`);
    }
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });
}
