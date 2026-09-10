import {
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { describe, expect, it } from "vitest";
import {
  hasVerifiedStaffPrivateAcl,
  type PrivateEscalationOverwriteLike,
} from "../src/lib/escalation-channel.js";

function overwrite(
  id: string,
  type: OverwriteType,
  allow: bigint[] = [],
  deny: bigint[] = [],
): PrivateEscalationOverwriteLike {
  return {
    id,
    type,
    allow: new PermissionsBitField(allow),
    deny: new PermissionsBitField(deny),
  };
}

describe("staff-private escalation channel verification", () => {
  const baseInput = {
    everyoneRoleId: "everyone",
    botMemberId: "bot",
    allowedStaffRoleIds: new Set(["staff"]),
    overwrites: [
      overwrite(
        "everyone",
        OverwriteType.Role,
        [],
        [PermissionFlagsBits.ViewChannel],
      ),
      overwrite("bot", OverwriteType.Member, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]),
      overwrite("staff", OverwriteType.Role, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]),
    ],
  } as const;

  it("accepts a channel visible only to the bot and verified staff roles", () => {
    expect(hasVerifiedStaffPrivateAcl(baseInput)).toBe(true);
  });

  it("rejects hostile role and member View Channel grants", () => {
    expect(
      hasVerifiedStaffPrivateAcl({
        ...baseInput,
        overwrites: [
          ...baseInput.overwrites,
          overwrite("participant", OverwriteType.Role, [
            PermissionFlagsBits.ViewChannel,
          ]),
        ],
      }),
    ).toBe(false);
    expect(
      hasVerifiedStaffPrivateAcl({
        ...baseInput,
        overwrites: [
          ...baseInput.overwrites,
          overwrite("unrelated-member", OverwriteType.Member, [
            PermissionFlagsBits.ViewChannel,
          ]),
        ],
      }),
    ).toBe(false);
  });

  it("rejects missing everyone denial or bot send access", () => {
    expect(
      hasVerifiedStaffPrivateAcl({
        ...baseInput,
        overwrites: baseInput.overwrites.slice(1),
      }),
    ).toBe(false);
    expect(
      hasVerifiedStaffPrivateAcl({
        ...baseInput,
        overwrites: [
          baseInput.overwrites[0]!,
          overwrite("bot", OverwriteType.Member, [
            PermissionFlagsBits.ViewChannel,
          ]),
          baseInput.overwrites[2]!,
        ],
      }),
    ).toBe(false);
  });
});
