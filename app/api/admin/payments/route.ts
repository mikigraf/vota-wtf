import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { csvResponse, json, requireAdminRequest } from "@/lib/http";
import { paymentMetrics } from "@/lib/store";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const store = await readDataStore();
  const eventSlug = request.nextUrl.searchParams.get("eventSlug") || DEFAULT_EVENT_SLUG;
  const event = store.events.find((item) => item.slug === eventSlug);
  const participantIds = new Set(store.participants.filter((participant) => participant.eventId === event?.id).map((participant) => participant.id));
  const purchases = store.purchases.filter((purchase) => participantIds.has(purchase.participantId));
  const checkoutIntents = store.checkoutIntents
    .filter((intent) => participantIds.has(intent.participantId))
    .map((intent) => {
      const participant = store.participants.find((item) => item.id === intent.participantId);
      const linkedPurchase = intent.purchaseId ? store.purchases.find((purchase) => purchase.id === intent.purchaseId) : undefined;
      return {
        ...intent,
        participantName: participant?.nickname || "",
        participantEmail: participant?.email || "",
        linkedPurchaseStatus: linkedPurchase?.status || "intent",
        totalClickValueEur: intent.amountEur * intent.clickCount,
        totalClickCredits: intent.credits * intent.clickCount
      };
    });
  if (request.nextUrl.searchParams.get("format") === "csv") {
    if (request.nextUrl.searchParams.get("type") === "intents") {
      return csvResponse(
        "vota-checkout-intents.csv",
        checkoutIntents.map((intent) => ({
          id: intent.id,
          participantId: intent.participantId,
          participantName: intent.participantName,
          participantEmail: intent.participantEmail,
          clickCount: intent.clickCount,
          amountEurEach: intent.amountEur,
          totalClickValueEur: intent.totalClickValueEur,
          creditsEach: intent.credits,
          totalClickCredits: intent.totalClickCredits,
          purchaseId: intent.purchaseId || "",
          linkedPurchaseStatus: intent.linkedPurchaseStatus,
          firstClickedAt: intent.firstClickedAt,
          lastClickedAt: intent.lastClickedAt
        }))
      );
    }
    return csvResponse(
      "vota-test-purchases.csv",
      purchases.map((purchase) => ({
        id: purchase.id,
        participantId: purchase.participantId,
        status: purchase.status,
        amountEur: purchase.amountEur,
        currency: purchase.currency,
        credits: purchase.credits,
        molliePaymentId: purchase.molliePaymentId || "",
        createdAt: purchase.createdAt,
        paidAt: purchase.paidAt || "",
        creditedAt: purchase.creditedAt || ""
      }))
    );
  }
  return json({ purchases, checkoutIntents, metrics: paymentMetrics(store, participantIds) });
}
