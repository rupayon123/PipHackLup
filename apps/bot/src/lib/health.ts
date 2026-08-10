export interface HealthStatusInput {
  discordReady: boolean;
  botTag?: string;
  release?: string;
  databaseConfigured: boolean;
  databaseInitializationComplete: boolean;
  databaseReady: boolean;
}

export interface HealthStatusBody {
  ok: boolean;
  status: "ready" | "starting" | "misconfigured" | "degraded";
  discordReady: boolean;
  bot: string | null;
  release: string;
  databaseConfigured: boolean;
  databaseReady: boolean;
}

export interface HealthStatusResponse {
  statusCode: 200 | 503;
  body: HealthStatusBody;
}

export interface DatabaseHealthProbe {
  check: () => Promise<boolean>;
}

export interface DatabaseHealthProbeOptions {
  ping: () => Promise<void>;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

export interface ProbedHealthStatusInput extends Omit<
  HealthStatusInput,
  "databaseReady"
> {
  databaseStateReady: boolean;
}

const defaultDatabaseHealthCacheTtlMs = 5_000;
const defaultDatabaseHealthTimeoutMs = 2_000;

export function createDatabaseHealthProbe(
  options: DatabaseHealthProbeOptions,
): DatabaseHealthProbe {
  const cacheTtlMs = options.cacheTtlMs ?? defaultDatabaseHealthCacheTtlMs;
  const timeoutMs = options.timeoutMs ?? defaultDatabaseHealthTimeoutMs;
  const now = options.now ?? Date.now;
  assertPositiveDuration(cacheTtlMs, "cacheTtlMs");
  assertPositiveDuration(timeoutMs, "timeoutMs");

  let cached: { ready: boolean; checkedAt: number } | undefined;
  let pending: Promise<boolean> | undefined;

  return {
    check() {
      const checkedAt = now();
      if (cached && checkedAt - cached.checkedAt < cacheTtlMs) {
        return Promise.resolve(cached.ready);
      }
      if (pending) return pending;

      pending = runPingWithTimeout(options.ping, timeoutMs)
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

export async function buildProbedHealthStatus(
  input: ProbedHealthStatusInput,
  databaseProbe: DatabaseHealthProbe,
): Promise<HealthStatusResponse> {
  const { databaseStateReady, ...statusInput } = input;
  const databaseReady =
    input.databaseConfigured &&
    databaseStateReady &&
    (await databaseProbe.check());
  return buildHealthStatus({ ...statusInput, databaseReady });
}

export function buildHealthStatus(
  input: HealthStatusInput,
): HealthStatusResponse {
  const databaseReady = input.databaseConfigured && input.databaseReady;
  const ready = input.discordReady && databaseReady;
  const status = !input.discordReady
    ? "starting"
    : !input.databaseConfigured
      ? "misconfigured"
      : !input.databaseInitializationComplete
        ? "starting"
        : databaseReady
          ? "ready"
          : "degraded";
  return {
    statusCode: ready ? 200 : 503,
    body: {
      ok: ready,
      status,
      discordReady: input.discordReady,
      bot: input.botTag ?? null,
      release: input.release ?? "unknown",
      databaseConfigured: input.databaseConfigured,
      databaseReady,
    },
  };
}

export function resolveReleaseIdentifier(
  env: Readonly<Record<string, string | undefined>>,
): string {
  for (const candidate of [
    env.PIPHACKLUP_RELEASE_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
  ]) {
    if (candidate && /^[a-f\d]{7,64}$/i.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return "unknown";
}

function assertPositiveDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive duration.`);
  }
}

async function runPingWithTimeout(
  ping: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(ping),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("database ping timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
