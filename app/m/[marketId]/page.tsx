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
            <ButtonLink href={`/e/${event?.slug || DEFAULT_EVENT_SLUG}`} variant="ghost" className="min-h-11 border-0 px-3 text-xs sm:px-4 sm:text-sm">
              <span className="sm:hidden">Home</span>
              <span className="hidden sm:inline">Event home</span>
            </ButtonLink>
          </>
        }
      />
      <Container className="grid gap-1.5 px-2 py-1.5 sm:gap-5 sm:px-5 sm:py-6 lg:gap-6 lg:py-8">
        <header className="grid gap-1 overflow-hidden rounded-lg bg-ink p-1.5 text-white sm:gap-3 sm:rounded-2xl sm:p-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-5">
          <div>
            <div className="mb-1 flex flex-nowrap items-center justify-between gap-1.5 sm:mb-3 sm:flex-wrap sm:justify-start sm:gap-2">
              <span className="font-mono-vota rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase sm:px-3 sm:text-[10px]">{state.category}</span>
              <StatusPill>{state.status}</StatusPill>
            </div>
            <h1 className="font-expanded line-clamp-2 text-base font-black leading-tight sm:text-4xl md:text-5xl">{state.title}</h1>
            <p className="mt-3 hidden max-w-3xl font-semibold leading-6 text-white/70 sm:block">{state.description}</p>
            <Kicker className="mt-3 hidden text-mint sm:block">Resolution: {state.resolutionRule}</Kicker>
          </div>
          <div className="hidden gap-3 md:grid">
            {state.imageUrl ? <img src={state.imageUrl} alt="" className="h-44 w-full rounded-xl object-cover" /> : null}
          </div>
        </header>
        {checkout ? (
          <Card className="grid gap-3 bg-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
            <div>
              <h2 className="text-base font-extrabold sm:text-xl">Supporter checkout</h2>
              <CheckoutReturnStatus purchaseId={checkout} initialMessage={checkoutMessage} />
            </div>
            <ButtonLink href={`/m/${market.id}`} className="min-h-11 text-xs sm:text-sm">
              Continue prediction
            </ButtonLink>
          </Card>
        ) : null}
        <PredictionPanel
          initialMarket={state}
          eventSlug={event?.slug || DEFAULT_EVENT_SLUG}
          initialUser={userState}
          initialEmergencyPaused={Boolean(event?.emergencyPaused)}
        />
        <section className="grid gap-2 rounded-xl border border-line bg-white p-3 text-sm sm:hidden">
          <h2 className="text-sm font-black">Market details</h2>
          <p className="font-semibold leading-5 text-muted">{state.description}</p>
          <div className="rounded-lg bg-paper p-2">
            <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">Resolution</div>
            <p className="mt-1 font-semibold leading-5 text-ink">{state.resolutionRule}</p>
          </div>
        </section>
      </Container>
    </Shell>
  );
}
