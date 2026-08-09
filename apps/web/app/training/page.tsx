import { Bot, BookOpenCheck, ExternalLink } from "lucide-react";
import {
  defaultKnowledgeSettings,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
} from "@piphacklup/core";
import {
  getKnowledgeSettingsFromDb,
  listKnowledgeEntriesFromDb,
} from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceState } from "@/components/WorkspaceState";
import {
  getDiscordInstallUrl,
  isDiscordBotApiConfigured,
  listDiscordBotGuildIds,
} from "@/lib/discord-installation";
import { loadGuildWorkspace } from "@/lib/guild-workspace";
import { TrainingConsole } from "./TrainingConsole";

interface TrainingPageProps {
  searchParams: Promise<{ guildId?: string }>;
}

export default async function TrainingPage({
  searchParams,
}: TrainingPageProps) {
  const { guildId } = await searchParams;
  const workspace = await loadGuildWorkspace(guildId);
  let entries: HackathonKnowledgeEntry[] = [];
  let settings: KnowledgeAssistantSettings = { ...defaultKnowledgeSettings };
  let dataUnavailable = false;
  let installation: boolean | null = null;

  if (workspace.guild) {
    try {
      [entries, settings] = await Promise.all([
        listKnowledgeEntriesFromDb(workspace.guild.id),
        getKnowledgeSettingsFromDb(workspace.guild.id),
      ]);
    } catch {
      dataUnavailable = true;
      console.error("PipHackLup could not load Q&A training.");
    }

    if (isDiscordBotApiConfigured()) {
      try {
        installation = (await listDiscordBotGuildIds()).has(workspace.guild.id);
      } catch {
        console.error("PipHackLup could not check the bot installation.");
      }
    }
  }

  return (
    <AppShell
      session={workspace.session}
      sessionUnavailable={workspace.sessionUnavailable}
    >
      <PageHeader
        eyebrow="Event answers"
        title={
          workspace.guild ? `Train ${workspace.guild.name}` : "Train PipHackLup"
        }
        subtitle="Write the answers participants should receive, choose when a person should step in, and test the result before event day."
        actions={
          workspace.guild && installation === false ? (
            <a
              className="button primary"
              href={getDiscordInstallUrl(workspace.guild.id)}
            >
              <Bot aria-hidden size={16} />
              Add PipHackLup
              <ExternalLink aria-hidden size={14} />
            </a>
          ) : undefined
        }
      />

      {workspace.requestedGuildUnavailable ? (
        <WorkspaceState kind="server-unavailable" />
      ) : !workspace.guild ? (
        <WorkspaceState kind="no-server" />
      ) : dataUnavailable ? (
        <WorkspaceState
          kind="data-unavailable"
          serverName={workspace.guild.name}
        />
      ) : (
        <>
          <section className="training-context">
            <BookOpenCheck aria-hidden size={22} />
            <div>
              <strong>
                {entries.length} saved answer{entries.length === 1 ? "" : "s"}
              </strong>
              <span>
                Changes apply only to {workspace.guild.name}. PipHackLup filters
                instruction-override attempts before saving them.
              </span>
            </div>
            <span
              className={`badge ${installation === true ? "green" : installation === false ? "amber" : "gray"}`}
            >
              {installation === true
                ? "Bot installed"
                : installation === false
                  ? "Bot not installed"
                  : "Install status unavailable"}
            </span>
          </section>
          <TrainingConsole
            key={workspace.guild.id}
            guild={workspace.guild}
            initialEntries={entries}
            initialSettings={settings}
            botInstallation={installation}
          />
        </>
      )}
    </AppShell>
  );
}
