import { Sparkles, Users } from "lucide-react";
import {
  suggestTeamMatches,
  type MatchResult,
  type MemberProfile,
  type TeamProfile,
} from "@piphacklup/core";
import { listMemberProfilesFromDb, listTeamsFromDb } from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceState } from "@/components/WorkspaceState";
import { loadGuildWorkspace } from "@/lib/guild-workspace";

interface TeamsPageProps {
  searchParams: Promise<{ guildId?: string }>;
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const { guildId } = await searchParams;
  const workspace = await loadGuildWorkspace(guildId);
  let profiles: MemberProfile[] = [];
  let teams: TeamProfile[] = [];
  let matches: MatchResult[] = [];
  let dataUnavailable = false;

  if (workspace.guild) {
    try {
      [profiles, teams] = await Promise.all([
        listMemberProfilesFromDb(workspace.guild.id),
        listTeamsFromDb(workspace.guild.id),
      ]);
      matches = suggestTeamMatches(profiles, teams);
    } catch {
      dataUnavailable = true;
      console.error("PipHackLup could not load team formation data.");
    }
  }

  return (
    <AppShell
      session={workspace.session}
      sessionUnavailable={workspace.sessionUnavailable}
    >
      <PageHeader
        eyebrow="Team formation"
        title={
          workspace.guild ? `${workspace.guild.name} teams` : "Hackathon teams"
        }
        subtitle="See recruiting groups and careful match suggestions based only on profiles participants chose to share."
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
      ) : teams.length || profiles.length ? (
        <div className="grid two">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Recruiting teams</h2>
                <p className="small">{teams.length} saved in this server</p>
              </div>
            </div>
            {teams.length ? (
              <div className="compact-records">
                {teams.map((team) => (
                  <article key={team.id}>
                    <div>
                      <h3>{team.name}</h3>
                      <p>{team.projectIdea ?? "No project idea shared yet."}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Members</dt>
                        <dd>
                          {team.memberIds.length}/{team.maxSize}
                        </dd>
                      </div>
                      <div>
                        <dt>Looking for</dt>
                        <dd>
                          {team.desiredSkills.join(", ") || "Open to ideas"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="inline-empty">No teams are recruiting yet.</p>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Match suggestions</h2>
                <p className="small">
                  Suggestions only—people decide where they join.
                </p>
              </div>
              <Sparkles aria-hidden size={20} />
            </div>
            {matches.length ? (
              <div className="steps">
                {matches.map((match) => {
                  const team = teams.find((item) => item.id === match.teamId);
                  return (
                    <div className="step" key={match.teamId}>
                      <span className="step-icon">{match.score}</span>
                      <div>
                        <strong>{team?.name ?? match.teamId}</strong>
                        <div className="small">
                          {match.addedMemberIds.length} possible teammate
                          {match.addedMemberIds.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="badge green">Review</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="inline-empty">
                No match is ready yet. Participants can use{" "}
                <strong>/team profile</strong> to join the pool, then an
                organizer can run <strong>/team match</strong>.
              </p>
            )}
          </section>
        </div>
      ) : (
        <section className="friendly-empty" role="status">
          <Users aria-hidden size={30} />
          <div>
            <h2>No team activity yet</h2>
            <p>
              Participants can create a profile or recruiting team in
              {` ${workspace.guild.name}`} with the <strong>/team</strong>{" "}
              command.
            </p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
