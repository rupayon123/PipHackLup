import { ShieldCheck } from "lucide-react";
import { defaultAutoModTemplates, type ModerationCase } from "@piphacklup/core";
import { listModerationCasesFromDb } from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceState } from "@/components/WorkspaceState";
import { loadGuildWorkspace } from "@/lib/guild-workspace";

interface ModerationPageProps {
  searchParams: Promise<{ guildId?: string }>;
}

export default async function ModerationPage({
  searchParams,
}: ModerationPageProps) {
  const { guildId } = await searchParams;
  const workspace = await loadGuildWorkspace(guildId);
  let cases: ModerationCase[] = [];
  let dataUnavailable = false;

  if (workspace.guild) {
    try {
      cases = await listModerationCasesFromDb(workspace.guild.id);
    } catch {
      dataUnavailable = true;
      console.error("PipHackLup could not load moderation cases.");
    }
  }

  const openCases = cases.filter(
    (moderationCase) => moderationCase.status === "open",
  );

  return (
    <AppShell
      session={workspace.session}
      sessionUnavailable={workspace.sessionUnavailable}
    >
      <PageHeader
        eyebrow="Moderation"
        title={
          workspace.guild ? `${workspace.guild.name} safety` : "Server safety"
        }
        subtitle="Review reports recorded by PipHackLup without scanning private message content or inventing case history."
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
        <div className="grid two">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Open cases</h2>
                <p className="small">{openCases.length} need staff review</p>
              </div>
              <span className={`badge ${openCases.length ? "amber" : "green"}`}>
                {openCases.length ? "Review needed" : "Clear"}
              </span>
            </div>
            {openCases.length ? (
              <div className="compact-records">
                {openCases.map((moderationCase) => (
                  <article key={moderationCase.id}>
                    <div>
                      <span className="record-id">{moderationCase.id}</span>
                      <h3>{moderationCase.action}</h3>
                      <p>{moderationCase.reason}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Discord member</dt>
                        <dd>{moderationCase.targetUserId}</dd>
                      </div>
                      <div>
                        <dt>Opened</dt>
                        <dd>{formatDate(moderationCase.createdAt)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inline-empty with-icon">
                <ShieldCheck aria-hidden size={24} />
                <p>
                  No open cases. Reports created with{" "}
                  <strong>/mod report</strong>
                  will appear here for staff.
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Recommended Discord protections</h2>
                <p className="small">
                  Review these templates before applying them in Discord.
                </p>
              </div>
            </div>
            <div className="steps">
              {defaultAutoModTemplates().map((rule) => (
                <div className="step" key={rule.name}>
                  <span className="step-icon">A</span>
                  <div>
                    <strong>{rule.name}</strong>
                    <div className="small">{rule.goal}</div>
                  </div>
                  <span className="badge blue">Template</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}
