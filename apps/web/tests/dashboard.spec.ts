import { expect, test } from "@playwright/test";

test("dashboard exposes the core hackathon ops views", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Hackathon ops at a glance" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Queues/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Teams/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Moderation/ })).toBeVisible();
});

test("setup page documents required Discord permissions", async ({ page }) => {
  await page.goto("/setup");

  await expect(page.getByRole("heading", { name: "Make a hackathon server understandable" })).toBeVisible();
  await expect(page.getByText("applications.commands")).toBeVisible();
  await expect(page.getByText("Guild Members intent")).toBeVisible();
});
