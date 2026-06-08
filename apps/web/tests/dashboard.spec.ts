import { expect, test } from "@playwright/test";

test("dashboard exposes the core hackathon ops views", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { name: "Hackathon ops at a glance" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Q&A Training/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Queues/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Teams/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Moderation/ })).toBeVisible();
});

test("training page supports Discord-linked Q&A training", async ({ page }) => {
  await page.goto("/training");

  await expect(
    page.getByRole("heading", { name: "Train PipHackLup from the site" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Linked Discord Account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Train Event Details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ask Preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Training Library" }),
  ).toBeVisible();
});

test("setup page documents required Discord permissions", async ({ page }) => {
  await page.goto("/setup");

  await expect(
    page.getByRole("heading", {
      name: "Make a hackathon server understandable",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("applications.commands", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Guild Members intent")).toBeVisible();
});
