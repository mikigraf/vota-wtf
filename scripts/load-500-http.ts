import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { INITIAL_STAKE_AMOUNT, STARTER_CREDITS } from "../src/lib/constants";

const PARTICIPANT_COUNT = Math.max(1, Number(process.env.LOAD_USERS || 500));
const CONCURRENCY = Math.max(1, Math.min(PARTICIPANT_COUNT, Number(process.env.LOAD_CONCURRENCY || PARTICIPANT_COUNT)));
const REPLAY_COUNT = Math.max(0, Math.floor(PARTICIPANT_COUNT * Number(process.env.LOAD_REPLAY_RATE || 0.1)));
const ORIGIN = (process.env.LOAD_ORIGIN || "https://vota.wtf").replace(/\/+$/, "");
const EVENT_SLUG = process.env.LOAD_EVENT_SLUG || "megathon-2026";
const MARKET_ID = process.env.LOAD_MARKET_ID || "c9c06077-f906-4dd5-9856-521e68b9852e";
const AMOUNT_CREDITS = Math.max(1, Number(process.env.LOAD_AMOUNT_CREDITS || INITIAL_STAKE_AMOUNT));
const RUN_ID = process.env.LOAD_RUN_ID || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type PublicOutcome = {
  id: string;
  label: string;
};

type PublicMarket = {
  id: string;
  title: string;
  status: string;
  showOnStage?: boolean;
  outcomes: PublicOutcome[];
};

type PublicState = {
  event?: {
    featuredMarketId?: string;
  };
  markets?: PublicMarket[];
};

type JourneyResult = {
  cookie?: string;
  durationMs: number;
  error?: string;
  outcomeId?: string;
  participantId?: string;
  predictMs?: number;
  requestId?: string;
  sessionId?: string;
};

type ReplayResult = {
  durationMs: number;
  error?: string;
};

function assertSafeTarget() {
  const isLocal = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(ORIGIN);
  if (isLocal) return;
  if (!MARKET_ID) {
    throw new Error("LOAD_MARKET_ID is required for deployed HTTP load runs so the script does not auto-select a live market.");
  }
}

function percentile(values: number[], pct: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

async function pool<T>(count: number, concurrency: number, worker: (index: number) => Promise<T>) {
  const results = new Array<T>();
  let cursor = 0;
  const runners = Array.from({ length: Math.min(count, concurrency) }, async () => {
    for (; ;) {
      const index = cursor;
      cursor += 1;
      if (index >= count) return;
      results[index] = await worker(index);
    }
  });
  await Promise.all(runners);
  return results;
}

function jsonHeaders(cookie?: string, extra?: Record<string, string>) {
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    ...(extra || {})
  };
}

async function readJsonResponse(response: Response, label: string) {
  const text = await response.text();
  let data: Record<string, any> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${data.error || data.raw || response.statusText}`);
  }
  return data;
}

function cookieHeader(response: Response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return [...setCookie.matchAll(/(vota_[^=]+)=([^;,\s]+)/g)]
    .map((match) => `${match[1]}=${match[2]}`)
    .join("; ");
}

async function jsonFetch(route: string, options: { body?: Record<string, unknown>; cookie?: string; headers?: Record<string, string>; method?: string } = {}) {
  const response = await fetch(`${ORIGIN}${route}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers: options.body ? jsonHeaders(options.cookie, options.headers) : options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await readJsonResponse(response, `${options.method || (options.body ? "POST" : "GET")} ${route}`);
  return { data, response };
}

async function jsonRequest(route: string, options: { body?: Record<string, unknown>; cookie?: string; headers?: Record<string, string>; method?: string } = {}) {
  const { data } = await jsonFetch(route, options);
  return data;
}

async function fetchLoadMarket() {
  const state = await jsonRequest(`/api/events/${encodeURIComponent(EVENT_SLUG)}/public-state`, {
    method: "GET",
    headers: { "cache-control": "no-cache" }
  }) as PublicState;
  const markets = Array.isArray(state.markets) ? state.markets : [];
  const market =
    markets.find((item) => MARKET_ID && item.id === MARKET_ID) ||
    markets.find((item) => item.id === state.event?.featuredMarketId && item.status === "open") ||
    markets.find((item) => item.status === "open" && item.showOnStage) ||
    markets.find((item) => item.status === "open");
  if (!market) {
    throw new Error(`No open market found for event "${EVENT_SLUG}". Set LOAD_MARKET_ID to an open disposable market.`);
  }
  const outcomeIds = (process.env.LOAD_OUTCOME_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const outcomes = outcomeIds.length > 0
    ? market.outcomes.filter((outcome) => outcomeIds.includes(outcome.id))
    : market.outcomes;
  if (outcomes.length === 0) throw new Error(`Market "${market.id}" has no matching outcomes to predict.`);
  return { market, outcomes };
}

function resultStats(values: number[]) {
  return {
    p50: Number(percentile(values, 50).toFixed(2)),
    p95: Number(percentile(values, 95).toFixed(2)),
    p99: Number(percentile(values, 99).toFixed(2))
  };
}

async function main() {
  assertSafeTarget();
  const { market, outcomes } = await fetchLoadMarket();

  async function participantJourney(index: number): Promise<JourneyResult> {
    const started = performance.now();
    try {
      const { data: initData, response: initResponse } = await jsonFetch("/api/session/init", { body: { eventSlug: EVENT_SLUG } });
      const sessionId = String(initData.sessionId || "");
      assert.ok(sessionId);
      const cookie = cookieHeader(initResponse);
      assert.match(cookie, /vota_participant_session=/);
      const suffix = String(index + 1).padStart(4, "0");
      const profileData = await jsonRequest("/api/session/profile", {
        method: "PATCH",
        cookie,
        headers: { "x-vota-participant-session": sessionId },
        body: {
          nickname: `load_${RUN_ID}_${suffix}`,
          email: `load-${RUN_ID}-${suffix}@example.test`
        }
      });
      const participantId = String(profileData.participant?.id || "");
      assert.ok(participantId);
      const outcome = outcomes[index % outcomes.length];
      const requestId = `load-${RUN_ID}-${index + 1}`;
      const predictStarted = performance.now();
      const prediction = await jsonRequest(`/api/markets/${market.id}/predict`, {
        cookie,
        headers: { "idempotency-key": requestId, "x-vota-participant-session": sessionId },
        body: {
          outcomeId: outcome.id,
          amountCredits: AMOUNT_CREDITS,
          requestId
        }
      });
      assert.equal(prediction.position?.outcomeId, outcome.id);
      assert.equal(prediction.wallet?.balanceCredits, STARTER_CREDITS - AMOUNT_CREDITS);
      return {
        cookie,
        durationMs: performance.now() - started,
        outcomeId: outcome.id,
        participantId,
        predictMs: performance.now() - predictStarted,
        requestId,
        sessionId
      };
    } catch (error) {
      return {
        durationMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const journeys = await pool(PARTICIPANT_COUNT, CONCURRENCY, participantJourney);
  const successful = journeys.filter((journey) => !journey.error && journey.cookie && journey.requestId && journey.outcomeId);
  const failed = journeys.filter((journey) => journey.error);
  const replayTargets = successful.slice(0, Math.min(REPLAY_COUNT, successful.length));
  const replays = await pool(replayTargets.length, Math.min(CONCURRENCY, Math.max(1, replayTargets.length)), async (index): Promise<ReplayResult> => {
    const started = performance.now();
    const journey = replayTargets[index];
    try {
      const replay = await jsonRequest(`/api/markets/${market.id}/predict`, {
        cookie: journey.cookie,
        headers: {
          "idempotency-key": journey.requestId || "",
          ...(journey.sessionId ? { "x-vota-participant-session": journey.sessionId } : {})
        },
        body: {
          outcomeId: journey.outcomeId,
          amountCredits: AMOUNT_CREDITS,
          requestId: journey.requestId
        }
      });
      assert.equal(replay.wallet?.balanceCredits, STARTER_CREDITS - AMOUNT_CREDITS);
      return { durationMs: performance.now() - started };
    } catch (error) {
      return {
        durationMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  const replayFailed = replays.filter((replay) => replay.error);
  const durations = successful.map((journey) => journey.durationMs);
  const predictDurations = successful.map((journey) => journey.predictMs || 0);
  const replayDurations = replays.filter((replay) => !replay.error).map((replay) => replay.durationMs);
  const summary = {
    origin: ORIGIN,
    eventSlug: EVENT_SLUG,
    marketId: market.id,
    marketTitle: market.title,
    participants: PARTICIPANT_COUNT,
    concurrency: CONCURRENCY,
    amountCredits: AMOUNT_CREDITS,
    successes: successful.length,
    failures: failed.length,
    errorRate: Number((failed.length / PARTICIPANT_COUNT).toFixed(4)),
    idempotencyReplays: replayTargets.length,
    replayFailures: replayFailed.length,
    journeyMs: resultStats(durations),
    predictMs: resultStats(predictDurations),
    replayMs: resultStats(replayDurations),
    sampleErrors: failed.slice(0, 8).map((failure) => failure.error),
    sampleReplayErrors: replayFailed.slice(0, 8).map((failure) => failure.error)
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0 || replayFailed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
