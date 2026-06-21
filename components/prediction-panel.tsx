"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, mbucks, pct } from "@/lib/utils";
import type { PredictionPreview, PublicMarketState, UserMarketState } from "@/lib/types";
import { CheckoutButton } from "@/components/checkout-button";

const chartColors = ["#FF5A1F", "#6E6E68", "#18C97B", "#F0C000", "#1f9bd1", "#6b55d7", "#FF5A5A", "#3a3a3c"];

function percentagePoints(value: number) {
  const rounded = (value * 100).toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded} pp`;
}

export function PredictionPanel({
  initialMarket,
  eventSlug,
  initialUser,
  initialEmergencyPaused = false
}: {
  initialMarket: PublicMarketState;
  eventSlug: string;
  initialUser: UserMarketState;
  initialEmergencyPaused?: boolean;
}) {
  const [market, setMarket] = useState(initialMarket);
  const [user, setUser] = useState(initialUser);
  const [emergencyPaused, setEmergencyPaused] = useState(initialEmergencyPaused);
  const [outcomeId, setOutcomeId] = useState(initialUser.position?.outcomeId || "");
  const [amount, setAmount] = useState("100");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PredictionPreview | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [showMobileCustom, setShowMobileCustom] = useState(false);
  const [showMobileAdjustPosition, setShowMobileAdjustPosition] = useState(false);
  const router = useRouter();
  const latestRefreshInput = useRef({
    marketId: initialMarket.id,
    outcomeId: initialUser.position?.outcomeId || "",
    amount: "100",
    status: initialMarket.status
  });
  const refreshSequence = useRef(0);

  useEffect(() => {
    latestRefreshInput.current = { marketId: market.id, outcomeId, amount, status: market.status };
  }, [market.id, market.status, outcomeId, amount]);

  async function refresh() {
    const sequence = refreshSequence.current + 1;
    refreshSequence.current = sequence;
    const requested = { ...latestRefreshInput.current, amount: latestRefreshInput.current.amount || "0" };

    try {
      const previewParams =
        requested.outcomeId && requested.status === "open"
          ? new URLSearchParams({ outcomeId: requested.outcomeId, amountCredits: requested.amount })
          : undefined;
      const [data, userState] = await Promise.all([
        fetch(`/api/events/${eventSlug}/public-state`, { cache: "no-store" }).then((item) => item.json()),
        fetch(`/api/markets/${requested.marketId}/predict${previewParams ? `?${previewParams.toString()}` : ""}`, { cache: "no-store" }).then((item) =>
          item.ok ? item.json() : undefined
        )
      ]);
      if (sequence !== refreshSequence.current) return;

      const next = data.markets.find((item: PublicMarketState) => item.id === requested.marketId);
      if (next) setMarket(next);
      else {
        if (latestRefreshInput.current.marketId === requested.marketId) {
          setMessage("This market is no longer available. Returning to the event.");
          router.replace(`/e/${eventSlug}`);
        }
        return;
      }
      setEmergencyPaused(Boolean(data.event?.emergencyPaused));
      if (userState?.user) setUser(userState.user);
      const latest = latestRefreshInput.current;
      if (latest.marketId === requested.marketId && latest.outcomeId === requested.outcomeId && (latest.amount || "0") === requested.amount) {
        setPreview(userState?.preview);
      }
    } catch {
      // Prediction cards keep the last known state through transient refresh errors.
    }
  }

  useEffect(() => {
    const timer = window.setInterval(refresh, 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, [eventSlug, market.id, outcomeId, amount]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(timer);
  }, [outcomeId, amount, market.id]);

  const selected = useMemo(() => market.outcomes.find((outcome) => outcome.id === outcomeId), [market, outcomeId]);
  const winningOutcome = useMemo(() => market.outcomes.find((outcome) => outcome.id === market.resolvedOutcomeId), [market.outcomes, market.resolvedOutcomeId]);
  const selectedAllowed = user.allowedByOutcome?.[outcomeId];
  const amountValue = Number(amount);
  const marketClosed = market.status !== "open";
  const userPickedWinner = Boolean(user.position && market.resolvedOutcomeId && user.position.outcomeId === market.resolvedOutcomeId);
  const isSwitch = Boolean(user.position && user.position.outcomeId !== outcomeId);
  const isZeroMegaBuckSwitch = isSwitch && amountValue === 0;
  const fairLaunchNeedsTopUp = Boolean(selectedAllowed?.fairLaunch && selectedAllowed.allowedAdd < selectedAllowed.minInitial);
  const hasOpenPosition = Boolean(market.status === "open" && user.position);
  const showMobileLockedPosition = hasOpenPosition && !showMobileAdjustPosition;
  const amountIsValid = Number.isFinite(amountValue) && Number.isInteger(amountValue) && amountValue >= 0 && (isSwitch || amountValue > 0);
  const postCooldownAllowedAdd = selectedAllowed?.postCooldownAllowedAdd ?? selectedAllowed?.allowedAdd ?? 0;
  const amountExceedsAllowed = Boolean(selectedAllowed && amountIsValid && amountValue > selectedAllowed.allowedAdd);
  const amountExceedsPostCooldown = Boolean(selectedAllowed && amountIsValid && amountValue > postCooldownAllowedAdd);
  const previewBlocksSubmit = Boolean(preview?.blocked);
  const guardBlocksSubmit = Boolean(!selectedAllowed || !amountIsValid || amountExceedsAllowed || amountExceedsPostCooldown || previewBlocksSubmit || emergencyPaused);
  const guardMessage = !selectedAllowed
    ? "Choose an outcome to see the current Whale Guard limit."
    : emergencyPaused
      ? "Predictions are paused by the organizer. Your wallet and open markets stay intact."
    : !amountIsValid
      ? "Choose a whole MegaBuck amount."
      : preview?.blocked
        ? preview.reason
      : fairLaunchNeedsTopUp
        ? `First prediction is ${mbucks(selectedAllowed?.minInitial || 100)}. Add MBucks to enter this market.`
      : isZeroMegaBuckSwitch && selectedAllowed.allowedAdd <= 0 && preview?.blocked
        ? "This market cannot absorb that switch yet."
      : selectedAllowed.cooldownRemainingSeconds > 0 && amountExceedsPostCooldown
        ? `Cooldown active. After cooldown, Whale Guard cap is ${mbucks(postCooldownAllowedAdd)}.`
      : selectedAllowed.cooldownRemainingSeconds > 0
        ? `${selectedAllowed.reason} Whale Guard cap after cooldown: ${mbucks(postCooldownAllowedAdd)}.`
      : amountExceedsAllowed
        ? preview?.reason || "This exceeds the current Whale Guard limit."
        : selectedAllowed.reason;
  const mobileGuardMessage =
    emergencyPaused || preview?.blocked || amountExceedsAllowed || amountExceedsPostCooldown || !amountIsValid
      ? guardMessage
      : selectedAllowed?.cooldownRemainingSeconds && selectedAllowed.cooldownRemainingSeconds > 0
        ? `${selectedAllowed.cooldownRemainingSeconds}s cooldown.`
        : "";
  const quickLimit = fairLaunchNeedsTopUp
    ? 0
    : selectedAllowed?.cooldownRemainingSeconds
      ? selectedAllowed.allowedAdd
      : Math.max(selectedAllowed?.allowedAdd || 0, postCooldownAllowedAdd);
  const quickAmounts = Array.from(
    new Set([100, 150, 250, quickLimit].filter((value) => Number.isFinite(value) && value > 0 && value <= quickLimit))
  );
  const walletShortfall = Boolean(fairLaunchNeedsTopUp || (user.wallet && amountIsValid && user.wallet.balanceCredits < amountValue));
  const guardLimited = Boolean(selectedAllowed && selectedAllowed.allowedAdd <= 0 && !walletShortfall);
  const showMobileSupportControls = Boolean(walletShortfall || guardLimited);
  const ticketKicker = market.status === "resolved" ? "Result" : marketClosed ? "Closed" : "Prediction";
  const ticketTitle =
    market.status === "resolved"
      ? winningOutcome?.label || "Market resolved"
      : marketClosed
        ? user.position?.outcomeLabel || "Market locked"
        : selected?.label || "Choose outcome";
  const mobileActionStatus = !outcomeId
    ? "Pick an outcome."
    : emergencyPaused
      ? "Organizer pause is on."
      : market.blindLaunch.active
        ? `${market.blindLaunch.predictedCount} in. Hidden for ${market.blindLaunch.remainingPredictions} more.`
      : preview?.blocked
        ? preview.reason
          : preview
            ? `After prediction ${pct(preview.after.stageSignal)} (${percentagePoints(preview.movement)})`
          : selectedAllowed
            ? `You can add ${mbucks(selectedAllowed.allowedAdd)} now.`
            : "Checking limit.";
  const mobileCurrentCall = user.position ? `${user.position.outcomeLabel} ${mbucks(user.position.rawCredits)}` : "No call yet";
  const submitLabel = !user.participant
    ? "Join before predicting"
    : emergencyPaused
      ? "Predictions paused"
      : !outcomeId
        ? "Choose an outcome"
        : market.status === "open"
          ? busy
            ? "Submitting..."
            : user.position
              ? isSwitch
                ? `Switch to ${selected?.label || "outcome"}`
                : `Add ${mbucks(Number.isFinite(amountValue) ? amountValue : 0)}`
              : `Submit ${mbucks(Number.isFinite(amountValue) ? amountValue : 0)}`
          : `Market ${market.status}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pred_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const response = await fetch(`/api/markets/${market.id}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
        body: JSON.stringify({ outcomeId, amountCredits: Number(amount), requestId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Prediction failed.");
      if (data.user) setUser(data.user);
      setShowMobileAdjustPosition(false);
      setShowMobileCustom(false);
      setMessage("Prediction submitted.");
      await refresh();
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Prediction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5" data-testid="prediction-panel">
      <section className="hidden sm:order-1 sm:grid sm:grid-cols-2 sm:gap-2 lg:grid-cols-1 lg:gap-3">
        {market.outcomes.map((outcome) => (
          <button
            key={outcome.id}
            data-testid={`outcome-${outcome.id}`}
            type="button"
            onClick={() => {
              if (!marketClosed) setOutcomeId(outcome.id);
            }}
            disabled={marketClosed}
            className={cn(
              "focus-ring grid min-h-[68px] grid-cols-[32px_1fr] items-center gap-2 rounded-xl border p-2 text-left transition sm:min-h-[88px] sm:grid-cols-[40px_1fr] sm:p-3 lg:min-h-24 lg:grid-cols-[56px_1fr] lg:gap-4 lg:rounded-2xl lg:p-4",
              marketClosed && "cursor-default",
              outcome.id === outcomeId ? "border-[1.5px] border-ink bg-white shadow-panel" : "border-line bg-white hover:border-ink",
              marketClosed && outcome.id !== outcomeId && "hover:border-line"
            )}
          >
            <span className="flex h-8 w-8 overflow-hidden rounded-lg bg-ink text-sm font-black text-white sm:h-10 sm:w-10 sm:rounded-xl sm:text-base lg:h-14 lg:w-14 lg:text-lg">
              {outcome.imageUrl ? (
                <img src={outcome.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">{outcome.icon || outcome.label.slice(0, 1)}</span>
              )}
            </span>
            <span className="grid gap-2">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm font-extrabold leading-tight sm:text-base">{outcome.label}</strong>
                <span className="font-mono-vota text-[9px] font-bold uppercase text-faded sm:text-xs">
                  {market.blindLaunch.active ? "Signal locked" : `${outcome.peopleCount} people`}
                </span>
              </span>
              {market.blindLaunch.active ? (
                <span className="font-mono-vota rounded-lg bg-paper p-2 text-[9px] font-bold uppercase text-muted sm:rounded-xl sm:p-3 sm:text-[10px]">
                  <span className="sm:hidden">Unlocks in {market.blindLaunch.remainingPredictions}</span>
                  <span className="hidden sm:inline">
                    {market.blindLaunch.predictedCount} people have predicted. Signal unlocks in {market.blindLaunch.remainingPredictions} more predictions.
                  </span>
                </span>
              ) : (
                <>
                  <span className="grid gap-1">
                    <span className="h-3 overflow-hidden rounded-full bg-soft">
                      <span className="vota-fill block h-full bg-ember" style={{ width: pct(outcome.stageSignal) }} />
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-soft">
                      <span className="vota-fill block h-full bg-ink" style={{ width: pct(outcome.peopleSignal) }} />
                    </span>
                  </span>
                  <span className="font-mono-vota text-[9px] font-bold uppercase text-faded lg:text-[10px]">
                    Room {pct(outcome.stageSignal)} | People {pct(outcome.peopleSignal)} | {mbucks(outcome.signalCredits)} signal
                  </span>
                </>
              )}
            </span>
          </button>
        ))}
      </section>
      <form onSubmit={submit} className="order-1 h-fit rounded-xl border border-ink bg-white p-2 shadow-panel sm:order-2 sm:rounded-2xl sm:border-line sm:p-4 lg:sticky lg:top-5 lg:p-5">
        <div className="font-mono-vota text-[10px] font-bold uppercase text-ember sm:text-xs">{ticketKicker}</div>
        <h2 className={cn("mt-1 text-lg font-extrabold sm:mt-2 sm:text-xl", marketClosed ? "block" : "hidden sm:block")}>{ticketTitle}</h2>
        <p className={cn("mt-2 hidden text-sm font-semibold leading-5 text-muted sm:block", marketClosed && "sm:hidden")}>
          Commit MegaBucks before the result is obvious. Correct calls settle MegaBucks and earn Oracle Score after resolution.
        </p>
        {marketClosed ? (
          <ClosedMarketSummary
            market={market}
            eventSlug={eventSlug}
            user={user}
            winningOutcomeLabel={winningOutcome?.label}
            userPickedWinner={userPickedWinner}
          />
        ) : (
          <>
        <div className={cn("mt-2 grid-cols-2 gap-1.5 sm:hidden", showMobileLockedPosition ? "hidden" : "grid")}>
          {market.outcomes.map((outcome) => (
            <button
              key={outcome.id}
              data-testid={`mobile-outcome-${outcome.id}`}
              type="button"
              onClick={() => setOutcomeId(outcome.id)}
              className={cn(
                "focus-ring min-h-12 rounded-lg border-[1.5px] px-2.5 py-1.5 text-left transition",
                outcome.id === outcomeId ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink"
              )}
            >
              <span className="line-clamp-2 text-xs font-black leading-tight">{outcome.label}</span>
              <span className={cn("font-mono-vota mt-1 block text-[10px] font-bold uppercase", outcome.id === outcomeId ? "text-white/70" : "text-faded")}>
                {market.blindLaunch.active ? "Hidden" : `${pct(outcome.stageSignal)} room`}
              </span>
            </button>
          ))}
        </div>
        {hasOpenPosition && showMobileAdjustPosition ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-paper p-2 sm:hidden">
            <span className="min-w-0 truncate text-xs font-extrabold">Editing current prediction</span>
            <button
              type="button"
              onClick={() => {
                setOutcomeId(user.position?.outcomeId || "");
                setShowMobileAdjustPosition(false);
                setShowMobileCustom(false);
              }}
              className="focus-ring min-h-11 shrink-0 rounded-full border-[1.5px] border-line bg-white px-3 text-xs font-black text-ink"
            >
              Cancel
            </button>
          </div>
        ) : null}
        {emergencyPaused ? (
          <div className="mt-3 hidden rounded-xl bg-danger/10 p-3 text-sm font-black text-danger sm:mt-4 sm:block">
            Organizer pause is on. Predictions and checkout actions are temporarily limited.
          </div>
        ) : null}
        {!outcomeId ? (
          <div className="mt-3 hidden rounded-xl bg-paper p-3 text-sm font-bold text-muted sm:mt-4 sm:block">
            Pick an outcome above, then choose how many MegaBucks to commit.
          </div>
        ) : market.blindLaunch.active ? (
          <div className="mt-3 hidden rounded-xl bg-ink p-3 text-sm font-bold text-white sm:mt-4 sm:block">
            {market.blindLaunch.predictedCount} people have predicted. Signal unlocks in {market.blindLaunch.remainingPredictions} more predictions.
          </div>
        ) : preview ? (
          <div className={`mt-3 hidden rounded-xl p-3 text-sm font-bold sm:mt-4 sm:block ${preview.blocked ? "bg-ember/10 text-ink" : "bg-mint/10 text-ink"}`}>
            <div className="grid gap-1 sm:hidden">
              <div className="flex justify-between gap-3">
                <span>After prediction</span>
                <span className="font-mono-vota">{pct(preview.after.stageSignal)}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span>Movement</span>
                <span className="font-mono-vota">{percentagePoints(preview.movement)}</span>
              </div>
              {preview.blocked ? <p className="text-xs font-black text-ember">{preview.reason}</p> : null}
            </div>
            <div className="hidden gap-2 sm:grid">
              <div className="flex justify-between gap-3">
                <span>Current Room Signal</span>
                <span className="font-mono-vota">{pct(preview.before.stageSignal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>After your prediction</span>
                <span className="font-mono-vota">{pct(preview.after.stageSignal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Market movement</span>
                <span className="font-mono-vota">{percentagePoints(preview.movement)}</span>
              </div>
              {preview.blocked ? <p className="text-xs font-black text-ember">{preview.reason}</p> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-3 hidden gap-2 rounded-xl bg-paper p-3 text-sm font-bold sm:mt-4 sm:grid">
          <div className="grid grid-cols-3 gap-2 sm:hidden">
            <div>
              <span className="font-mono-vota block text-[9px] uppercase text-faded">Wallet</span>
              <span className="mt-1 block truncate">{user.wallet ? mbucks(user.wallet.balanceCredits) : "Join"}</span>
            </div>
            <div>
              <span className="font-mono-vota block text-[9px] uppercase text-faded">Allowed</span>
              <span className="mt-1 block truncate">{selectedAllowed ? mbucks(selectedAllowed.allowedAdd) : "0"}</span>
            </div>
            <div>
              <span className="font-mono-vota block text-[9px] uppercase text-faded">Current</span>
              <span className="mt-1 block truncate">{user.position ? mbucks(user.position.rawCredits) : "None"}</span>
            </div>
          </div>
          <div className="hidden justify-between gap-3 sm:flex">
            <span>Wallet</span>
            <span className="font-mono-vota">{user.wallet ? mbucks(user.wallet.balanceCredits) : "Join first"}</span>
          </div>
          <div className="hidden justify-between gap-3 sm:flex">
            <span>Your current prediction</span>
            <span>{user.position ? `${user.position.outcomeLabel} (${mbucks(user.position.rawCredits)})` : "None yet"}</span>
          </div>
          <div className="hidden justify-between gap-3 sm:flex">
            <span>Allowed now</span>
            <span className="font-mono-vota">{selectedAllowed ? mbucks(selectedAllowed.allowedAdd) : "0 MBucks"}</span>
          </div>
          {selectedAllowed && selectedAllowed.cooldownRemainingSeconds > 0 ? (
            <div className="flex justify-between gap-3">
              <span>After cooldown</span>
              <span className="font-mono-vota">{mbucks(postCooldownAllowedAdd)}</span>
            </div>
          ) : null}
          {mobileGuardMessage ? <p className="text-xs font-semibold text-muted sm:hidden">{mobileGuardMessage}</p> : null}
          {guardMessage ? <p className="hidden text-xs font-semibold text-muted sm:block">{guardMessage}</p> : null}
          {user.receiptId ? (
            <a className="text-sm font-black text-ember" href={`/receipt/${user.receiptId}`}>
              Share your "I called it" receipt
            </a>
          ) : null}
        </div>
        {selectedAllowed && quickAmounts.length > 0 ? (
          <div className={cn("mt-2 grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-1.5 sm:mt-4 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(72px,1fr))] sm:gap-2", showMobileLockedPosition ? "hidden sm:grid" : "grid")}>
            {quickAmounts.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setAmount(String(quick))}
                className={cn(
                  "focus-ring min-h-11 rounded-xl border-[1.5px] text-xs font-bold hover:border-ink hover:bg-soft sm:text-sm",
                  Number(amount) === quick ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
                )}
              >
                <span className="sm:hidden">{quick}</span>
                <span className="hidden sm:inline">{quick} MBucks</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMobileCustom((value) => !value)}
              className="focus-ring min-h-11 rounded-xl border-[1.5px] border-line bg-white text-xs font-bold text-ink hover:border-ink hover:bg-soft sm:hidden"
            >
              Edit
            </button>
          </div>
        ) : null}
        <div className={cn("mt-2 rounded-xl border border-line p-2 sm:hidden", showMobileCustom ? "block" : "hidden")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold">Custom amount</span>
            <button type="button" onClick={() => setShowMobileCustom(false)} className="focus-ring rounded-full px-2 py-1 text-xs font-bold text-muted">
              Hide
            </button>
          </div>
          <label className="mt-3 grid gap-2 text-sm font-extrabold">
            MegaBucks
            <input
              data-testid="mobile-custom-amount"
              className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(event: any) => setAmount(event.target.value)}
            />
          </label>
        </div>
        <label className="mt-3 hidden gap-2 text-sm font-extrabold sm:grid">
          Custom MegaBucks
          <input
            data-testid="custom-amount"
            className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(event: any) => setAmount(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => setAmount(String(selectedAllowed?.allowedAdd || 0))}
          disabled={!selectedAllowed || selectedAllowed.allowedAdd <= 0}
          className="focus-ring mt-3 hidden min-h-11 w-full rounded-xl border-[1.5px] border-line text-sm font-bold hover:border-ink hover:bg-soft sm:block"
        >
          Max allowed now
        </button>
        {showMobileLockedPosition ? (
          <div className="mt-2 rounded-xl bg-mint/10 p-2.5 sm:hidden">
            <div className="flex items-center justify-between gap-2 text-sm font-black">
              <span className="min-w-0 truncate">Current: {user.position?.outcomeLabel}</span>
              <span className="font-mono-vota shrink-0 text-xs">{mbucks(user.position?.rawCredits || 0)}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileAdjustPosition(true)}
              className="focus-ring mt-2 min-h-11 w-full rounded-full bg-ink px-4 text-sm font-black text-white"
            >
              Edit prediction
            </button>
          </div>
        ) : null}
        <button
          data-testid="prediction-submit"
          className={cn(
            "focus-ring sticky bottom-2 z-20 mt-2 min-h-12 w-full rounded-full bg-ember px-4 text-sm font-black text-ink shadow-panel disabled:cursor-not-allowed disabled:opacity-60 sm:static sm:mt-4 sm:bg-ink sm:text-white sm:shadow-none",
            showMobileLockedPosition && "hidden sm:block"
          )}
          disabled={busy || market.status !== "open" || !outcomeId || !user.participant || guardBlocksSubmit}
        >
          {submitLabel}
        </button>
        {message ? <p className="mt-3 rounded-xl bg-paper p-3 text-sm font-bold">{message}</p> : null}
        <div className={cn("mt-2 rounded-xl px-2.5 py-2 text-xs font-bold sm:hidden", preview?.blocked ? "bg-ember/10" : "bg-paper")}>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{mobileActionStatus}</span>
            <span className="font-mono-vota shrink-0">{selectedAllowed ? `Cap ${mbucks(selectedAllowed.allowedAdd)}` : user.wallet ? mbucks(user.wallet.balanceCredits) : ""}</span>
          </div>
          <div className="font-mono-vota mt-1 flex items-center justify-between gap-2 text-[10px] uppercase text-faded">
            <span className="truncate">Wallet {user.wallet ? mbucks(user.wallet.balanceCredits) : "Join"}</span>
            <span className="truncate text-right">{mobileCurrentCall}</span>
          </div>
          {preview ? (
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-white p-2 text-center">
              <div>
                <span className="font-mono-vota block text-[9px] uppercase text-faded">Now</span>
                <span className="font-mono-vota text-[11px] font-black">{pct(preview.before.stageSignal)}</span>
              </div>
              <div>
                <span className="font-mono-vota block text-[9px] uppercase text-faded">After</span>
                <span className="font-mono-vota text-[11px] font-black">{pct(preview.after.stageSignal)}</span>
              </div>
              <div>
                <span className="font-mono-vota block text-[9px] uppercase text-faded">Move</span>
                <span className="font-mono-vota text-[11px] font-black">{percentagePoints(preview.movement)}</span>
              </div>
            </div>
          ) : null}
          {mobileGuardMessage ? <p className="mt-1 text-[11px] font-semibold text-muted">{mobileGuardMessage}</p> : null}
          {user.receiptId ? (
            <a className="mt-1 inline-flex text-xs font-black text-ember" href={`/receipt/${user.receiptId}`}>
              Share your "I called it" receipt
            </a>
          ) : null}
        </div>
        <div className={cn("mt-2 rounded-xl border border-line p-2 sm:hidden", showMobileSupportControls ? "block" : "hidden")}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold">{fairLaunchNeedsTopUp ? "Add MBucks to enter" : walletShortfall ? "Add MBucks or lower amount" : guardLimited ? "Limit reached" : "Amount help"}</span>
          </div>
          <label className="mt-3 grid gap-2 text-sm font-extrabold">
            MegaBucks
            <input
              data-testid="mobile-support-amount"
              className="focus-ring min-h-12 rounded-xl border-[1.5px] border-line px-3.5 font-semibold"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(event: any) => setAmount(event.target.value)}
            />
          </label>
          {guardLimited ? <p className="mt-3 rounded-xl bg-paper p-3 text-xs font-bold text-muted">{guardMessage}</p> : null}
          <button
            type="button"
            onClick={() => setAmount(String(selectedAllowed?.allowedAdd || 0))}
            disabled={!selectedAllowed || selectedAllowed.allowedAdd <= 0}
            className="focus-ring mt-3 min-h-11 w-full rounded-xl border-[1.5px] border-line text-sm font-bold hover:border-ink hover:bg-soft"
          >
            Max allowed now
          </button>
          {walletShortfall ? (
          <div className="mt-3">
            <p className="mb-2 text-xs font-bold leading-4 text-muted">No real charge in MEGATHON test mode. MegaBucks stay inside vota.wtf.</p>
            <CheckoutButton
              returnTo={`/m/${market.id}`}
              disabled={emergencyPaused}
              disabledReason="Organizer pause is on. MegaBuck top-ups reopen soon."
            />
          </div>
          ) : null}
        </div>
        <div className="mt-3 hidden sm:block">
          <p className="mb-2 text-sm font-semibold text-muted">No real charge in MEGATHON test mode. MegaBucks stay inside vota.wtf.</p>
          <CheckoutButton
            returnTo={`/m/${market.id}`}
            disabled={emergencyPaused}
            disabledReason="Organizer pause is on. MegaBuck top-ups reopen soon."
          />
        </div>
          </>
        )}
      </form>
      <div className="order-2 sm:hidden">
        <MobileMarketMomentum market={market} preview={preview} />
      </div>
      <div className="order-3 hidden lg:col-start-1 lg:block">
        <OddsTimeline market={market} />
      </div>
    </div>
  );
}

function MobileMarketMomentum({ market, preview }: { market: PublicMarketState; preview?: PredictionPreview }) {
  const orderedOutcomes = [...market.outcomes].sort((a, b) => b.stageSignal - a.stageSignal || b.peopleCount - a.peopleCount).slice(0, 4);
  return (
    <section className="rounded-xl border border-line bg-white p-2.5 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">Odds</div>
        <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">
          {market.blindLaunch.active ? "Hidden" : preview ? `${percentagePoints(preview.movement)} move` : `${market.totalParticipants} people`}
        </div>
      </div>
      {market.blindLaunch.active ? (
        <p className="mt-2 rounded-lg bg-paper p-2 text-xs font-bold text-muted">
          Signal is hidden for {market.blindLaunch.remainingPredictions} more predictions.
        </p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {orderedOutcomes.map((outcome, index) => (
            <div key={outcome.id} className="grid gap-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs font-black">
                <span className="line-clamp-2 leading-tight">{outcome.label}</span>
                <span className="font-mono-vota text-[10px] text-faded">{pct(outcome.stageSignal)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-soft">
                <div
                  className="vota-fill h-full rounded-full"
                  style={{ width: pct(outcome.stageSignal), backgroundColor: chartColors[index % chartColors.length] }}
                />
              </div>
            </div>
          ))}
          {preview ? (
            <div className="font-mono-vota mt-1 flex items-center justify-between gap-2 rounded-lg bg-paper px-2 py-1.5 text-[10px] font-bold uppercase text-faded">
              <span>After prediction</span>
              <span>{pct(preview.after.stageSignal)}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ClosedMarketSummary({
  market,
  eventSlug,
  user,
  winningOutcomeLabel,
  userPickedWinner
}: {
  market: PublicMarketState;
  eventSlug: string;
  user: UserMarketState;
  winningOutcomeLabel?: string;
  userPickedWinner: boolean;
}) {
  const hasPosition = Boolean(user.position);
  const resolved = market.status === "resolved";
  return (
    <div className={cn("mt-3 rounded-xl p-3 text-sm font-bold sm:mt-4", resolved ? "bg-mint/10" : "bg-paper")}>
      <div className="grid gap-2">
        {resolved ? (
          <div className="flex justify-between gap-3">
            <span>Winning outcome</span>
            <span className="text-right font-black">{winningOutcomeLabel || "Resolved"}</span>
          </div>
        ) : (
          <p className="text-ink">Predictions are locked. Watch the stage for the reveal.</p>
        )}
        {hasPosition ? (
          <>
            <div className="flex justify-between gap-3">
              <span>Your prediction</span>
              <span className="text-right font-black">
                {user.position?.outcomeLabel || "Locked"} ({mbucks(user.position?.rawCredits || 0)})
              </span>
            </div>
            {resolved ? (
              <p className={cn("rounded-lg p-2 text-xs font-black", userPickedWinner ? "bg-mint/20 text-ink" : "bg-white text-muted")}>
                {userPickedWinner
                  ? "You matched the result. Oracle Score and receipt are ready."
                  : "This prediction did not match the result. It stays in your history."}
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-lg bg-white p-2 text-xs font-semibold text-muted">
            You did not submit a prediction on this market. Pick an open market to join the next one.
          </p>
        )}
        {user.receiptId ? (
          <a data-testid="receipt-link" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm font-black text-white" href={`/receipt/${user.receiptId}`}>
            Share your receipt
          </a>
        ) : null}
        <a className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-white px-4 text-sm font-black text-ink" href={`/e/${eventSlug}`}>
          Back to live room
        </a>
      </div>
    </div>
  );
}

function OddsTimeline({ market }: { market: PublicMarketState }) {
  if (market.blindLaunch.active) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-panel">
        <div className="font-mono-vota text-xs font-bold uppercase text-faded">Odds over time</div>
        <div className="mt-3 rounded-xl bg-paper p-4 text-sm font-bold text-muted">
          Signal timeline unlocks with the room signal.
        </div>
      </div>
    );
  }
  const points = market.oddsHistory.slice(-80);
  if (points.length < 2) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-panel">
        <div className="font-mono-vota text-xs font-bold uppercase text-faded">Odds over time</div>
        <div className="mt-3 rounded-xl bg-paper p-4 text-sm font-bold text-muted">
          Timeline appears after the first prediction.
        </div>
      </div>
    );
  }
  const width = 720;
  const height = 240;
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
    <div className="rounded-2xl border border-line bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono-vota text-xs font-bold uppercase text-faded">Odds over time</div>
          <div className="text-xs font-bold text-muted">Room Signal timeline. Legend shows committed signal.</div>
        </div>
        <div className="font-mono-vota text-[10px] font-bold uppercase text-faded">{points.length} points</div>
      </div>
      <svg className="mt-4 h-64 w-full overflow-visible rounded-xl bg-ink p-1" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Odds over time">
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
            stroke={chartColors[index % chartColors.length]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4"
          />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {market.outcomes.map((outcome, index) => (
          <div key={outcome.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper p-2 text-xs font-black">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="min-w-0 truncate">{outcome.label}</span>
            </span>
            <span className="font-mono-vota shrink-0 text-[10px] text-faded">{pct(outcome.stageSignal)} / {mbucks(outcome.signalCredits)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
