export interface CachedHealthProbe {
  check(): Promise<boolean>;
}

export function createCachedHealthProbe(options: {
  check: () => Promise<void>;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}): CachedHealthProbe {
  const cacheTtlMs = options.cacheTtlMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 2_000;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) {
    throw new RangeError("cacheTtlMs must be a positive duration.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive duration.");
  }

  let cached: { ready: boolean; checkedAt: number } | undefined;
  let pending: Promise<boolean> | undefined;

  return {
    check() {
      const checkedAt = now();
      if (cached && checkedAt - cached.checkedAt < cacheTtlMs) {
        return Promise.resolve(cached.ready);
      }
      if (pending) return pending;

      pending = runWithTimeout(options.check, timeoutMs)
        .then(
          () => true,
          () => false,
        )
        .then((ready) => {
          cached = { ready, checkedAt: now() };
          return ready;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}

async function runWithTimeout(
  operation: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("health check timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
