import { describe, expect, it, vi } from "vitest";
import { safelyHandleDiscordEvent } from "../src/lib/discord-event-safety.js";

describe("safelyHandleDiscordEvent", () => {
  it("contains a rejected Discord reply without exposing its raw error", async () => {
    const reply = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(
        new Error("Discord body included secret-token-and-user-content"),
      );
    const logger = vi.fn<(message: string) => void>();

    await expect(
      safelyHandleDiscordEvent(
        "message-create",
        "guild-safe-boundary",
        reply,
        logger,
      ),
    ).resolves.toBeUndefined();

    expect(reply).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(
      "PipHackLup Discord message-create handler failed in guild guild-safe-boundary.",
    );
    expect(logger.mock.calls.flat().join(" ")).not.toContain(
      "secret-token-and-user-content",
    );
  });
});
