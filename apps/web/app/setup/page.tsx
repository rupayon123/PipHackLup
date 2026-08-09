import { CheckCircle2, Circle, ServerCog } from "lucide-react";
import { getGuildConfigFromDb, type GuildIdentity } from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceState } from "@/components/WorkspaceState";
import { loadGuildWorkspace } from "@/lib/guild-workspace";

interface SetupPageProps {
  searchParams: Promise<{ guildId?: string }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const { guildId } = await searchParams;
  const workspace = await loadGuildWorkspace(guildId);
  let config = null;
  let dataUnavailable = false;

  if (workspace.guild) {
    try {
      config = await getGuildConfigFromDb(workspace.guild.id);
    } catch {
      dataUnavailable = true;
      console.error("PipHackLup could not load server setup.");
    }
  }

  const roleCount = config ? Object.keys(config.roles).length : 0;
  const channelCount = config ? Object.keys(config.channels).length : 0;
  const resourceCount = config?.resources
    ? Object.values(config.resources).filter(Boolean).length
    : 0;
  const setupStarted = Boolean(roleCount || channelCount || resourceCount);
  const steps = [
    {
      label: "Server configuration saved",
      detail:
        setupStarted && config
          ? `${config.eventName} is connected to PipHackLup.`
          : "Run /setup in Discord to create this server's event workspace.",
      done: setupStarted,
    },
    {
      label: "Event roles ready",
      detail: roleCount
        ? `${roleCount} role${roleCount === 1 ? "" : "s"} recorded for onboarding and staff access.`
        : "No PipHackLup event roles have been recorded yet.",
      done: roleCount > 0,
    },
    {
      label: "Event channels ready",
      detail: channelCount
        ? `${channelCount} channel${channelCount === 1 ? "" : "s"} recorded for help, teams, and logs.`
        : "No PipHackLup event channels have been recorded yet.",
      done: channelCount > 0,
    },
    {
      label: "Onboarding mode chosen",
      detail:
        setupStarted && config
          ? `${config.onboardingMode === "gated" ? "Gated" : "Guided"} onboarding is active.`
          : "Choose guided or gated onboarding when you run /setup.",
      done: setupStarted,
    },
  ];

  return (
    <AppShell
      session={workspace.session}
      sessionUnavailable={workspace.sessionUnavailable}
    >
      <PageHeader
        eyebrow="Server setup"
        title={
          workspace.guild ? `Set up ${workspace.guild.name}` : "Set up a server"
        }
        subtitle="PipHackLup creates a reusable event workspace in Discord, then records exactly which roles and channels it manages."
        actions={
          workspace.guild ? (
            <a
              className="button"
              href={`/dashboard?guildId=${encodeURIComponent(workspace.guild.id)}`}
            >
              Back to servers
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
          <section className="setup-command-card">
            <ServerCog aria-hidden size={24} />
            <div>
              <p className="eyebrow">Run this in {workspace.guild.name}</p>
              <h2>/setup</h2>
              <p>
                Only someone with Manage Server can run it. PipHackLup will
                reuse anything it already created, so setup is safe to run again
                after an interrupted attempt.
              </p>
            </div>
          </section>

          <section className="card setup-checklist">
            <div className="section-heading">
              <div>
                <h2>Setup checklist</h2>
                <p className="small">
                  These checks come from this server's saved configuration—not
                  sample data.
                </p>
              </div>
              <span className={`badge ${setupStarted ? "green" : "amber"}`}>
                {setupStarted ? "Started" : "Not started"}
              </span>
            </div>
            <div className="steps">
              {steps.map((step) => {
                const Icon = step.done ? CheckCircle2 : Circle;
                return (
                  <div className="step" key={step.label}>
                    <span className="step-icon">
                      <Icon aria-hidden size={16} />
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <div className="small">{step.detail}</div>
                    </div>
                    <span className={`badge ${step.done ? "green" : "amber"}`}>
                      {step.done ? "Ready" : "Needed"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {config && setupStarted ? (
            <SetupDetails guild={workspace.guild} config={config} />
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function SetupDetails({
  guild,
  config,
}: Readonly<{
  guild: GuildIdentity;
  config: NonNullable<Awaited<ReturnType<typeof getGuildConfigFromDb>>>;
}>) {
  return (
    <section className="card setup-details">
      <h2>Saved event settings</h2>
      <dl className="detail-list">
        <div>
          <dt>Discord server</dt>
          <dd>{guild.name}</dd>
        </div>
        <div>
          <dt>Event name</dt>
          <dd>{config.eventName}</dd>
        </div>
        <div>
          <dt>Onboarding</dt>
          <dd>{config.onboardingMode}</dd>
        </div>
        <div>
          <dt>Team size</dt>
          <dd>
            {config.teamSizeMin}–{config.teamSizeMax} people
          </dd>
        </div>
      </dl>
    </section>
  );
}
