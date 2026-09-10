import { CheckCircle2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import {
  ServerManager,
  type ManagedServerView,
} from "@/components/ServerManager";
import {
  isDiscordAuthConfigured,
  readDiscordSession,
  type DiscordSession,
} from "@/lib/discord-auth";
import {
  getDiscordInstallUrl,
  isDiscordBotApiConfigured,
  listDiscordBotGuildIds,
} from "@/lib/discord-installation";

export default async function DashboardPage() {
  const authReady = isDiscordAuthConfigured();
  const botApiReady = isDiscordBotApiConfigured();
  let session: DiscordSession | null = null;
  let sessionUnavailable = false;
  if (authReady) {
    try {
      session = await readDiscordSession();
    } catch {
      sessionUnavailable = true;
      console.error("PipHackLup could not load the organizer session.");
    }
  }
  let installedGuildIds = new Set<string>();
  let installationStatusError: string | undefined;

  if (session && botApiReady) {
    try {
      installedGuildIds = await listDiscordBotGuildIds();
    } catch {
      installationStatusError =
        "Discord installation status is temporarily unavailable. No server actions were changed.";
    }
  } else if (session) {
    installationStatusError =
      "Bot management is not configured on this deployment yet.";
  }

  const servers: ManagedServerView[] = (session?.guilds ?? []).map((guild) => ({
    id: guild.id,
    name: guild.name,
    ...(guild.iconUrl ? { iconUrl: guild.iconUrl } : {}),
    isOwner: guild.isOwner,
    installed:
      botApiReady && !installationStatusError
        ? installedGuildIds.has(guild.id)
        : null,
    installUrl: getDiscordInstallUrl(guild.id),
  }));
  const installedCount = servers.filter((server) => server.installed).length;

  return (
    <AppShell session={session} sessionUnavailable={sessionUnavailable}>
      <PageHeader
        eyebrow="Organizer workspace"
        title="Your Discord servers"
        subtitle="Choose the server you are working on. PipHackLup will show what is installed and what needs your attention."
        actions={
          <a className="button" href="/api/auth/discord/start">
            <RefreshCw aria-hidden size={16} />
            Sync with Discord
          </a>
        }
      />

      <section
        className="workspace-summary"
        aria-label="Discord connection summary"
      >
        <div className="workspace-summary-intro">
          <CheckCircle2 aria-hidden size={20} />
          <div>
            <strong>
              {session
                ? `Connected as ${session.user.globalName ?? session.user.username}`
                : "Discord is not connected"}
            </strong>
            <span>
              Only servers you own or can manage are shown. Permissions are
              checked again before every change.
            </span>
          </div>
        </div>
        <dl>
          <div>
            <dt>Servers you manage</dt>
            <dd>{session?.guilds.length ?? 0}</dd>
          </div>
          <div>
            <dt>PipHackLup installed</dt>
            <dd>
              {botApiReady && !installationStatusError ? installedCount : "—"}
            </dd>
          </div>
          <div>
            <dt>Bot management</dt>
            <dd>{authReady && botApiReady ? "Available" : "Needs setup"}</dd>
          </div>
        </dl>
      </section>

      <section className="server-manager-section" aria-label="Discord servers">
        <ServerManager
          servers={servers}
          {...(installationStatusError ? { installationStatusError } : {})}
        />
      </section>
    </AppShell>
  );
}
