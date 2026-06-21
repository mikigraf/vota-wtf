import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { runHouseAgentData } from "@/lib/data";
import { adminActionError, badRequest, json, readJsonObject, requireAdminRequest } from "@/lib/http";

function agentsReturnPath(eventSlug: string) {
  return `/admin/agents?eventSlug=${encodeURIComponent(eventSlug)}`;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await readJsonObject(request)
    : Object.fromEntries((await request.formData()).entries());
  const eventSlug = String(body.eventSlug || DEFAULT_EVENT_SLUG);
  try {
    const run = await runHouseAgentData({
      eventSlug,
      agentId: body.agentId ? String(body.agentId) : undefined,
      marketId: String(body.marketId || "")
    });
    if (contentType.includes("application/json")) return json({ run });
    return Response.redirect(new URL(agentsReturnPath(eventSlug), request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed.";
    if (contentType.includes("application/json")) return badRequest(message);
    return adminActionError(request, agentsReturnPath(eventSlug), message);
  }
}
