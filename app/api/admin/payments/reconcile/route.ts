import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { findEventBySlugData, findPurchaseData, readDataStore } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, readJsonObject, requireAdminRequest } from "@/lib/http";
import { verifyAndCreditPurchase } from "@/lib/payments";

function paymentsRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/payments", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url, 303);
}

async function reconcileInputFromRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await readJsonObject(request);
    return {
      purchaseId: String(payload.purchaseId || payload.id || ""),
      eventSlug: String(payload.eventSlug || DEFAULT_EVENT_SLUG)
    };
  }
  const form = await request.formData();
  return {
    purchaseId: String(form.get("purchaseId") || form.get("id") || ""),
    eventSlug: String(form.get("eventSlug") || DEFAULT_EVENT_SLUG)
  };
}

async function assertPurchaseBelongsToEvent(purchaseId: string, eventSlug: string) {
  const [event, purchase, store] = await Promise.all([
    findEventBySlugData(eventSlug),
    findPurchaseData(purchaseId),
    readDataStore()
  ]);
  if (!event) throw new Error("Event not found.");
  if (!purchase) throw new Error("Purchase not found.");
  const participant = store.participants.find((item) => item.id === purchase.participantId);
  if (!participant || participant.eventId !== event.id) {
    throw new Error("Purchase does not belong to this event.");
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const contentType = request.headers.get("content-type") || "";
  const wantsJson = contentType.includes("application/json");
  const { purchaseId, eventSlug } = await reconcileInputFromRequest(request);
  if (!purchaseId) {
    return wantsJson
      ? badRequest("Missing purchase id.")
      : paymentsRedirect(request, { eventSlug, error: "missing-purchase-id" });
  }

  try {
    await assertPurchaseBelongsToEvent(purchaseId, eventSlug);
    const result = await verifyAndCreditPurchase(purchaseId, clientIpFromRequest(request));
    if (!wantsJson) {
      return paymentsRedirect(request, {
        eventSlug,
        reconciled: result.purchase.id,
        status: result.status,
        credited: result.credited ? "1" : "0"
      });
    }
    return json({ ok: true, purchase: result.purchase, credited: result.credited, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reconcile payment.";
    return wantsJson ? badRequest(message) : paymentsRedirect(request, { eventSlug, error: message.slice(0, 120) });
  }
}
