import { ClipboardList, Download, Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { demoCases, demoMembers, demoTeams, demoTickets } from "@/lib/demo-data";

export default function DashboardPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Test server demo"
        title="Hackathon ops at a glance"
        subtitle="A compact command center for queues, team formation, onboarding, moderation cases, and setup readiness."
        actions={
          <>
            <a className="button primary" href="/setup">
              <Settings aria-hidden size={16} />
              Setup
            </a>
            <a className="button" href="/api/export">
              <Download aria-hidden size={16} />
              CSV
            </a>
          </>
        }
      />

      <div className="grid metrics">
        <MetricCard label="Participants" value={String(demoMembers.length)} detail="Profiles in the matching pool" />
        <MetricCard label="Open tickets" value={String(demoTickets.length)} detail="Mentor, tech, and judging" />
        <MetricCard label="Recruiting teams" value={String(demoTeams.length)} detail="Teams still looking for hackers" />
        <MetricCard label="Open cases" value={String(demoCases.length)} detail="Reports awaiting staff review" />
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Queue pressure</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Topic</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {demoTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <span className="badge blue">{ticket.kind}</span>
                  </td>
                  <td>{ticket.topic}</td>
                  <td>{ticket.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Organizer rhythm</h2>
          <div className="steps">
            <div className="step">
              <span className="step-icon">
                <ClipboardList aria-hidden size={16} />
              </span>
              <div>
                <strong>Every 15 minutes</strong>
                <div className="small">Clear escalated mentor/tech tickets before they age into event-wide blockers.</div>
              </div>
              <span className="badge amber">Live</span>
            </div>
            <div className="step">
              <span className="step-icon">
                <ClipboardList aria-hidden size={16} />
              </span>
              <div>
                <strong>Before judging</strong>
                <div className="small">Export teams and verify every group has a demo queue status.</div>
              </div>
              <span className="badge green">Ready</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
