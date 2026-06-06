import { toCsv } from "@piphacklup/core";
import { demoMembers, demoTickets } from "@/lib/demo-data";

export function GET() {
  const rows = [
    ...demoMembers.map((member) => ({
      type: "member",
      id: member.userId,
      name: member.displayName,
      status: member.lookingForTeam ? "looking" : "settled",
      detail: member.skills.join("; ")
    })),
    ...demoTickets.map((ticket) => ({
      type: "ticket",
      id: ticket.id,
      name: ticket.topic,
      status: ticket.status,
      detail: ticket.kind
    }))
  ];

  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="piphacklup-demo-export.csv"'
    }
  });
}
