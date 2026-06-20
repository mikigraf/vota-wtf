import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { runHouseAgentData } from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";
import { verifyBearerToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!verifyBearerToken(request, process.env.AGENT_API_TOKEN)) return badRequest("Unauthorized", 401);
  const body = await readJsonObject(request);
  try {
    const run = await runHouseAgentData({
      eventSlug: String(body.eventSlug || DEFAULT_EVENT_SLUG),
      agentId: body.agentId ? String(body.agentId) : undefined,
      marketId: String(body.marketId || "")
    });
    return json({ run });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Agent run failed.");
  }
}
