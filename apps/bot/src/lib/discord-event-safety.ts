type DiscordEventFailureLogger = (message: string) => void;

export async function safelyHandleDiscordEvent(
  eventName: string,
  guildId: string | null | undefined,
  handler: () => Promise<unknown>,
  logger: DiscordEventFailureLogger = console.error,
): Promise<void> {
  try {
    await handler();
  } catch {
    logger(
      `PipHackLup Discord ${eventName} handler failed${guildId ? ` in guild ${guildId}` : ""}.`,
    );
  }
}
