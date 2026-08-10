import { expect, test } from "@playwright/test";

test("public page has one clear Discord path and specific event-day copy", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "PipHackLup" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with Discord" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Built for the busiest parts of event day",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Create the Discord app under your account."),
  ).toHaveCount(0);
});

test("protected routes show an honest sign-in gate without sample records", async ({
  page,
}) => {
  for (const route of [
    "/dashboard",
    "/setup",
    "/queues",
    "/teams",
    "/moderation",
    "/training",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", {
        name: "Sign in with Discord to manage your servers",
      }),
    ).toBeVisible();
    await expect(page.getByText("Iceberg Labs")).toHaveCount(0);
    await expect(page.getByText("Preview Hackathon Server")).toHaveCount(0);
  }
});

test("auth recovery copy explains canceled, expired, and safe sign-out states", async ({
  page,
}) => {
  for (const [status, message] of [
    ["denied", "Discord sign-in was canceled"],
    ["expired", "Your sign-in request expired"],
    ["logout_requires_post", "sign-out only works from the button"],
  ] as const) {
    await page.goto(`/dashboard?auth=${status}`);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
  }
});

test("signed-in control-room fixture exposes server lifecycle and filtering", async ({
  page,
}) => {
  await page.goto("/dev-fixtures/control-room");

  await expect(
    page.getByRole("heading", { name: "Your Discord servers" }),
  ).toBeVisible();
  const installedServer = page.locator(".server-card").filter({
    has: page.getByRole("heading", { name: "North Star Hackathon" }),
  });
  const uninstalledServer = page
    .locator(".server-card")
    .filter({ has: page.getByRole("heading", { name: "Weekend Builders" }) });
  await expect(installedServer).toBeVisible();
  await expect(
    installedServer.getByText("Installed", { exact: true }),
  ).toBeVisible();
  await expect(
    installedServer.getByRole("link", { name: "Set up event" }),
  ).toHaveAttribute("href", /\/setup\?guildId=/);
  await expect(
    installedServer.getByRole("link", { name: "Q&A answers" }),
  ).toHaveAttribute("href", /\/training\?guildId=/);
  await expect(
    uninstalledServer.getByText("Not installed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Status unavailable", exact: true }),
  ).toBeVisible();

  await page.getByPlaceholder("Find a server").fill("Weekend");
  await expect(
    page.getByRole("heading", { name: "Weekend Builders" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "North Star Hackathon" }),
  ).toHaveCount(0);
  await page.getByPlaceholder("Find a server").fill("not a real server");
  await expect(page.getByText("No servers match those filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "North Star Hackathon" }),
  ).toBeVisible();
});

test("remove-bot failures stay visible inside the confirmation dialog", async ({
  page,
}) => {
  await page.route("**/api/discord/guilds/*/bot", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "discord_bot_api_failed" }),
    });
  });
  await page.goto("/dev-fixtures/control-room");
  await page.getByRole("button", { name: "Remove bot" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("North Star Hackathon");
  await dialog.getByRole("button", { name: "Remove bot", exact: true }).click();
  await expect(
    dialog.getByRole("alert").filter({
      hasText: "Discord did not complete the removal",
    }),
  ).toBeVisible();
});

test("successful Discord removal surfaces a non-destructive activity-record warning", async ({
  page,
}) => {
  await page.route("**/api/discord/guilds/*/bot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: false,
        result: "left",
        warning: "record_update_failed",
      }),
    });
  });
  await page.goto("/dev-fixtures/control-room");
  await page.getByRole("button", { name: "Remove bot" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("North Star Hackathon");
  await dialog.getByRole("button", { name: "Remove bot", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("status").filter({
      hasText: "Discord removed PipHackLup from North Star Hackathon",
    }),
  ).toContainText("could not update its activity record");
  const installedServer = page.locator(".server-card").filter({
    has: page.getByRole("heading", { name: "North Star Hackathon" }),
  });
  await expect(
    installedServer.getByText("Not installed", { exact: true }),
  ).toBeVisible();
});

test("training fixture uses friendly controls and real empty-safe states", async ({
  page,
}) => {
  await page.goto("/dev-fixtures/training");

  await expect(
    page.getByRole("heading", { name: "Train North Star Hackathon" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add an answer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Human follow-up" }),
  ).toBeVisible();
  await expect(page.getByText("Where is participant check-in?")).toBeVisible();
  await expect(page.getByText("Staff role ID")).toHaveCount(0);
  await expect(page.getByText("Preview mode")).toHaveCount(0);

  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Add both a participant" }),
  ).toBeVisible();
  await expect(page.getByLabel("Participant question or topic")).toBeFocused();
  await expect(
    page.getByLabel("Participant question or topic"),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Answer PipHackLup should give"),
  ).toHaveAttribute("aria-invalid", "true");
});

test("setup desk validates inline and saves only the selected server configuration", async ({
  page,
}) => {
  let savedBody: Record<string, unknown> | null = null;
  await page.route("**/api/discord/guilds/*/options", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        roles: [
          { id: "1512918151313231986", name: "Participant" },
          { id: "1512918151313231989", name: "Organizer" },
        ],
        channels: [
          { id: "1512918151313231987", name: "#help-desk" },
          { id: "1512918151313231990", name: "#announcements" },
        ],
      }),
    });
  });
  await page.route("**/api/discord/guilds/*/config", async (route) => {
    savedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ config: savedBody, warning: null }),
    });
  });

  await page.goto("/dev-fixtures/setup");

  await expect(
    page.getByRole("heading", { name: "Shape this server's workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText("Live choices loaded from North Star Hackathon"),
  ).toBeVisible();
  await expect(page.getByLabel("Participant role")).toHaveValue(
    "1512918151313231986",
  );

  await page.getByLabel("Event name").fill("North Star Build Weekend");
  await page.getByLabel("Minimum").fill("8");
  await page.getByLabel("Maximum").fill("4");
  await page.getByRole("button", { name: "Save event settings" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Check the highlighted" }),
  ).toBeVisible();
  await expect(page.getByLabel("Minimum")).toBeFocused();
  await expect(page.getByLabel("Minimum")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(savedBody).toBeNull();

  await page.getByLabel("Minimum").fill("2");
  await page.getByLabel("Maximum").fill("6");
  await page.getByLabel("Organizer role").selectOption("1512918151313231989");
  await page.getByRole("button", { name: "Save event settings" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Settings saved for North Star Hackathon" }),
  ).toBeVisible();
  expect(savedBody).toMatchObject({
    eventName: "North Star Build Weekend",
    onboardingMode: "gated",
    teamSizeMin: 2,
    teamSizeMax: 6,
    roles: {
      participant: "1512918151313231986",
      organizer: "1512918151313231989",
    },
    channels: { helpDesk: "1512918151313231987" },
  });
  expect(savedBody).not.toHaveProperty("guildId");
  expect(savedBody).not.toHaveProperty("resources");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("mobile navigation keeps readable labels and a secondary menu", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile project only");
  await page.goto("/dev-fixtures/control-room");

  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Q&A Training" })).toBeVisible();
  await page.getByText("More", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Queues" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Teams" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Moderation" })).toBeVisible();
});

test("short landscape layouts let the workspace scroll past the organizer header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/dev-fixtures/control-room");

  await expect(page.locator(".sidebar")).toHaveCSS("position", "static");

  await page.getByRole("button", { name: "Remove bot" }).click();
  const removeButton = page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove bot", exact: true });
  const bounds = await removeButton.boundingBox();

  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(374);
});

test("an unavailable requested server is not shown as a different selected server", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "piphacklup:last-guild:1512918151313231983",
      "1512918151313231985",
    );
  });
  await page.goto("/dev-fixtures/control-room?guildId=999999999999999999");

  await expect(page.getByLabel("Selected Discord server")).toHaveValue("");
  await expect(
    page.getByRole("option", { name: "Choose a server" }),
  ).toBeAttached();
});

test("server workspaces restore the last still-manageable server for each Discord user", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "piphacklup:last-guild:1512918151313231983",
      "1512918151313231985",
    );
  });
  await page.goto("/dev-fixtures/control-room");

  await expect(page).toHaveURL(/guildId=1512918151313231985/);
  await expect(page.getByLabel("Selected Discord server")).toHaveValue(
    "1512918151313231985",
  );
});

test("Q&A settings distinguish an unknown bot status and keep touch controls usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev-fixtures/training?installation=unknown");

  await expect(
    page.getByText(
      "Installation status is temporarily unavailable, so Discord roles and channels cannot be loaded.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Add PipHackLup to this server before choosing Discord roles and channels.",
    ),
  ).toHaveCount(0);

  const toggleBounds = await page
    .getByText("Answer in the channel by default")
    .locator("..")
    .boundingBox();
  expect(toggleBounds).not.toBeNull();
  expect(toggleBounds!.height).toBeGreaterThanOrEqual(44);
});

test("saved answers require a named keyboard-friendly confirmation and remain retryable after errors", async ({
  page,
}) => {
  await page.route("**/api/training/entries?**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "database_unavailable" }),
    });
  });
  await page.goto("/dev-fixtures/training");

  const remove = page.getByRole("button", {
    name: "Remove Where is participant check-in?",
  });
  await remove.click();
  const confirmation = page.getByRole("group", {
    name: "Confirm removal of Where is participant check-in?",
  });
  const confirm = confirmation.getByRole("button", {
    name: "Confirm remove",
  });
  await expect(confirmation).toContainText("Where is participant check-in?");
  await expect(confirm).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(remove).toBeFocused();

  await remove.click();
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".training-notice[role='alert']")).toContainText(
    "saved answers are temporarily unavailable",
  );
  await expect(confirmation).toBeVisible();
  await expect(confirm).toBeFocused();
});

test("oversized Q&A imports explain the 50-entry limit without implying a partial save", async ({
  page,
}) => {
  await page.route("**/api/training/entries?**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "training_import_too_many_entries" }),
    });
  });
  await page.goto("/dev-fixtures/training");
  await page.getByLabel("Event details").fill("Question | Answer");
  await page.getByRole("button", { name: "Import details" }).click();

  const notice = page.locator(".training-notice[role='alert']");
  await expect(notice).toContainText("more than 50 event details");
  await expect(notice).toContainText("every answer can be reviewed and saved");
});

test("saved dark mode settles correctly and the theme toggle persists light mode", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("piphacklup-dashboard-theme", "dark");
  });
  await page.goto("/dev-fixtures/control-room");

  await expect(page.locator("html")).toHaveAttribute(
    "data-dashboard-theme",
    "dark",
  );
  await expect(page.locator(".shell")).toHaveCSS("color-scheme", "dark");
  const toggle = page.getByRole("button", {
    name: "Switch dashboard to light mode",
  });
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-dashboard-theme",
    "light",
  );
  await expect(page.locator(".shell")).toHaveCSS("color-scheme", "normal");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("piphacklup-dashboard-theme"),
      ),
    )
    .toBe("light");
});
