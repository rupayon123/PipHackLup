import { describe, expect, it } from "vitest";
import type { DiscordSession } from "../lib/discord-auth";
import { selectGuildForWorkspace } from "../lib/guild-workspace";

const session: DiscordSession = {
  user: {
    id: "1512918151313231983",
    username: "eventorganizer",
    globalName: "Event Organizer",
  },
  guilds: [
    {
      id: "1512918151313231984",
      name: "North Star Hackathon",
      isOwner: true,
      permissions: "32",
      canManage: true,
    },
    {
      id: "1512918151313231985",
      name: "Weekend Builders",
      isOwner: false,
      permissions: "32",
      canManage: true,
    },
  ],
  issuedAt: 1_786_304_000_000,
};

describe("selectGuildForWorkspace", () => {
  it("uses the first manageable guild only when no explicit guild was requested", () => {
    expect(selectGuildForWorkspace(session)).toEqual({
      guild: session.guilds[0],
      requestedGuildUnavailable: false,
    });
  });

  it("returns the exact requested manageable guild", () => {
    expect(selectGuildForWorkspace(session, "1512918151313231985")).toEqual({
      guild: session.guilds[1],
      requestedGuildUnavailable: false,
    });
  });

  it("fails closed instead of falling back when an explicit guild is unavailable", () => {
    expect(selectGuildForWorkspace(session, "1512918151313231999")).toEqual({
      guild: null,
      requestedGuildUnavailable: true,
    });
  });
});
