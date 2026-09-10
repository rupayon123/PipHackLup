import { Clock3, TicketCheck } from "lucide-react";
import type { QueueTicket } from "@piphacklup/core";
import { listQueueTicketsFromDb } from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { WorkspaceState } from "@/components/WorkspaceState";
import { loadGuildWorkspace } from "@/lib/guild-workspace";

interface QueuesPageProps {
  searchParams: Promise<{ guildId?: string }>;
}

export default async function QueuesPage({ searchParams }: QueuesPageProps) {
  const { guildId } = await searchParams;
  const workspace = await loadGuildWorkspace(guildId);
  let tickets: QueueTicket[] = [];
  let dataUnavailable = false;

  if (workspace.guild) {
    try {
      tickets = await listQueueTicketsFromDb(workspace.guild.id);
    } catch {
      dataUnavailable = true;
      console.error("PipHackLup could not load queue tickets.");
    }
  }

  return (
    <AppShell
      session={workspace.session}
      sessionUnavailable={workspace.sessionUnavailable}
    >
      <PageHeader
        eyebrow="Help queues"
        title={
          workspace.guild ? `${workspace.guild.name} requests` : "Help requests"
        }
        subtitle="See the mentor, technical, staff, and judging requests participants opened in this Discord server."
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
      ) : tickets.length ? (
        <section className="record-list" aria-label="Queue tickets">
          {tickets.map((ticket) => (
            <article className="record-card" key={ticket.id}>
              <div className="record-card-heading">
                <div>
                  <span className="record-id">{ticket.id}</span>
                  <h2>{ticket.topic}</h2>
                </div>
                <span className={`badge ${ticketBadge(ticket.status)}`}>
                  {ticket.status}
                </span>
              </div>
              <p>{ticket.description}</p>
              <dl className="record-meta">
                <div>
                  <dt>Queue</dt>
                  <dd>{ticket.kind}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{ticket.priority}</dd>
                </div>
                <div>
                  <dt>Opened</dt>
                  <dd>{formatTimestamp(ticket.createdAt)}</dd>
                </div>
                <div>
                  <dt>Assigned to</dt>
                  <dd>{ticket.assignedTo ?? "Waiting for staff"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      ) : (
        <section className="friendly-empty" role="status">
          <TicketCheck aria-hidden size={30} />
          <div>
            <h2>No help requests yet</h2>
            <p>
              When someone uses <strong>/queue open</strong> in{" "}
              {workspace.guild.name}, their request will appear here.
            </p>
          </div>
          <span className="empty-hint">
            <Clock3 aria-hidden size={16} /> Live queue updates are saved per
            server
          </span>
        </section>
      )}
    </AppShell>
  );
}

function ticketBadge(status: string): "green" | "amber" | "blue" {
  if (status === "closed" || status === "canceled") return "green";
  if (status === "escalated") return "amber";
  return "blue";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}
