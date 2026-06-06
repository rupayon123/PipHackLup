import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { demoTickets } from "@/lib/demo-data";

export default function QueuesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Queues"
        title="Mentor, tech, and judging requests"
        subtitle="Track live help requests, assignment state, priority, and aging so participants are not left guessing where to ask."
      />

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Kind</th>
              <th>Topic</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {demoTickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <code>{ticket.id}</code>
                </td>
                <td>
                  <span className="badge blue">{ticket.kind}</span>
                </td>
                <td>
                  <strong>{ticket.topic}</strong>
                  <div className="small">{ticket.description}</div>
                </td>
                <td>{ticket.status}</td>
                <td>{ticket.priority}</td>
                <td>{new Date(ticket.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
