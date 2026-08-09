import { createAuditEventInDb } from "@piphacklup/db";
import type { AuditEvent } from "@piphacklup/core";

export const activityLogUnavailableWarning = "activity_log_unavailable";

type AuditInput = Omit<AuditEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

type AuditWriter = (input: AuditInput) => Promise<AuditEvent>;

export async function recordAuditAfterCommit(
  input: AuditInput,
  writeAudit: AuditWriter = createAuditEventInDb,
): Promise<typeof activityLogUnavailableWarning | null> {
  try {
    await writeAudit(input);
    return null;
  } catch {
    console.error(
      "PipHackLup saved a dashboard change but could not record its audit event.",
    );
    return activityLogUnavailableWarning;
  }
}
