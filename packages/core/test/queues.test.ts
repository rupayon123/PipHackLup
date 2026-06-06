import { describe, expect, it } from "vitest";
import { claimTicket, closeTicket, createQueueTicket, estimateWaitMinutes, orderQueue } from "../src/index.js";

describe("queues", () => {
  it("orders escalated and higher-priority tickets before normal requests", () => {
    const low = createQueueTicket({
      guildId: "g1",
      kind: "mentor",
      requesterId: "u1",
      topic: "CSS",
      description: "Help",
      priority: 0,
      now: "2026-06-06T10:00:00.000Z"
    });
    const high = createQueueTicket({
      guildId: "g1",
      kind: "tech",
      requesterId: "u2",
      topic: "Deploy",
      description: "Help",
      priority: 3,
      now: "2026-06-06T10:02:00.000Z"
    });
    const escalated = { ...low, id: "ticket_escalated", status: "escalated" as const };

    expect(orderQueue([low, high, escalated]).map((ticket) => ticket.id)).toEqual([
      "ticket_escalated",
      high.id,
      low.id
    ]);
  });

  it("moves tickets through claim and close states", () => {
    const ticket = createQueueTicket({
      guildId: "g1",
      kind: "mentor",
      requesterId: "u1",
      topic: "API",
      description: "Need help"
    });

    const claimed = claimTicket(ticket, "mentor1", "2026-06-06T10:05:00.000Z");
    expect(claimed.status).toBe("claimed");
    expect(claimed.assignedTo).toBe("mentor1");

    const closed = closeTicket(claimed, "2026-06-06T10:15:00.000Z", "channel1");
    expect(closed.status).toBe("closed");
    expect(closed.transcriptChannelId).toBe("channel1");
  });

  it("estimates wait from queue depth and active staff", () => {
    const tickets = Array.from({ length: 5 }, (_, index) =>
      createQueueTicket({
        guildId: "g1",
        kind: "mentor",
        requesterId: `u${index}`,
        topic: "Help",
        description: "Need help"
      })
    );

    expect(estimateWaitMinutes(tickets, 2, 10)).toBe(25);
  });
});
