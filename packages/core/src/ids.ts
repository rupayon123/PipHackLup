export function createId(prefix: string, seed = cryptoSafeSeed()): string {
  return `${prefix}_${seed}`;
}

function cryptoSafeSeed(): string {
  const random = globalThis.crypto?.getRandomValues?.(new Uint32Array(2));
  if (random) {
    return Array.from(random, (part) => part.toString(36).padStart(6, "0")).join("");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
