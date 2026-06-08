import { NextRequest, NextResponse } from "next/server";
import { toCsv } from "@piphacklup/core";
import { demoMembers, demoTickets } from "@/lib/demo-data";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  webRateLimitPolicies,
} from "@/lib/rate-limit";

export function GET(request: NextRequest) {
  const rateLimitResponse = enforceRateLimit(request, {
    key: buildRateLimitKey(["web", "public-export", getClientIp(request)]),
    policy: webRateLimitPolicies.publicExport,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const rows = [
    ...demoMembers.map((member) => ({
      type: "member",
      id: member.userId,
      name: member.displayName,
      status: member.lookingForTeam ? "looking" : "settled",
      detail: member.skills.join("; "),
    })),
    ...demoTickets.map((ticket) => ({
      type: "ticket",
      id: ticket.id,
      name: ticket.topic,
      status: ticket.status,
      detail: ticket.kind,
    })),
  ];

  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="piphacklup-demo-export.csv"',
    },
  });
}
