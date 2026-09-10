import { describe, expect, it } from "vitest";
import {
  buildWelcomeMessage,
  selectAmbientEscalationRoleId,
} from "../src/lib/discord-copy.js";

describe("Discord message routing and copy", () => {
  it("routes ambient mentor and staff escalations to their matching roles", () => {
    const configRoles = {
      mentor: "config-mentor",
      organizer: "config-organizer",
      moderator: "config-moderator",
    };

    expect(
      selectAmbientEscalationRoleId({
        target: "mentor",
        settings: { mentorRoleId: "settings-mentor", staffRoleId: "staff" },
        configRoles,
      }),
    ).toBe("settings-mentor");
    expect(
      selectAmbientEscalationRoleId({
        target: "mentor",
        settings: {},
        configRoles,
      }),
    ).toBe("config-mentor");
    expect(
      selectAmbientEscalationRoleId({
        target: "staff",
        settings: { mentorRoleId: "mentor", staffRoleId: "settings-staff" },
        configRoles,
      }),
    ).toBe("settings-staff");
    expect(
      selectAmbientEscalationRoleId({
        target: "staff",
        settings: {},
        configRoles,
      }),
    ).toBe("config-organizer");
  });

  it("uses a valid plain slash-command instruction in welcome payloads", () => {
    const content = buildWelcomeMessage("<@participant>");

    expect(content).toContain("`/onboard checklist`");
    expect(content).not.toContain("</onboard checklist:");
    expect(content).not.toContain(":0>");
  });
});
