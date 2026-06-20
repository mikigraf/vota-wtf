import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { updateStageControlsData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, requireAdminRequest } from "@/lib/http";
import type { StageMode } from "@/lib/types";

const modes: StageMode[] = ["join", "live", "role_battle", "humans_vs_agents", "leaderboard", "resolution"];

function safeAdminReturnPath(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin/stage";
  if (!value.startsWith("/admin") || value.startsWith("/admin/login") || value.startsWith("/api")) return "/admin/stage";
  return value;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const mode = String(form.get("stageMode") || "join") as StageMode;
  const eventSlug = String(form.get("eventSlug") || DEFAULT_EVENT_SLUG);
  const featuredMarketId = String(form.get("featuredMarketId") || "");
  const emergencyPaused = form.get("emergencyPausedControl") === "1" ? form.get("emergencyPaused") === "on" : undefined;
  const returnTo = safeAdminReturnPath(String(form.get("returnTo") || ""));
  try {
    if (!modes.includes(mode)) throw new Error("Unknown stage mode.");
    const event = await updateStageControlsData({
      eventSlug,
      stageMode: mode,
      featuredMarketId: mode === "resolution" ? undefined : featuredMarketId || undefined,
      emergencyPaused
    }, clientIpFromRequest(request));
    if (request.headers.get("accept")?.includes("application/json")) return json({ event });
    return Response.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not update stage.");
  }
}
