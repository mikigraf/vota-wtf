"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "@/components/qr-code";
import { subscribeToSupabaseRealtime } from "@/lib/supabase-realtime";
import { credits, mbucks, pct } from "@/lib/utils";
import type { LeaderboardGroups, PublicMarketState, StageMode } from "@/lib/types";

const stageChartColors = ["#FF5A1F", "#6E6E68", "#18C97B", "#F0C000", "#1f9bd1", "#6b55d7", "#FF5A5A", "#3a3a3c"];

interface StageState {
  event: {
    slug: string;
    name: string;
    status: string;
    stageMode: StageMode;
    featuredMarketId?: string;
    emergencyPaused: boolean;
  };
  markets: PublicMarketState[];
  leaderboard: Array<{ id: string; nickname: string; oracleScore: number }>;
  leaderboardGroups?: LeaderboardGroups;
}

function isCompatibleStageMarket(stageMode: StageMode, market: PublicMarketState) {
  if (stageMode === "join" || stageMode === "leaderboard") return true;
  if (stageMode === "resolution") return market.status === "resolved";
  return market.status === "open" || market.status === "locked";
}

function burstConfetti() {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.className = "pointer-events-none fixed inset-0 z-50 overflow-hidden";
  for (let index = 0; index < 90; index += 1) {
    const piece = document.createElement("span");
    piece.className = "absolute h-3 w-2 rounded-sm";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.top = "-20px";
    piece.style.background = ["#FF5A1F", "#18C97B", "#F0C000", "#0B0B0C"][index % 4];
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    piece.style.transition = `transform ${1600 + Math.random() * 1100}ms ease-out, top ${1600 + Math.random() * 1100}ms ease-in`;
    root.appendChild(piece);
    window.setTimeout(() => {
      piece.style.top = "110vh";
      piece.style.transform = `translateX(${Math.random() * 360 - 180}px) rotate(${720 + Math.random() * 540}deg)`;
    }, 20);
  }
  document.body.appendChild(root);
  window.setTimeout(() => root.remove(), 3200);
}

export function StageView({ initial, joinUrl }: { initial: StageState; joinUrl: string }) {
  const [state, setState] = useState(initial);
  const [showAgentLayer, setShowAgentLayer] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const lastResolved = useRef<string | undefined>(undefined);
  const lastSignalSignature = useRef<string | undefined>(undefined);
  const stageMarkets = useMemo(
    () => state.markets.filter((item) => item.status !== "voided" && item.showOnStage && isCompatibleStageMarket(state.event.stageMode, item)),
    [state.event.stageMode, state.markets]
  );
  const market = useMemo(
    () => stageMarkets.find((item) => item.id === state.event.featuredMarketId) || stageMarkets[0],
    [stageMarkets, state.event.featuredMarketId]
  );
  const signalSignature = market
    ? [
        market.id,
        market.status,
        market.totalParticipants,
        market.totalSignalCredits,
        ...market.outcomes.map((outcome) => `${outcome.id}:${outcome.peopleCount}:${outcome.signalCredits}:${outcome.humanCount}:${outcome.agentCount}`)
      ].join("|")
    : "";
  async function refresh() {
    try {
      const [publicStateResponse, leaderboardResponse] = await Promise.all([
        fetch(`/api/events/${state.event.slug}/public-state`, { cache: "no-store" }),
        fetch(`/api/leaderboard/${state.event.slug}`, { cache: "no-store" })
      ]);
      if (!publicStateResponse.ok || !leaderboardResponse.ok) {
        setRefreshFailed(true);
        return;
      }
      const [publicState, leaderboard] = await Promise.all([
        publicStateResponse.json(),
        leaderboardResponse.json()
      ]);
      if (!publicState?.event || !Array.isArray(publicState.markets) || !Array.isArray(leaderboard?.leaderboard)) {
        setRefreshFailed(true);
        return;
      }
      setRefreshFailed(false);
      setState((current) => ({
        ...current,
        event: publicState.event,
        markets: publicState.markets,
        leaderboard: leaderboard.leaderboard,
        leaderboardGroups: leaderboard.groups || current.leaderboardGroups
      }));
    } catch {
      setRefreshFailed(true);
      // Keep the currently rendered stage state if a transient refresh fails.
    }
  }

  useEffect(() => {
    const stopRealtime = subscribeToSupabaseRealtime(refresh);
    const timer = window.setInterval(refresh, 2500);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [state.event.slug]);

  useEffect(() => {
    if (market?.status === "resolved" && market.resolvedOutcomeId && lastResolved.current !== market.resolvedOutcomeId) {
      lastResolved.current = market.resolvedOutcomeId;
      burstConfetti();
    }
  }, [market?.resolvedOutcomeId, market?.status]);

  useEffect(() => {
    if (!signalSignature) return;
    if (lastSignalSignature.current && lastSignalSignature.current !== signalSignature && market?.status === "open") {
      setPulseKey((current) => current + 1);
    }
    lastSignalSignature.current = signalSignature;
  }, [market?.status, signalSignature]);

  const pulseClass = pulseKey > 0 ? (pulseKey % 2 === 0 ? "stage-pulse-even" : "stage-pulse-odd") : "";
  const paused = Boolean(state.event.emergencyPaused);

  if (state.event.stageMode === "join") {
    return (
      <div className="stage-grid flex min-h-[100dvh] items-center justify-center bg-white p-4 sm:p-8">
        <div className="grid w-full max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center">
          <div>
            <div className="font-expanded text-6xl font-black leading-none sm:text-8xl lg:text-9xl">vota.wtf</div>
            <p className="font-expanded mt-6 text-3xl font-black leading-tight sm:text-5xl">WTF does the room believe?</p>
            <p className="mt-4 text-xl font-bold text-muted sm:text-2xl">Scan to predict {state.event.name}.</p>
            <p className="mt-3 text-xl font-extrabold text-ember">No real-money payouts. Correct calls settle internal MegaBucks.</p>
            {paused ? (
              <div className="mt-5 rounded-2xl border border-danger bg-danger/10 p-4 text-xl font-black text-danger">
                Predictions are temporarily paused by the organizer.
              </div>
            ) : null}
          </div>
          <div className="mx-auto w-full max-w-[580px] rounded-2xl border border-line bg-white p-5 shadow-panel sm:p-8">
            <QrCode value={joinUrl} title="Join vota.wtf QR code" className="aspect-square w-full max-w-[540px] bg-white" />
            <p className="font-mono-vota mt-5 break-all text-center text-sm font-bold sm:text-lg">{joinUrl}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.event.stageMode === "leaderboard") {
    return (
      <StageFrame title="Top Oracles" subtitle="Ranked by Oracle Score, not MegaBucks purchased." paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="grid gap-3">
          {state.leaderboard.slice(0, 8).map((row, index) => (
            <div key={row.id} className="grid grid-cols-[60px_1fr_auto] items-center gap-4 rounded-2xl bg-white p-4 text-3xl font-black">
              <span className="font-mono-vota text-faded">{index + 1}</span>
              <span className="min-w-0 break-words">{row.nickname}</span>
              <span className="font-mono-vota text-right text-ember">{credits(row.oracleScore)}</span>
            </div>
          ))}
        </div>
        {state.leaderboardGroups ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <StageBoard title="Humans" rows={state.leaderboardGroups.humans.slice(0, 4)} />
            <StageBoard title="Agents" rows={state.leaderboardGroups.agents.slice(0, 4)} />
            <StageBoard title="Early callers" rows={state.leaderboardGroups.earlyCallers.slice(0, 4)} metric="earlyScore" />
            <StageBoard title="Contrarian calls" rows={state.leaderboardGroups.contrarianCalls.slice(0, 4)} metric="contrarianScore" />
          </div>
        ) : null}
      </StageFrame>
    );
  }

  if (!market) {
    return (
      <StageFrame title="No stage market selected" subtitle="Open or feature a market from the admin controls to start the live signal." paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="rounded-2xl bg-white p-6 text-2xl font-black text-muted">
          Stage market modes need a non-voided market with Show on stage enabled.
        </div>
      </StageFrame>
    );
  }

  if (market.blindLaunch.active) {
    return (
      <StageFrame title={market.title} subtitle="Blind Launch is collecting the room before revealing the split." paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="grid min-h-[50vh] place-items-center rounded-2xl bg-ink p-8 text-center text-white">
          <div>
            <div className="font-expanded text-7xl font-black sm:text-9xl">{market.blindLaunch.predictedCount}</div>
            <div className="font-expanded mt-4 text-3xl font-black sm:text-5xl">people have predicted</div>
            <div className="mt-4 text-xl font-bold text-white/70 sm:text-3xl">
              Signal unlocks in {market.blindLaunch.remainingPredictions} more predictions.
            </div>
          </div>
        </div>
      </StageFrame>
    );
  }

  if (state.event.stageMode === "humans_vs_agents") {
    return (
      <StageFrame title="Humans vs Agents" subtitle={market.title} paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="grid gap-4">
          {market.outcomes.map((outcome) => (
            <div key={outcome.id} className={`rounded-2xl bg-white p-5 ${pulseClass}`}>
              <div className="flex flex-wrap items-center justify-between gap-4 text-3xl font-black">
                <span>{outcome.label}</span>
                <span className="font-mono-vota text-ember">Humans {pct(outcome.humanSignal)}</span>
              </div>
              <div className="mt-4 grid gap-2">
                <div className="h-7 overflow-hidden rounded-full bg-soft">
                  <div className="vota-fill h-full bg-ember transition-all" style={{ width: pct(outcome.humanSignal) }} />
                </div>
                <div className="h-5 overflow-hidden rounded-full bg-soft">
                  <div className="vota-fill h-full bg-ink transition-all" style={{ width: pct(outcome.agentSignal) }} />
                </div>
              </div>
              <div className="mt-2 text-xl font-bold text-muted">
                Agents {pct(outcome.agentSignal)} | {outcome.humanCount} humans | {outcome.agentCount} agents
              </div>
            </div>
          ))}
        </div>
      </StageFrame>
    );
  }

  if (state.event.stageMode === "resolution" && market.status === "resolved") {
    const outcome = market.outcomes.find((item) => item.id === market.resolvedOutcomeId);
    const crowdRank =
      outcome
        ? [...market.outcomes].sort((a, b) => b.peopleSignal - a.peopleSignal).findIndex((item) => item.id === outcome.id) + 1
        : 0;
    return (
      <StageFrame title="The judges chose" subtitle={market.title} paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="font-expanded rounded-2xl bg-ember p-6 text-center text-5xl font-black leading-none text-white sm:p-10 sm:text-7xl">
          {outcome?.label}
        </div>
        <div className="mt-5 rounded-2xl bg-white p-5 text-2xl font-black sm:text-3xl">
          The crowd had it at {crowdRank > 0 ? `#${crowdRank}` : "no clear rank"}.
        </div>
        <h2 className="font-expanded mt-6 text-3xl font-black">Top Oracles</h2>
        <div className="mt-3 grid gap-3">
          {state.leaderboard.slice(0, 3).map((row, index) => (
            <div key={row.id} className="grid gap-2 rounded-2xl bg-white p-4 text-2xl font-black sm:grid-cols-[48px_1fr_auto] sm:text-3xl">
              <span className="font-mono-vota text-faded">{index + 1}</span>
              <span className="min-w-0 break-words">{row.nickname}</span>
              <span className="font-mono-vota text-ember">{credits(row.oracleScore)}</span>
            </div>
          ))}
        </div>
      </StageFrame>
    );
  }

  if (state.event.stageMode === "resolution") {
    return (
      <StageFrame title="Resolution not ready" subtitle={market.title} paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
        <div className="rounded-2xl bg-white p-6 text-2xl font-black text-muted">
          Lock and resolve this market before showing the resolution reveal.
        </div>
      </StageFrame>
    );
  }

  return (
    <StageFrame title={market.title} subtitle={`${market.totalParticipants} people in | ${mbucks(market.totalSignalCredits)} committed`} paused={paused} joinUrl={joinUrl} stale={refreshFailed}>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowAgentLayer((current) => !current)}
          className="focus-ring rounded-full border-[1.5px] border-ink bg-white px-5 py-3 text-sm font-black"
        >
          {showAgentLayer ? "Show People/MegaBuck Signal" : "Compare Humans/Agents"}
        </button>
      </div>
      <div className="grid gap-4">
        {market.outcomes.map((outcome) => (
          <div key={outcome.id} className={`rounded-2xl bg-white p-5 ${pulseClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-4 text-2xl font-black sm:text-3xl">
              <span className="min-w-0 break-words">{outcome.label}</span>
              <span className="font-mono-vota text-ember">{showAgentLayer ? `Humans ${pct(outcome.humanSignal)}` : `Room ${pct(outcome.stageSignal)}`}</span>
            </div>
            <div className="mt-4 grid gap-2">
              <div className="h-7 overflow-hidden rounded-full bg-soft">
                <div className="vota-fill h-full bg-ember transition-all" style={{ width: pct(showAgentLayer ? outcome.humanSignal : outcome.stageSignal) }} />
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-soft">
                <div className="vota-fill h-full bg-ink transition-all" style={{ width: pct(showAgentLayer ? outcome.agentSignal : outcome.peopleSignal) }} />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold text-muted">
              {showAgentLayer
                ? `Agents ${pct(outcome.agentSignal)} | Combined ${pct(outcome.combinedSignal)}`
                : `People ${pct(outcome.peopleSignal)} | Credit ${pct(outcome.creditSignal)}`}
            </div>
          </div>
        ))}
      </div>
      {!showAgentLayer ? <StageOddsTimeline market={market} /> : null}
    </StageFrame>
  );
}

function StageOddsTimeline({ market }: { market: PublicMarketState }) {
  const points = market.oddsHistory.slice(-80);
  if (points.length < 2) return null;
  const width = 960;
  const height = 220;
  const padX = 28;
  const padY = 18;
  const minTime = Math.min(...points.map((point) => new Date(point.at).getTime()));
  const maxTime = Math.max(...points.map((point) => new Date(point.at).getTime()));
  const span = Math.max(1, maxTime - minTime);
  const pathForOutcome = (outcomeId: string) =>
    points
      .map((point, index) => {
        const time = new Date(point.at).getTime();
        const x =
          maxTime === minTime
            ? padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2)
            : padX + ((time - minTime) / span) * (width - padX * 2);
        const value = point.outcomeSignals[outcomeId]?.stageSignal || 0;
        const y = height - padY - value * (height - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <div className="mt-5 rounded-2xl bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-expanded text-2xl font-black">Odds over time</div>
        <div className="font-mono-vota text-xs font-bold uppercase text-faded">Room Signal</div>
      </div>
      <svg className="mt-3 h-40 w-full overflow-visible rounded-xl bg-ink p-1 xl:h-48" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Odds over time">
        {[0.25, 0.5, 0.75].map((line) => (
          <line
            key={line}
            x1={padX}
            x2={width - padX}
            y1={height - padY - line * (height - padY * 2)}
            y2={height - padY - line * (height - padY * 2)}
            stroke="#ffffff"
            strokeOpacity="0.10"
            strokeWidth="1"
          />
        ))}
        {market.outcomes.map((outcome, index) => (
          <polyline
            key={outcome.id}
            fill="none"
            points={pathForOutcome(outcome.id)}
            stroke={stageChartColors[index % stageChartColors.length]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {market.outcomes.map((outcome, index) => (
          <div key={outcome.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3 text-sm font-black">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: stageChartColors[index % stageChartColors.length] }} />
              <span className="min-w-0 truncate">{outcome.label}</span>
            </span>
            <span className="font-mono-vota shrink-0 text-xs text-faded">{pct(outcome.stageSignal)} / {mbucks(outcome.signalCredits)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageBoard({
  title,
  rows,
  metric = "oracleScore"
}: {
  title: string;
  rows: Array<{ id: string; nickname: string; oracleScore: number; earlyScore?: number; contrarianScore?: number }>;
  metric?: "oracleScore" | "earlyScore" | "contrarianScore";
}) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="font-expanded text-2xl font-black">{title}</div>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? <div className="text-lg font-bold text-muted">No scored entries yet.</div> : null}
        {rows.map((row, index) => (
          <div key={`${title}-${row.id}`} className="grid grid-cols-[40px_1fr_auto] rounded-xl bg-paper p-3 text-xl font-black">
            <span className="font-mono-vota text-faded">{index + 1}</span>
            <span className="min-w-0 break-words">{row.nickname}</span>
            <span className="font-mono-vota text-right text-ember">{credits(row[metric] || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageFrame({
  title,
  subtitle,
  children,
  paused = false,
  joinUrl,
  stale = false
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  paused?: boolean;
  joinUrl?: string;
  stale?: boolean;
}) {
  return (
    <div
      className="stage-grid min-h-[100dvh] bg-white p-4 sm:p-6 xl:p-8"
      data-testid="stage-root"
      data-stale={stale ? "true" : "false"}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start xl:mb-8">
          <div>
            <h1 className="font-expanded break-words text-5xl font-black leading-none sm:text-7xl lg:text-8xl">{title}</h1>
            <p className="mt-4 break-words text-xl font-bold text-muted sm:text-2xl">{subtitle}</p>
          </div>
          {joinUrl ? <CompactStageQr joinUrl={joinUrl} /> : null}
          {paused ? (
            <div className="rounded-2xl border border-danger bg-danger/10 p-4 text-xl font-black text-danger lg:col-span-2">
              Predictions and MegaBuck top-ups are temporarily paused by the organizer.
            </div>
          ) : null}
          {stale ? (
            <div className="rounded-2xl border border-ember bg-ember/10 p-4 text-xl font-black text-ink lg:col-span-2">
              Stage data is reconnecting. Showing the last confirmed state.
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function CompactStageQr({ joinUrl }: { joinUrl: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <div className="mx-auto max-w-[360px]">
        <QrCode value={joinUrl} title="Join vota.wtf QR code" className="aspect-square w-full max-w-[360px] bg-white" />
      </div>
      <p className="font-mono-vota mt-3 break-all text-center text-xs font-black uppercase text-faded">
        Scan {joinUrl}
      </p>
    </div>
  );
}
