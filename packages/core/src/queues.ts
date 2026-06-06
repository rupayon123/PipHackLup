import { createId } from "./ids.js";
import type { QueueKind, QueueTicket, Snowflake } from "./types.js";

export interface CreateTicketInput {
  guildId: Snowflake;
  kind: QueueKind;
  requesterId: Snowflake;
  topic: string;
  description: string;
  priority?: 0 | 1 | 2 | 3;
  teamId?: string;
  now?: string;
}

export function createQueueTicket(input: CreateTicketInput): QueueTicket {
  const now = input.now ?? new Date().toISOString();
  const ticket: QueueTicket = {
    id: createId("ticket"),
    guildId: input.guildId,
    kind: input.kind,
    status: "open",
    requesterId: input.requesterId,
    topic: input.topic.trim(),
    description: input.description.trim(),
    priority: input.priority ?? 1,
    createdAt: now,
    updatedAt: now
  };

  if (input.teamId) ticket.teamId = input.teamId;
  return ticket;
}

export function claimTicket(
  ticket: QueueTicket,
  mentorId: Snowflake,
  now = new Date().toISOString()
): QueueTicket {
  assertTransition(ticket, ["open", "escalated"], "claim");
  return { ...ticket, status: "claimed", assignedTo: mentorId, updatedAt: now };
}

export function escalateTicket(ticket: QueueTicket, now = new Date().toISOString()): QueueTicket {
  assertTransition(ticket, ["open", "claimed"], "escalate");
  return { ...ticket, status: "escalated", priority: 3, updatedAt: now };
}

export function closeTicket(
  ticket: QueueTicket,
  now = new Date().toISOString(),
  transcriptChannelId?: Snowflake
): QueueTicket {
  assertTransition(ticket, ["open", "claimed", "escalated"], "close");
  const next: QueueTicket = {
    ...ticket,
    status: "closed",
    updatedAt: now,
    closedAt: now
  };
  if (transcriptChannelId) next.transcriptChannelId = transcriptChannelId;
  return next;
}

export function cancelTicket(ticket: QueueTicket, now = new Date().toISOString()): QueueTicket {
  assertTransition(ticket, ["open", "claimed", "escalated"], "cancel");
  return { ...ticket, status: "canceled", updatedAt: now, closedAt: now };
}

export function orderQueue(tickets: QueueTicket[]): QueueTicket[] {
  return tickets
    .filter((ticket) => ticket.status === "open" || ticket.status === "escalated")
    .toSorted((left, right) => {
      if (left.status !== right.status) return left.status === "escalated" ? -1 : 1;
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.createdAt.localeCompare(right.createdAt);
    });
}

export function estimateWaitMinutes(
  ticketsAhead: QueueTicket[],
  activeStaffCount: number,
  averageTicketMinutes = 12
): number {
  if (ticketsAhead.length === 0) return 0;
  const staff = Math.max(activeStaffCount, 1);
  return Math.ceil((ticketsAhead.length * averageTicketMinutes) / staff);
}

function assertTransition(ticket: QueueTicket, allowed: QueueTicket["status"][], action: string): void {
  if (!allowed.includes(ticket.status)) {
    throw new Error(`Cannot ${action} ticket ${ticket.id} while status is ${ticket.status}`);
  }
}
