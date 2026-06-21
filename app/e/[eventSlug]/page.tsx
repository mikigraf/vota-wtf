import { redirect } from "next/navigation";
import { CheckoutButton } from "@/components/checkout-button";
import { CheckoutReturnStatus } from "@/components/checkout-return-status";
import { PublicEventLive } from "@/components/public-event-live";
import { PublicMissingLink } from "@/components/public-missing-link";
import { ButtonLink, Card, Container, DisplayTitle, Kicker, LiveDot, PublicTopBar, Shell, Stat, Tape } from "@/components/ui";
import { getParticipantSessionId } from "@/lib/auth";
import { DEFAULT_EVENT_SLUG, SAFE_COPY } from "@/lib/constants";
import {
  findEventBySlugData,
  findParticipantPurchaseData,
  getSessionParticipantData,
  readLeaderboardGroupsData,
  readParticipantLedgerEntriesData,
  readPublicStateData
} from "@/lib/data";
import { verifyAndCreditPurchase } from "@/lib/payments";
import { hasCompletedProfile } from "@/lib/participants";
import { firstSearchParam } from "@/lib/search-params";
import type { LedgerEntry } from "@/lib/types";
import { credits, mbucks, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const { eventSlug } = await params;
  const search = await searchParams;
  const slug = eventSlug || DEFAULT_EVENT_SLUG;
  const sessionId = await getParticipantSessionId();
  let session = await getSessionParticipantData(sessionId);
  const event = await findEventBySlugData(slug);
  const checkout = firstSearchParam(search.checkout);
  if (!event) {
    return (
      <PublicMissingLink
        title="Room not found"
        message="This event link is not active. Jump back into the main live room."
        href={`/join/${DEFAULT_EVENT_SLUG}`}
      />
    );
  }
  if (session?.participant.eventId !== event.id || !hasCompletedProfile(session?.participant)) {
    const next = checkout ? `/e/${slug}?checkout=${encodeURIComponent(checkout)}` : `/e/${slug}`;
    redirect(`/join/${slug}?next=${encodeURIComponent(next)}`);
  }
  const [state, groups] = await Promise.all([
    readPublicStateData(slug),
    readLeaderboardGroupsData(slug)
  ]);
  let checkoutMessage = "";
  if (checkout) {
    const sessionParticipantId = session?.participant.id;
    const existing = sessionParticipantId ? await findParticipantPurchaseData(sessionParticipantId, checkout) : undefined;
    if (!session) {
      checkoutMessage = "Checkout return received. Join this event to check verified payment status.";
    } else if (!existing) {
      checkoutMessage = "Checkout return received, but it belongs to another profile or browser session. Reopen the original event tab or ask the organizer to reconcile the purchase.";
    } else if (existing.status === "credited") {
      checkoutMessage = "Test checkout completed. +100 MBucks added.";
    } else {
      try {
        const result = await verifyAndCreditPurchase(existing);
        session = await getSessionParticipantData(sessionId);
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
    }
  }
  const ledgerEntries = session
    ? await readParticipantLedgerEntriesData(session.participant.id, 8)
    : [];
  const leaders = groups.overall.slice(0, 5);
  const openMarkets = state.markets.filter((market) => market.status === "open").length;
  const participantOrderedMarkets = [...state.markets].sort((a, b) => compareMarketForParticipant(a, b, state.event.featuredMarketId));
  const featuredVisibleMarket = state.event.featuredMarketId
    ? participantOrderedMarkets.find((market) => market.id === state.event.featuredMarketId)
    : undefined;
  const nextOpenMarket = participantOrderedMarkets.find((market) => market.status === "open");
  const openFeaturedMarket = featuredVisibleMarket?.status === "open" ? featuredVisibleMarket : undefined;
  const heroMarket = openFeaturedMarket || nextOpenMarket || featuredVisibleMarket;
  const heroLeader = heroMarket ? leadingOutcomeForEvent(heroMarket) : undefined;
  const showMobileTopUp = Boolean(session);
  const heroCta =
    !heroMarket ? "Waiting" :
    heroMarket.status === "open" ? "Predict" :
    heroMarket.status === "locked" ? "View locked card" :
    heroMarket.status === "resolved" ? "See result" :
    "View card";
  return (
    <Shell flush>
      <PublicTopBar
        eventCode={state.event.name.replace(/\s+/g, "·").toUpperCase()}
        right={
          <>
            <span className="font-mono-vota text-xs text-white/80">{session?.wallet ? mbucks(session.wallet.balanceCredits) : "1,000 starter MBucks"}</span>
            <LiveDot />
            {session ? <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-white/80">{session.participant.nickname}</span> : null}
          </>
        }
      />
      <div className="hidden sm:block">
        <Tape
          items={[
            { label: "OPEN", value: `${openMarkets} MARKETS`, tone: "mint" },
            { label: "TOP ORACLE", value: leaders[0]?.nickname || "SOON", tone: "ember" },
            { label: "CREDITS", value: session?.wallet ? mbucks(session.wallet.balanceCredits) : "FREE TO PLAY", tone: "white" },
            { label: "LIVE ODDS", value: "ROOM SIGNAL OVER TIME", tone: "mint" }
          ]}
        />
      </div>
      <Container className="grid gap-2 px-2 py-2 sm:gap-4 sm:px-5 sm:py-8 lg:gap-6 lg:py-10">
        {checkout ? (
          <Card className="grid gap-4 border-mint bg-mint/10 p-4 md:grid-cols-[1fr_auto] md:items-center md:p-5">
            <div>
              <h2 className="text-xl font-black">Checkout status</h2>
              <CheckoutReturnStatus purchaseId={checkout} initialMessage={checkoutMessage} />
            </div>
            <ButtonLink href={heroMarket ? `/m/${heroMarket.id}` : `/e/${slug}`}>
              {heroMarket?.status === "open" ? "Make a prediction" : "Back to markets"}
            </ButtonLink>
          </Card>
        ) : null}
        <section className="grid gap-1.5 lg:hidden">
          <Card className="border-ink p-2 shadow-panel sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <Kicker className="text-[10px]">Live room</Kicker>
              <span className="font-mono-vota rounded-full bg-soft px-2 py-0.5 text-[9px] font-bold uppercase text-muted">
                {session?.wallet ? mbucks(session.wallet.balanceCredits) : "1,000 starter"} · {openMarkets} open
              </span>
            </div>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="min-w-0">
                <h1 className="line-clamp-2 text-sm font-black leading-tight sm:text-xl">
                  {heroMarket ? heroMarket.title : "Markets opening soon"}
                </h1>
                <p className="mt-0.5 line-clamp-2 text-xs font-bold leading-tight text-muted sm:text-sm">
                  {heroMarket
                    ? heroMarket.status === "locked"
                      ? "Predictions locked. Watch the reveal."
                      : heroMarket.status === "resolved"
                        ? "Result is in. Check your receipt."
                      : heroMarket.blindLaunch.active
                        ? `${heroMarket.blindLaunch.predictedCount} predicted. Signal hidden.`
                        : heroLeader
                          ? `${heroLeader.label} leads ${pct(heroLeader.stageSignal)}`
                          : "Pick the next open card."
                    : "Stay ready for the organizer's next card."}
                </p>
              </div>
              {heroMarket ? (
                <ButtonLink className="min-h-11 shrink-0 px-3 text-xs sm:px-5 sm:text-sm" href={`/m/${heroMarket.id}`}>
                  {heroCta}
                </ButtonLink>
              ) : (
                <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-line bg-soft px-3 text-xs font-black text-muted sm:px-5 sm:text-sm">
                  {heroCta}
                </span>
              )}
            </div>
            {showMobileTopUp ? (
              <div className="mt-1.5 rounded-xl border border-line bg-paper p-2 sm:mt-3 sm:p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <p className="text-xs font-bold leading-4 text-muted">{SAFE_COPY.checkout}</p>
                  <CheckoutButton
                    returnTo={`/e/${slug}`}
                    disabled={state.event.emergencyPaused}
                    disabledReason="Organizer pause is on. MegaBuck top-ups reopen soon."
                  />
                </div>
              </div>
            ) : null}
          </Card>
        </section>
        <header className="hidden gap-6 lg:grid lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Kicker>Markets for what the room believes</Kicker>
            <DisplayTitle className="mt-3 max-w-4xl text-[44px] md:text-[76px]">
              Call it before <span className="text-ember">the room does.</span>
            </DisplayTitle>
            <p className="mt-5 max-w-2xl text-lg font-semibold leading-7 text-muted">
              Predict {state.event.name} outcomes, commit free MegaBucks, and earn Oracle Score when your call was early and right.
              MegaBucks have no cash value.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={heroMarket ? `/m/${heroMarket.id}` : `/e/${slug}`}>
              {heroMarket?.status === "open" ? "Make your first call" : heroMarket ? heroCta : "Markets opening soon"}
            </ButtonLink>
          </div>
        </header>

        <section className="hidden gap-3 lg:grid lg:grid-cols-4">
          <Stat label="Your profile" value={session ? session.participant.nickname : "Guest"} />
          <Stat label="Wallet" value={session?.wallet ? mbucks(session.wallet.balanceCredits) : "Join"} />
          <Stat label="Open markets" value={openMarkets} />
          <Stat label="Top Oracle" value={leaders[0]?.nickname || "Soon"} />
        </section>

        {state.event.emergencyPaused ? (
          <Card className="border-danger bg-danger/10">
            <h2 className="text-xl font-black text-danger">Predictions are paused</h2>
            <p className="mt-1 text-sm font-bold text-muted">
              The organizer temporarily paused predictions and MegaBuck top-ups. Existing positions and receipts stay intact.
            </p>
          </Card>
        ) : null}

        {session ? (
          <Card className="hidden gap-4 bg-paper lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-xl font-extrabold">Add MegaBucks</h2>
              <p className="mt-1 text-sm font-semibold text-muted">{SAFE_COPY.checkout}</p>
              {!checkout && checkoutMessage ? (
                <p className="mt-2 text-sm font-black text-mint">{checkoutMessage}</p>
              ) : null}
            </div>
            <CheckoutButton
              returnTo={`/e/${slug}`}
              disabled={state.event.emergencyPaused}
              disabledReason="Organizer pause is on. MegaBuck top-ups reopen soon."
            />
          </Card>
        ) : null}

        <PublicEventLive eventSlug={slug} initialState={state} />

        {session ? (
          <div className="hidden lg:block">
            <MegaBuckHistory entries={ledgerEntries} />
          </div>
        ) : null}

        <Card className="hidden lg:block">
          <h2 className="font-expanded text-xl font-black">Top Oracles</h2>
          <div className="mt-3 grid gap-2">
            {leaders.length === 0 ? (
              <p className="rounded-xl bg-paper p-3 text-sm font-bold text-muted">No scores yet. Resolve the first market to light up the board.</p>
            ) : null}
            {leaders.map((leader, index) => (
              <div key={leader.id} className="grid grid-cols-[40px_1fr_auto] rounded-xl bg-paper p-3 text-sm font-bold">
                <span className="font-mono-vota text-faded">{index + 1}</span>
                <span className="min-w-0 break-words font-extrabold">{leader.nickname}</span>
                <span className="font-mono-vota text-ember">{credits(leader.oracleScore)}</span>
              </div>
            ))}
          </div>
        </Card>

        <section className="hidden gap-4 lg:grid lg:grid-cols-2">
          <LeaderboardMini title="Early callers" rows={groups.earlyCallers.slice(0, 4)} metric="earlyScore" />
          <LeaderboardMini title="Contrarian calls" rows={groups.contrarianCalls.slice(0, 4)} metric="contrarianScore" />
        </section>
      </Container>
    </Shell>
  );
}

function compareMarketForParticipant(
  a: Awaited<ReturnType<typeof readPublicStateData>>["markets"][number],
  b: Awaited<ReturnType<typeof readPublicStateData>>["markets"][number],
  featuredMarketId?: string
) {
  const statusRank = (status: string) => (status === "open" ? 0 : status === "locked" ? 1 : status === "resolved" ? 2 : 3);
  const statusDelta = statusRank(a.status) - statusRank(b.status);
  if (statusDelta !== 0) return statusDelta;
  if (featuredMarketId) {
    if (a.id === featuredMarketId && b.id !== featuredMarketId) return -1;
    if (b.id === featuredMarketId && a.id !== featuredMarketId) return 1;
  }
  return a.title.localeCompare(b.title);
}

function leadingOutcomeForEvent(market: Awaited<ReturnType<typeof readPublicStateData>>["markets"][number]) {
  return [...market.outcomes].sort((a, b) => b.stageSignal - a.stageSignal || b.peopleCount - a.peopleCount)[0];
}

function MegaBuckHistory({ entries }: { entries: LedgerEntry[] }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-expanded text-xl font-black">MegaBuck history</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            Every wallet change is recorded server-side. MegaBucks settle inside vota.wtf only.
          </p>
        </div>
        <span className="font-mono-vota rounded-full bg-soft px-3 py-1 text-[10px] font-bold uppercase text-muted">Internal MegaBucks</span>
      </div>
      <div className="mt-4 grid gap-2">
        {entries.length === 0 ? (
          <p className="rounded-xl bg-paper p-3 text-sm font-bold text-muted">Your starter MegaBucks will appear after joining.</p>
        ) : null}
        {entries.map((entry) => (
          <div key={entry.id} className="grid gap-2 rounded-xl bg-paper p-3 text-sm font-bold md:grid-cols-[120px_1fr_auto] md:items-center">
            <span className={entry.amountCredits >= 0 ? "font-mono-vota text-mint" : "font-mono-vota text-danger"}>
              {entry.amountCredits >= 0 ? "+" : ""}
              {mbucks(entry.amountCredits)}
            </span>
            <span>
              {entry.reason}
              <span className="font-mono-vota mt-1 block break-all text-[10px] font-bold uppercase text-faded">
                {entry.purchaseId ? `Purchase ${entry.purchaseId}` : entry.marketId ? `Market ${entry.marketId}` : `Ledger ${entry.id}`}
              </span>
            </span>
            <time className="font-mono-vota text-[10px] font-bold uppercase text-faded" dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </time>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LeaderboardMini({
  title,
  rows,
  metric = "oracleScore"
}: {
  title: string;
  rows: Array<{ id: string; nickname: string; oracleScore: number; earlyScore: number; contrarianScore: number }>;
  metric?: "oracleScore" | "earlyScore" | "contrarianScore";
}) {
  return (
    <Card>
      <h2 className="font-expanded text-lg font-black">{title}</h2>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? <p className="text-sm font-bold text-muted">Resolutions will unlock this board.</p> : null}
        {rows.map((row, index) => (
          <div key={`${title}-${row.id}`} className="grid grid-cols-[32px_1fr_auto] rounded-xl bg-paper p-3 text-sm font-bold">
            <span className="font-mono-vota text-faded">{index + 1}</span>
            <span>
              <span className="font-extrabold">{row.nickname}</span>
            </span>
            <span className="font-mono-vota text-ember">{credits(row[metric])}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
