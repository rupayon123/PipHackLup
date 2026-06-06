import { suggestTeamMatches } from "@piphacklup/core";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { demoMembers, demoTeams } from "@/lib/demo-data";

export default function TeamsPage() {
  const matches = suggestTeamMatches(demoMembers, demoTeams);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Team formation"
        title="Turn lost solo hackers into teams"
        subtitle="Review recruiting teams, solo profiles, and matching suggestions based on skills, interests, and project needs."
      />

      <div className="grid two">
        <section className="card">
          <h2>Recruiting teams</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Members</th>
                <th>Needs</th>
              </tr>
            </thead>
            <tbody>
              {demoTeams.map((team) => (
                <tr key={team.id}>
                  <td>
                    <strong>{team.name}</strong>
                    <div className="small">{team.projectIdea}</div>
                  </td>
                  <td>
                    {team.memberIds.length}/{team.maxSize}
                  </td>
                  <td>{team.desiredSkills.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Match suggestions</h2>
          <div className="steps">
            {matches.map((match) => (
              <div className="step" key={match.teamId}>
                <span className="step-icon">{match.score}</span>
                <div>
                  <strong>{match.teamId}</strong>
                  <div className="small">Add users {match.addedMemberIds.join(", ")}</div>
                </div>
                <span className="badge green">Suggested</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
