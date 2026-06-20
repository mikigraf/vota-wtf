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
  if (request.nextUrl.searchParams.get("format") === "csv") {
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
  return json({ purchases, metrics: paymentMetrics(store, participantIds) });
}
