import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { ensureHouseAgentsData } from "@/lib/data";
import { badRequest, json, requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const contentType = request.headers.get("content-type") || "";
  const form = contentType.includes("application/json") ? null : await request.formData();
  const eventSlug = form ? String(form.get("eventSlug") || DEFAULT_EVENT_SLUG) : DEFAULT_EVENT_SLUG;
  try {
    const agents = await ensureHouseAgentsData(eventSlug);
    if (contentType.includes("application/json")) return json({ agents });
    return Response.redirect(new URL("/admin/agents", request.url), 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not initialize agents.");
  }
}
