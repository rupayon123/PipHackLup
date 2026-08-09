export interface GuildPersistenceRetryOperation {
  guild: { id: string; name: string };
  installed: boolean;
}

export interface GuildPersistenceRetryQueue {
  clear(guildId: string): void;
  hasPending(): boolean;
  markPending(operation: GuildPersistenceRetryOperation): void;
  retryDue(): Promise<void>;
}

export function createGuildPersistenceRetryQueue(options: {
  run: (operation: GuildPersistenceRetryOperation) => Promise<void>;
  cooldownMs?: number;
  now?: () => number;
  onFailure?: (
    operation: GuildPersistenceRetryOperation,
    error: unknown,
  ) => void;
}): GuildPersistenceRetryQueue {
  const cooldownMs = options.cooldownMs ?? 5_000;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    throw new RangeError("cooldownMs must be a positive duration.");
  }

  const operations = new Map<string, GuildPersistenceRetryOperation>();
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let retryInFlight: Promise<void> | undefined;

  return {
    clear(guildId) {
      operations.delete(guildId);
    },
    hasPending() {
      return operations.size > 0;
    },
    markPending(operation) {
      operations.set(operation.guild.id, operation);
    },
    retryDue() {
      if (retryInFlight) return retryInFlight;
      const attemptAt = now();
      if (operations.size === 0 || attemptAt - lastAttemptAt < cooldownMs) {
        return Promise.resolve();
      }
      lastAttemptAt = attemptAt;
      const snapshot = [...operations.entries()];
      retryInFlight = Promise.all(
        snapshot.map(async ([guildId, operation]) => {
          try {
            await options.run(operation);
            if (operations.get(guildId) === operation) {
              operations.delete(guildId);
            }
          } catch (error) {
            options.onFailure?.(operation, error);
          }
        }),
      )
        .then(() => undefined)
        .finally(() => {
          retryInFlight = undefined;
        });
      return retryInFlight;
    },
  };
}
