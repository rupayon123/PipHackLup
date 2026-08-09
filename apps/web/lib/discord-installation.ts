const DISCORD_API = "https://discord.com/api/v10";
const DEFAULT_INSTALL_PERMISSIONS = "1099914365968";
const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

interface DiscordBotGuildResponse {
  id: string;
}

export interface DiscordGuildOption {
  id: string;
  name: string;
}

interface DiscordRoleResponse extends DiscordGuildOption {
  managed: boolean;
  position: number;
}

interface DiscordChannelResponse extends DiscordGuildOption {
  position: number;
  type: number;
}

export interface DiscordInstallUrlOptions {
  clientId: string;
  guildId?: string;
  permissions?: string;
}

export class DiscordBotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordBotApiError";
  }
}

export function buildDiscordInstallUrl({
  clientId,
  guildId,
  permissions = DEFAULT_INSTALL_PERMISSIONS,
}: DiscordInstallUrlOptions): string {
  assertSnowflake(clientId, "Discord client ID");
  if (guildId) assertSnowflake(guildId, "Discord guild ID");
  if (!/^\d+$/.test(permissions)) {
    throw new Error("Discord install permissions must be a numeric bitfield.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions,
    integration_type: "0",
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function getDiscordInstallUrl(guildId?: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) throw new Error("DISCORD_CLIENT_ID is required.");
  return buildDiscordInstallUrl({
    clientId,
    ...(guildId ? { guildId } : {}),
    ...(process.env.DISCORD_INSTALL_PERMISSIONS
      ? { permissions: process.env.DISCORD_INSTALL_PERMISSIONS }
      : {}),
  });
}

export function isDiscordBotApiConfigured(): boolean {
  return Boolean(process.env.DISCORD_TOKEN);
}

export async function listDiscordBotGuildIds(
  fetchImplementation: typeof fetch = fetch,
): Promise<Set<string>> {
  const token = getDiscordBotToken();
  const guildIds = new Set<string>();
  let after: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);

    const response = await fetchImplementation(url, {
      headers: { authorization: `Bot ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new DiscordBotApiError(
        "Discord could not return the bot's installed servers.",
        response.status,
      );
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || !body.every(isDiscordBotGuildResponse)) {
      throw new DiscordBotApiError(
        "Discord returned an invalid installed-server response.",
        502,
      );
    }

    for (const guild of body) guildIds.add(guild.id);
    if (body.length < 200) return guildIds;
    after = body.at(-1)?.id;
    if (!after) return guildIds;
  }

  throw new DiscordBotApiError(
    "Discord returned too many installed-server pages to reconcile safely.",
    502,
  );
}

export async function leaveDiscordBotGuild(
  guildId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<"removed" | "already_removed"> {
  assertSnowflake(guildId, "Discord guild ID");
  const response = await fetchImplementation(
    `${DISCORD_API}/users/@me/guilds/${guildId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bot ${getDiscordBotToken()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 204) return "removed";
  if (response.status === 404) return "already_removed";
  throw new DiscordBotApiError(
    "Discord could not remove PipHackLup from this server.",
    response.status,
  );
}

export async function getDiscordGuildConfigurationOptions(
  guildId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ roles: DiscordGuildOption[]; channels: DiscordGuildOption[] }> {
  assertSnowflake(guildId, "Discord guild ID");
  const headers = { authorization: `Bot ${getDiscordBotToken()}` };
  const [rolesResponse, channelsResponse] = await Promise.all([
    fetchImplementation(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
    fetchImplementation(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
  ]);
  if (!rolesResponse.ok || !channelsResponse.ok) {
    throw new DiscordBotApiError(
      "Discord could not return this server's roles and channels.",
      !rolesResponse.ok ? rolesResponse.status : channelsResponse.status,
    );
  }

  const roles = parseDiscordRoleOptions(await rolesResponse.json(), guildId);
  const channels = parseDiscordChannelOptions(await channelsResponse.json());
  if (!roles || !channels) {
    throw new DiscordBotApiError(
      "Discord returned invalid role or channel options.",
      502,
    );
  }
  return { channels, roles };
}

export function parseDiscordRoleOptions(
  value: unknown,
  guildId: string,
): DiscordGuildOption[] | null {
  if (!Array.isArray(value) || value.length > 1_000) return null;
  const roles: DiscordRoleResponse[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, managed, name, position } = item;
    if (
      typeof id !== "string" ||
      !DISCORD_SNOWFLAKE.test(id) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      typeof managed !== "boolean" ||
      !Number.isInteger(position)
    ) {
      return null;
    }
    if (id !== guildId && !managed) {
      roles.push({ id, name, managed, position: position as number });
    }
  }
  return roles
    .toSorted((left, right) => right.position - left.position)
    .map(({ id, name }) => ({ id, name }));
}

export function parseDiscordChannelOptions(
  value: unknown,
): DiscordGuildOption[] | null {
  if (!Array.isArray(value) || value.length > 1_000) return null;
  const channels: DiscordChannelResponse[] = [];
  const selectableTypes = new Set([0, 5, 15]);
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, name, position, type } = item;
    if (
      typeof id !== "string" ||
      !DISCORD_SNOWFLAKE.test(id) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      !Number.isInteger(position) ||
      !Number.isInteger(type)
    ) {
      return null;
    }
    if (selectableTypes.has(type as number)) {
      channels.push({
        id,
        name,
        position: position as number,
        type: type as number,
      });
    }
  }
  return channels
    .toSorted((left, right) => left.position - right.position)
    .map(({ id, name }) => ({ id, name: `#${name}` }));
}

function getDiscordBotToken(): string {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN is required for bot management.");
  return token;
}

function assertSnowflake(value: string, label: string): void {
  if (!DISCORD_SNOWFLAKE.test(value)) {
    throw new Error(`${label} must be a valid Discord snowflake.`);
  }
}

function isDiscordBotGuildResponse(
  value: unknown,
): value is DiscordBotGuildResponse {
  if (!value || typeof value !== "object") return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    DISCORD_SNOWFLAKE.test(value.id)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
