import { describe, expect, it, vi } from "vitest";
import {
  createGuildPersistenceRetryQueue,
  type GuildPersistenceRetryOperation,
} from "../src/lib/persistence-retry.js";

describe("guild persistence retry queue", () => {
  it("keeps a failed lifecycle operation, retries after the cooldown, and recovers", async () => {
    let now = 0;
    const run = vi
      .fn<(operation: GuildPersistenceRetryOperation) => Promise<void>>()
      .mockRejectedValueOnce(new Error("database offline"))
      .mockResolvedValueOnce(undefined);
    const onFailure = vi.fn();
    const queue = createGuildPersistenceRetryQueue({
      run,
      onFailure,
      cooldownMs: 1_000,
      now: () => now,
    });
    queue.markPending({
      guild: { id: "guild-a", name: "Hack North" },
      installed: true,
    });

    await queue.retryDue();
    expect(queue.hasPending()).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);
    now = 999;
    await queue.retryDue();
    expect(run).toHaveBeenCalledTimes(1);

    now = 1_000;
    await queue.retryDue();
    expect(run).toHaveBeenCalledTimes(2);
    expect(queue.hasPending()).toBe(false);
  });

  it("keeps only the newest desired lifecycle state for a guild", async () => {
    const run = vi.fn(async () => undefined);
    const queue = createGuildPersistenceRetryQueue({ run });
    queue.markPending({
      guild: { id: "guild-a", name: "Hack North" },
      installed: true,
    });
    queue.markPending({
      guild: { id: "guild-a", name: "Hack North" },
      installed: false,
    });

    await queue.retryDue();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      guild: { id: "guild-a", name: "Hack North" },
      installed: false,
    });
    expect(queue.hasPending()).toBe(false);
  });

  it("deduplicates concurrent health-triggered retries", async () => {
    let release: (() => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const queue = createGuildPersistenceRetryQueue({ run });
    queue.markPending({
      guild: { id: "guild-a", name: "Hack North" },
      installed: true,
    });

    const first = queue.retryDue();
    const second = queue.retryDue();
    expect(run).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(queue.hasPending()).toBe(false);
  });
});
