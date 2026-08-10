import { Collection, type Guild } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { resolveRoleNotificationTarget } from "../src/lib/role-notification.js";

describe("role-holder notification", () => {
  it("turns holders of a non-mentionable role into bounded user notifications", async () => {
    const members = new Collection([
      ["mentor-a", { id: "mentor-a", user: { bot: false } }],
      ["mentor-b", { id: "mentor-b", user: { bot: false } }],
      ["helper-bot", { id: "helper-bot", user: { bot: true } }],
    ]);
    const guild = {
      members: { fetch: vi.fn(async () => members) },
      roles: {
        fetch: vi.fn(async () => ({ mentionable: false, members })),
      },
    } as unknown as Guild;

    await expect(
      resolveRoleNotificationTarget(guild, "mentor-role", "Mentors"),
    ).resolves.toEqual({
      label: "<@mentor-a> <@mentor-b>",
      userIds: ["mentor-a", "mentor-b"],
      truncated: false,
    });
    expect(guild.members.fetch).toHaveBeenCalledOnce();
    expect(guild.roles.fetch).toHaveBeenCalledWith("mentor-role");
  });

  it("fails safely without granting or requesting broad mention permission", async () => {
    const guild = {
      members: {
        fetch: vi.fn(async () => Promise.reject(new Error("offline"))),
      },
      roles: { fetch: vi.fn() },
    } as unknown as Guild;

    await expect(
      resolveRoleNotificationTarget(guild, "mentor-role", "Mentors"),
    ).resolves.toEqual({
      label: "Mentors",
      userIds: [],
      truncated: false,
    });
    expect(guild.roles.fetch).not.toHaveBeenCalled();
  });
});
