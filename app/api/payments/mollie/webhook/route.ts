import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore, scopedCheckoutReturnPathData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, readJsonObject } from "@/lib/http";
import { verifyAndCreditPurchase } from "@/lib/payments";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await readJsonObject(request)
    : Object.fromEntries((await request.formData()).entries());
  const id = String(payload.id || payload.purchaseId || "");
  const redirectToEvent = String(payload.redirectToEvent || "") === "1";
  if (!id) return badRequest("Missing Mollie payment id.");
  try {
    const result = await verifyAndCreditPurchase(id, clientIpFromRequest(request));
    if (result.status === "pending") return json({ ok: true, status: "pending" });
    if (redirectToEvent) {
      const current = await readDataStore();
      const participant = current.participants.find((item) => item.id === result.purchase.participantId);
      const event = current.events.find((item) => item.id === participant?.eventId);
      const returnTo = await scopedCheckoutReturnPathData(payload.returnTo, event?.slug || DEFAULT_EVENT_SLUG);
      const separator = returnTo.includes("?") ? "&" : "?";
      return Response.redirect(new URL(`${returnTo}${separator}checkout=${encodeURIComponent(result.purchase.id)}`, request.url), 303);
    }
    return json({ ok: true, purchase: result.purchase, credited: result.credited });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Webhook failed.");
  }
}
