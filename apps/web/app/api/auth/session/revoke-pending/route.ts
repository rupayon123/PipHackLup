import type { NextRequest } from "next/server";
import { handlePendingSessionRevocationRequest } from "@/lib/pending-session-revocation";

export async function POST(request: NextRequest) {
  return handlePendingSessionRevocationRequest(request);
}
