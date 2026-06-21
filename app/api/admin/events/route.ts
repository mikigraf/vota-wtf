import { NextRequest } from "next/server";
import { STARTER_CREDITS } from "@/lib/constants";
import { createEventData } from "@/lib/data";
import { adminActionError, clientIpFromRequest, json, readJsonObject, requireAdminRequest } from "@/lib/http";
import { safeAdminReturnPath } from "@/lib/safe-paths";
import type { EventRecord } from "@/lib/types";

const eventStatuses: EventRecord["status"][] = ["draft", "live", "paused", "finished"];

function safeStatus(value: FormDataEntryValue | string | null | undefined): EventRecord["status"] {
  const status = String(value || "live") as EventRecord["status"];
  return eventStatuses.includes(status) ? status : "live";
}

function wantsJson(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  let returnTo = "/admin/events";
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("application/json")
      ? await readJsonObject(request)
      : Object.fromEntries(await request.formData());
    returnTo = safeAdminReturnPath(input.returnTo, "/admin/events");
    const event = await createEventData({
      name: String(input.name || ""),
      slug: String(input.slug || ""),
      status: safeStatus(input.status as string | undefined),
      starterCredits: Number(input.starterCredits || STARTER_CREDITS),
      auditIp: clientIpFromRequest(request)
    });
    if (wantsJson(request)) return json({ event }, { status: 201 });
    return Response.redirect(new URL(`/admin/events/${event.slug}`, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not create event.");
  }
}
