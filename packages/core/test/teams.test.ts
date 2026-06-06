import { describe, expect, it } from "vitest";
import { createTeam, suggestTeamMatches, type MemberProfile } from "../src/index.js";

const now = "2026-06-06T10:00:00.000Z";

function member(userId: string, skills: string[], interests: string[] = []): MemberProfile {
  return {
    userId,
    displayName: userId,
    skills,
    interests,
    beginnerFriendly: true,
    lookingForTeam: true,
    updatedAt: now
  };
}

describe("team matching", () => {
  it("suggests members who cover desired skills", () => {
    const owner = member("owner", ["product"]);
    const team = createTeam({
      guildId: "g1",
      owner,
      name: "Penguin Labs",
      desiredSkills: ["frontend", "design", "ai"],
      projectIdea: "AI mentor assistant",
      now
    });
    const suggestions = suggestTeamMatches(
      [
        member("frontend", ["frontend", "react"]),
        member("designer", ["design", "figma"]),
        member("random", ["rust"])
      ],
      [team]
    );

    expect(suggestions[0]?.addedMemberIds).toEqual(["frontend", "designer", "random"]);
    expect(suggestions[0]?.score).toBeGreaterThan(0);
  });
});
