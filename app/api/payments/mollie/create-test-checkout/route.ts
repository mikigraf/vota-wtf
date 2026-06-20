import { NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest } from "@/lib/auth";
import { SAFE_COPY, TEST_CHECKOUT_CREDITS, TEST_CHECKOUT_EUR } from "@/lib/constants";
import {
  attachPaymentToPurchaseData,
  createPurchaseData,
  findEventByIdData,
  findReusablePendingPurchaseData,
  getSessionParticipantData
} from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { baseUrl } from "@/lib/utils";

function safeReturnTo(value: unknown, eventSlug: string) {
  const fallback = `/e/${eventSlug}`;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240 || !trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  try {
    const url = new URL(trimmed, "https://vota.local");
    if (url.origin !== "https://vota.local") return fallback;
    url.searchParams.delete("checkout");
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function returnUrl(purchaseId: string, eventSlug: string, returnTo: string) {
  const path = safeReturnTo(returnTo, eventSlug);
  const separator = path.includes("?") ? "&" : "?";
  return `${baseUrl()}${path}${separator}checkout=${encodeURIComponent(purchaseId)}`;
}

async function createMolliePayment(purchaseId: string, eventSlug: string, returnTo: string) {
  const key = process.env.MOLLIE_API_KEY || "";
  if (key && !key.startsWith("test_")) throw new Error("Mollie must stay in test mode.");
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("MOLLIE_API_KEY must be configured in production test mode.");
  }
  if (!key) {
    const localReturnTo = encodeURIComponent(safeReturnTo(returnTo, eventSlug));
    return {
      molliePaymentId: `local_${purchaseId}`,
      checkoutUrl: `${baseUrl()}/checkout/test/${purchaseId}?returnTo=${localReturnTo}`
    };
  }
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": purchaseId
    },
    body: JSON.stringify({
      amount: { currency: "EUR", value: TEST_CHECKOUT_EUR.toFixed(2) },
      description: "vota.wtf MEGATHON test MegaBucks",
      redirectUrl: returnUrl(purchaseId, eventSlug, returnTo),
      webhookUrl: `${baseUrl()}/api/payments/mollie/webhook`,
      metadata: { purchaseId, testOnly: true }
    })
  });
  if (!response.ok) throw new Error("Mollie test checkout could not be created.");
  const data = await response.json();
  return {
    molliePaymentId: data.id as string,
    checkoutUrl: data._links?.checkout?.href as string
  };
}

export async function POST(request: NextRequest) {
  const session = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (!session) return badRequest("Join the event before using test checkout.", 401);
  if (session.participant.isBanned) return badRequest("This profile is paused by moderation.", 403);
  if (!hasCompletedProfile(session.participant)) return badRequest("Finish your profile before using test checkout.", 401);
  try {
    const body = await readJsonObject(request);
    const event = await findEventByIdData(session.participant.eventId);
    if (!event) return badRequest("Event not found.", 404);
    if (event.emergencyPaused) return badRequest("The arena is paused by the organizer.", 423);
    const returnTo = safeReturnTo(body.returnTo, event.slug);
    const reusable = await findReusablePendingPurchaseData(session.participant.id);
    if (reusable) {
      return json({
        purchase: reusable,
        checkoutUrl: reusable.checkoutUrl,
        copy: SAFE_COPY.checkout
      });
    }
    const purchase = await createPurchaseData(session.participant.id);
    const payment = await createMolliePayment(purchase.id, event.slug, returnTo);
    const updated = await attachPaymentToPurchaseData(purchase.id, payment);
    return json({
      purchase: updated,
      checkoutUrl: updated.checkoutUrl,
      copy: SAFE_COPY.checkout
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not create test checkout.");
  }
}
