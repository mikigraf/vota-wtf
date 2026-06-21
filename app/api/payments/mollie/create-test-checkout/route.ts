import { NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest } from "@/lib/auth";
import { SAFE_COPY, TEST_CHECKOUT_CREDITS, TEST_CHECKOUT_EUR } from "@/lib/constants";
import {
  attachPaymentToPurchaseData,
  createOrReusePendingPurchaseData,
  findEventByIdData,
  findReusablePendingPurchaseData,
  getSessionParticipantData,
  linkCheckoutIntentPurchaseData,
  recordCheckoutIntentData,
  scopedCheckoutReturnPathData
} from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { verifyAndCreditPurchase } from "@/lib/payments";
import { baseUrl } from "@/lib/utils";

function returnUrl(purchaseId: string, eventSlug: string, returnTo: string) {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${baseUrl()}${returnTo}${separator}checkout=${encodeURIComponent(purchaseId)}`;
}

async function createMolliePayment(purchaseId: string, eventSlug: string, returnTo: string) {
  const key = process.env.MOLLIE_API_KEY || "";
  if (key && !key.startsWith("test_")) throw new Error("Mollie must stay in test mode.");
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("MOLLIE_API_KEY must be configured in production test mode.");
  }
  if (!key) {
    const localReturnTo = encodeURIComponent(returnTo);
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
      description: `vota.wtf ${eventSlug} test MegaBucks`,
      redirectUrl: returnUrl(purchaseId, eventSlug, returnTo),
      webhookUrl: `${baseUrl()}/api/payments/mollie/webhook`,
      metadata: { purchaseId, testOnly: true }
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Mollie test checkout could not be created.");
  const data = await response.json();
  const checkoutUrl = String(data._links?.checkout?.href || "");
  if (!checkoutUrl.startsWith("https://")) throw new Error("Mollie checkout URL was not returned.");
  return {
    molliePaymentId: data.id as string,
    checkoutUrl
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
    const returnTo = await scopedCheckoutReturnPathData(body.returnTo, event.slug);
    await recordCheckoutIntentData(session.participant.id);
    const reusable = await findReusablePendingPurchaseData(session.participant.id, returnTo);
    if (reusable) {
      const verified = await verifyAndCreditPurchase(reusable);
      if (verified.purchase.status === "pending" && verified.purchase.checkoutUrl) {
        await linkCheckoutIntentPurchaseData(session.participant.id, verified.purchase.id);
        return json({
          purchase: verified.purchase,
          checkoutUrl: verified.purchase.checkoutUrl,
          copy: SAFE_COPY.checkout
        });
      }
    }
    const purchase = await createOrReusePendingPurchaseData(session.participant.id, returnTo);
    if (purchase.checkoutUrl) {
      await linkCheckoutIntentPurchaseData(session.participant.id, purchase.id);
      return json({
        purchase,
        checkoutUrl: purchase.checkoutUrl,
        copy: SAFE_COPY.checkout
      });
    }
    const payment = await createMolliePayment(purchase.id, event.slug, returnTo);
    const updated = await attachPaymentToPurchaseData(purchase.id, payment);
    await linkCheckoutIntentPurchaseData(session.participant.id, updated.id);
    return json({
      purchase: updated,
      checkoutUrl: updated.checkoutUrl,
      copy: SAFE_COPY.checkout
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not create test checkout.");
  }
}
