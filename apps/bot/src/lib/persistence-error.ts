export class BotPersistenceError extends Error {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    super(`PipHackLup could not ${operation} in durable storage.`, { cause });
    this.name = "BotPersistenceError";
    this.operation = operation;
  }
}

export function persistenceOperationName(error: unknown): string {
  return error instanceof BotPersistenceError
    ? error.operation
    : "complete the database operation";
}
