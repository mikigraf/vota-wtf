"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, StatusPill } from "@/components/ui";
import type { PublicEventState } from "@/lib/types";
import { mbucks, pct } from "@/lib/utils";

const chartColors = ["#FF5A1F", "#6E6E68", "#3a3a3c", "#18C97B", "#F0C000", "#1f9bd1", "#6b55d7", "#FF5A5A"];

export function PublicEventLive({
  eventSlug,
  initialState,
  intervalMs = 3000
}: {
  eventSlug: string;
  initialState: PublicEventState;
  intervalMs?: number;
}) {
  const [state, setState] = useState(initialState);
  const featuredMarketId = state.event.featuredMarketId;
  const markets = useMemo(() => [...state.markets].sort((a, b) => compareMarketForParticipant(a, b, featuredMarketId)), [state.markets, featuredMarketId]);
  const mobilePrimaryMarkets = markets.slice(0, 1);
  const mobileMoreMarkets = markets.slice(1);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/events/${eventSlug}/public-state`, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as PublicEventState;
        if (!cancelled) setState(next);
      } catch {
        // Keep the last rendered public state when a transient poll fails.
      }
    }
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventSlug, intervalMs]);

  return (
    <section>
      <div className="mb-3 hidden flex-wrap items-baseline justify-between gap-3 sm:mb-4 sm:flex">
        <h2 className="font-expanded text-xl font-black sm:text-2xl">Predictions</h2>
        <span className="font-mono-vota text-xs font-bold uppercase text-faded">{String(state.markets.length).padStart(2, "0")} total</span>
      </div>
      {state.event.emergencyPaused ? (
        <Card className="mb-4 border-danger bg-danger/10">
          <h3 className="text-lg font-black text-danger">Predictions paused</h3>
          <p className="mt-1 text-sm font-bold text-muted">The organizer paused new commits. The room signal and open positions stay visible.</p>
        </Card>
      ) : null}
      {state.markets.length === 0 ? (
        <Card className="bg-paper">
          <h3 className="text-lg font-black">Markets are loading</h3>
          <p className="mt-1 text-sm font-bold text-muted">The next prediction card will appear here when the organizer opens it.</p>
        </Card>
      ) : null}
      <div className="grid gap-1 sm:hidden">
        {mobilePrimaryMarkets.map((market) => {
          const leader = leadingOutcome(market);
          const isOpen = market.status === "open";
          return (
            <Link
              key={market.id}
              data-testid={`market-card-${market.id}`}
              href={`/m/${market.id}`}
              className={`focus-ring rounded-lg border bg-white px-2 py-1.5 shadow-panel ${isOpen ? "border-ink" : "border-line"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-vota rounded-full bg-soft px-2 py-0.5 text-[9px] font-bold uppercase">{market.category}</span>
                <StatusPill>{market.status}</StatusPill>
              </div>
              <h3 className="mt-1 line-clamp-2 text-sm font-extrabold leading-tight">{market.title}</h3>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="line-clamp-2 min-w-0 text-xs font-bold leading-tight text-muted">
                  {market.blindLaunch.active ? `${market.blindLaunch.predictedCount} predicted` : leader?.label || "Room signal"}
                </span>
                <span className="font-mono-vota text-[11px] font-bold text-ember">
                  {market.blindLaunch.active ? `-${market.blindLaunch.remainingPredictions}` : leader ? pct(leader.stageSignal) : "0%"}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-soft">
                <div className="vota-fill h-full rounded-full bg-ember" style={{ width: market.blindLaunch.active || !leader ? "0%" : pct(leader.stageSignal) }} />
              </div>
              <div className="font-mono-vota mt-1 flex items-center justify-between gap-2 text-[9px] font-bold uppercase text-faded">
                <span>{market.totalParticipants} people</span>
                <span>{mbucks(market.totalSignalCredits)}</span>
              </div>
            </Link>
          );
        })}
        {mobileMoreMarkets.length > 0 ? (
          <details className="rounded-lg border border-line bg-paper p-1.5">
            <summary className="focus-ring flex min-h-11 cursor-pointer items-center rounded-md px-2 text-xs font-extrabold">
              {mobileMoreMarkets.length} more card{mobileMoreMarkets.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-2 grid gap-1.5">
              {mobileMoreMarkets.map((market) => {
                const leader = leadingOutcome(market);
                return (
                  <Link key={market.id} data-testid={`market-card-${market.id}`} href={`/m/${market.id}`} className="focus-ring grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs font-bold">
                    <span className="line-clamp-2 min-w-0 leading-tight">{market.title}</span>
                    <span className="font-mono-vota shrink-0 text-[10px] text-ember">
                      {market.blindLaunch.active ? "Hidden" : leader ? pct(leader.stageSignal) : market.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
      <div className="hidden gap-3 sm:grid md:grid-cols-2 md:gap-5 xl:grid-cols-3">
        {markets.map((market) => (
          <Link key={market.id} data-testid={`market-card-${market.id}`} href={`/m/${market.id}`} className="group">
            <Card className="h-full overflow-hidden p-0 transition group-hover:-translate-y-0.5 group-hover:border-ink">
              <div className="grid grid-cols-[92px_minmax(0,1fr)] sm:block">
                <div className="min-h-[154px] bg-ink p-2 sm:h-32 sm:min-h-0 sm:p-4">
                  {market.imageUrl ? (
                    <img src={market.imageUrl} alt="" className="h-full w-full rounded-xl object-cover opacity-80" />
                  ) : (
                    <MiniMarketChart market={market} />
                  )}
                </div>
                <div className="flex min-h-[154px] flex-col p-3 sm:h-[calc(100%-8rem)] sm:p-5">
                  <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3 sm:gap-3">
                    <span className="font-mono-vota rounded-full bg-soft px-3 py-1 text-[10px] font-bold uppercase">{market.category}</span>
                    <StatusPill>{market.status}</StatusPill>
                  </div>
                  <h2 className="text-base font-extrabold leading-tight sm:text-xl">{market.title}</h2>
                  <p className="mt-2 hidden text-sm font-semibold leading-5 text-muted sm:block">{market.description}</p>
                  <div className="mt-3 grid gap-2 sm:mt-4 sm:gap-3">
                    {market.outcomes.map((outcome, index) => (
                      <div key={outcome.id} className={index > 1 ? "hidden gap-1 sm:grid" : "grid gap-1"}>
                        <div className="grid grid-cols-[1fr_auto] gap-3 text-sm font-bold">
                          <span className="min-w-0 truncate">{outcome.label}</span>
                          <span className="font-mono-vota text-xs text-faded">
                            {market.blindLaunch.active ? "LOCKED" : pct(outcome.stageSignal)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-soft">
                          <div className="vota-fill h-full rounded-full bg-ember" style={{ width: market.blindLaunch.active ? "0%" : pct(outcome.stageSignal) }} />
                        </div>
                      </div>
                    ))}
                    {market.outcomes.length > 2 ? (
                      <div className="font-mono-vota text-[10px] font-bold uppercase text-faded sm:hidden">
                        +{market.outcomes.length - 2} more options
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto pt-3 sm:pt-4">
                    <div className="font-mono-vota flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase text-faded">
                      <span>{market.blindLaunch.active ? `${market.blindLaunch.predictedCount} predicted` : `${market.totalParticipants} people`}</span>
                      <span>{mbucks(market.totalSignalCredits)} signal</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function compareMarketForParticipant(a: PublicEventState["markets"][number], b: PublicEventState["markets"][number], featuredMarketId?: string) {
  const statusRank = (status: string) => (status === "open" ? 0 : status === "locked" ? 1 : status === "resolved" ? 2 : 3);
  const statusDelta = statusRank(a.status) - statusRank(b.status);
  if (statusDelta !== 0) return statusDelta;
  if (featuredMarketId) {
    if (a.id === featuredMarketId && b.id !== featuredMarketId) return -1;
    if (b.id === featuredMarketId && a.id !== featuredMarketId) return 1;
  }
  return a.title.localeCompare(b.title);
}

function leadingOutcome(market: PublicEventState["markets"][number]) {
  return [...market.outcomes].sort((a, b) => b.stageSignal - a.stageSignal || b.peopleCount - a.peopleCount)[0];
}

function MiniMarketChart({ market }: { market: PublicEventState["markets"][number] }) {
  const points = market.oddsHistory.slice(-16);
  if (points.length < 2) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-expanded text-4xl font-black text-ember">{market.category.slice(0, 1).toUpperCase()}</div>
      </div>
    );
  }
  const width = 240;
  const height = 88;
  const pad = 8;
  const pathForOutcome = (outcomeId: string) =>
    points
      .map((point, index) => {
        const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
        const value = point.outcomeSignals[outcomeId]?.stageSignal || 0;
        const y = height - pad - value * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
      {[0.25, 0.5, 0.75].map((line) => (
        <line
          key={line}
          x1={pad}
          x2={width - pad}
          y1={height - pad - line * (height - pad * 2)}
          y2={height - pad - line * (height - pad * 2)}
          stroke="#ffffff"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
      ))}
      {market.outcomes.slice(0, 5).map((outcome, index) => (
        <polyline
          key={outcome.id}
          fill="none"
          points={pathForOutcome(outcome.id)}
          stroke={chartColors[index % chartColors.length]}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={index === 0 ? "3" : "2"}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
