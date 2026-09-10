import { describe, expect, it } from "vitest";
import { planCommandDeployment } from "../src/lib/command-deployment.js";

describe("command deployment plan", () => {
  it("targets only the configured isolated guild by default", () => {
    expect(
      planCommandDeployment({
        testGuildId: "1536112346458624091",
        arguments: [],
      }),
    ).toEqual({ scope: "guild", guildId: "1536112346458624091" });
  });

  it("requires an explicit flag for global publication", () => {
    expect(planCommandDeployment({ arguments: ["--global"] })).toEqual({
      scope: "global",
    });
    expect(() => planCommandDeployment({ arguments: [] })).toThrow(
      "Command deployment stopped",
    );
  });

  it("rejects conflicting or misspelled deployment targets", () => {
    expect(() =>
      planCommandDeployment({
        testGuildId: "1536112346458624091",
        arguments: ["--global"],
      }),
    ).toThrow("cannot run while DISCORD_TEST_GUILD_ID is set");
    expect(() => planCommandDeployment({ arguments: ["--gloabl"] })).toThrow(
      "Unknown command deployment option",
    );
  });
});
