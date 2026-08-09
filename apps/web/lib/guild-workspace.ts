import {
  isDiscordAuthConfigured,
  readDiscordSession,
  type DiscordSession,
  type ManagedDiscordGuild,
} from "./discord-auth";

export interface GuildWorkspace {
  session: DiscordSession | null;
  guild: ManagedDiscordGuild | null;
  sessionUnavailable: boolean;
  requestedGuildUnavailable: boolean;
}

export async function loadGuildWorkspace(
  requestedGuildId?: string,
): Promise<GuildWorkspace> {
  if (!isDiscordAuthConfigured()) {
    return {
      session: null,
      guild: null,
      sessionUnavailable: false,
      requestedGuildUnavailable: false,
    };
  }

  let session: DiscordSession | null;
  try {
    session = await readDiscordSession();
  } catch {
    console.error("PipHackLup could not load the organizer workspace.");
    return {
      session: null,
      guild: null,
      sessionUnavailable: true,
      requestedGuildUnavailable: false,
    };
  }

  if (!session) {
    return {
      session: null,
      guild: null,
      sessionUnavailable: false,
      requestedGuildUnavailable: false,
    };
  }

  const selection = selectGuildForWorkspace(session, requestedGuildId);
  return {
    session,
    guild: selection.guild,
    sessionUnavailable: false,
    requestedGuildUnavailable: selection.requestedGuildUnavailable,
  };
}

export function selectGuildForWorkspace(
  session: DiscordSession,
  requestedGuildId?: string,
): Pick<GuildWorkspace, "guild" | "requestedGuildUnavailable"> {
  if (!requestedGuildId) {
    return {
      guild: session.guilds[0] ?? null,
      requestedGuildUnavailable: false,
    };
  }

  const requestedGuild =
    session.guilds.find((guild) => guild.id === requestedGuildId) ?? null;
  return {
    guild: requestedGuild,
    requestedGuildUnavailable: requestedGuild === null,
  };
}
