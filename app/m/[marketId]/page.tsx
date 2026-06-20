import { redirect } from "next/navigation";
import { CheckoutReturnStatus } from "@/components/checkout-return-status";
import { ButtonLink, Card, Container, Kicker, LiveDot, PublicTopBar, Shell, StatusPill } from "@/components/ui";
import { PredictionPanel } from "@/components/prediction-panel";
import { getParticipantSessionId } from "@/lib/auth";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { findParticipantPurchaseData, getSessionParticipantData, readPublicMarketStoreData } from "@/lib/data";
import { verifyAndCreditPurchase } from "@/lib/payments";
import { hasCompletedProfile } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";
import { getSessionParticipant, publicMarketState, userMarketState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params,
  searchParams
}: {
  params: Promise<{ marketId: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const { marketId } = await params;
  const search = await searchParams;
  const checkout = firstSearchParam(search.checkout);
  const sessionId = await getParticipantSessionId();
  let store = await readPublicMarketStoreData(marketId, sessionId);
  const market = store.markets.find((item) => item.id === marketId && item.status !== "draft" && item.status !== "voided");
  if (!market) {
    return (
      <Shell>
        <Container>
          <Card>Market not found.</Card>
        </Container>
      </Shell>
    );
  }
  const event = store.events.find((item) => item.id === market.eventId);
  let session = getSessionParticipant(store, sessionId);
  if (session?.participant.eventId !== market.eventId || !hasCompletedProfile(session?.participant)) {
    const next = checkout ? `/m/${market.id}?checkout=${encodeURIComponent(checkout)}` : `/m/${market.id}`;
    redirect(`/join/${event?.slug || DEFAULT_EVENT_SLUG}?next=${encodeURIComponent(next)}`);
  }
  let checkoutMessage = "";
  if (checkout) {
    const sessionParticipantId = session?.participant.id;
    const existing = sessionParticipantId ? await findParticipantPurchaseData(sessionParticipantId, checkout) : undefined;
    if (!existing) {
      checkoutMessage = "Checkout return received, but it belongs to another profile or browser session. Reopen the original event tab or ask the organizer to reconcile the purchase.";
    } else if (existing.status === "credited") {
      checkoutMessage = "Test checkout completed. +100 MBucks added.";
    } else {
      try {
        const result = await verifyAndCreditPurchase(existing);
        if (result.purchase.status === "credited") {
          checkoutMessage = "Test checkout completed. +100 MBucks added.";
        } else if (result.status === "pending") {
          checkoutMessage = "Test checkout is still pending. The wallet updates after verified status confirmation.";
        } else {
          checkoutMessage = `Test checkout ${result.status}. No MegaBucks were issued.`;
        }
      } catch {
        const purchase = sessionParticipantId ? await findParticipantPurchaseData(sessionParticipantId, checkout) : undefined;
        if (purchase?.status === "credited") checkoutMessage = "Test checkout completed. +100 MBucks added.";
        else if (purchase) checkoutMessage = "Test checkout return received. MegaBucks appear after verified status confirmation.";
        else checkoutMessage = "Checkout return received. Waiting for verified payment status.";
      }
      store = await readPublicMarketStoreData(marketId, sessionId);
      session = getSessionParticipant(store, sessionId);
    }
  }
  const state = publicMarketState(store, market);
  const userState = userMarketState(store, { participantId: session?.participant.id, marketId: market.id });
  return (
    <Shell flush>
      <PublicTopBar
        eventCode={event?.name.replace(/\s+/g, "·").toUpperCase()}
        right={
          <>
            <LiveDot label={state.status} />
            <ButtonLink href={`/e/${event?.slug || DEFAULT_EVENT_SLUG}`} variant="ghost" className="min-h-9 border-0 px-4">
              Event home
            </ButtonLink>
          </>
        }
      />
      <Container className="grid gap-6 px-5 py-8">
        <header className="grid gap-5 overflow-hidden rounded-2xl bg-ink p-6 text-white md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="font-mono-vota rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase">{state.category}</span>
              <StatusPill>{state.status}</StatusPill>
            </div>
            <h1 className="font-expanded text-4xl font-black leading-tight md:text-5xl">{state.title}</h1>
            <p className="mt-4 max-w-3xl font-semibold leading-6 text-white/70">{state.description}</p>
            <Kicker className="mt-4 text-mint">Resolution: {state.resolutionRule}</Kicker>
          </div>
          <div className="grid gap-3">
            {state.imageUrl ? <img src={state.imageUrl} alt="" className="h-44 w-full rounded-xl object-cover" /> : null}
            <ButtonLink href={`/e/${event?.slug || DEFAULT_EVENT_SLUG}`} variant="secondary">
              Event home
            </ButtonLink>
          </div>
        </header>
        {checkout ? (
          <Card className="bg-paper">
            <h2 className="text-xl font-extrabold">Supporter checkout</h2>
            <CheckoutReturnStatus purchaseId={checkout} initialMessage={checkoutMessage} />
          </Card>
        ) : null}
        <PredictionPanel
          initialMarket={state}
          eventSlug={event?.slug || DEFAULT_EVENT_SLUG}
          initialUser={userState}
          initialEmergencyPaused={Boolean(event?.emergencyPaused)}
        />
      </Container>
    </Shell>
  );
}
