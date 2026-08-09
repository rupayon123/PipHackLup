import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@piphacklup/core";
import {
  activityLogUnavailableWarning,
  recordAuditAfterCommit,
} from "../lib/audit-log";

const input = {
  guildId: "1512918151313231984",
  actorId: "1512918151313231983",
  action: "knowledge.create",
  targetType: "knowledge" as const,
  targetId: "know_fixture01",
  metadata: {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordAuditAfterCommit", () => {
  it("returns no warning when the activity log is recorded", async () => {
    const writer = vi.fn(
      async (): Promise<AuditEvent> => ({
        ...input,
        id: "audit_fixture01",
        createdAt: "2026-08-09T16:00:00.000Z",
      }),
    );

    await expect(recordAuditAfterCommit(input, writer)).resolves.toBeNull();
    expect(writer).toHaveBeenCalledWith(input);
  });

  it("returns an explicit warning without exposing the database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const writer = vi.fn(async (): Promise<AuditEvent> => {
      throw new Error("postgres://secret@example.invalid");
    });

    await expect(recordAuditAfterCommit(input, writer)).resolves.toBe(
      activityLogUnavailableWarning,
    );
    expect(log).toHaveBeenCalledWith(
      "PipHackLup saved a dashboard change but could not record its audit event.",
    );
  });
});
