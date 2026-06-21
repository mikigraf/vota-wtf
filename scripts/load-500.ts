import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  createMarket,
  createParticipantSession,
  createSeedStore,
  getAggregate,
  placePrediction,
  resolveMarket,
  transitionMarket,
  updateParticipantProfile
} from "../src/lib/store";

const PARTICIPANT_COUNT = Number(process.env.LOAD_USERS || 500);
const REPLAY_COUNT = Math.max(1, Math.floor(PARTICIPANT_COUNT * 0.1));

function percentile(values: number[], pct: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

const store = createSeedStore();
const market = createMarket(store, {
  eventSlug: "megathon-2026",
  title: `Load gate ${PARTICIPANT_COUNT}`,
  description: "Disposable local 500-user market journey.",
  category: "Load",
  resolutionRule: "Synthetic load gate resolves outcome A.",
  maxActionStake: 250,
  outcomes: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }]
});
const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
transitionMarket(store, market.id, "open");

const durations: number[] = [];
const requestIds: string[] = [];
const participantIds: string[] = [];

for (let index = 0; index < PARTICIPANT_COUNT; index += 1) {
  const joined = createParticipantSession(store, "megathon-2026");
  const participant = updateParticipantProfile(store, joined.participant.id, {
    nickname: `load_user_${String(index + 1).padStart(3, "0")}`,
    role: index % 3 === 0 ? "builder" : index % 3 === 1 ? "sponsor" : "investor"
  });
  const outcome = outcomes[index % outcomes.length];
  const requestId = `load-${index + 1}`;
  const started = performance.now();
  const result = placePrediction(store, {
    participantId: participant.id,
    marketId: market.id,
    outcomeId: outcome.id,
    amountCredits: 100,
    requestId
  });
  durations.push(performance.now() - started);
  assert.equal(result.position.outcomeId, outcome.id);
  assert.equal(result.wallet.balanceCredits, 900);
  requestIds.push(requestId);
  participantIds.push(participant.id);
}

for (let index = 0; index < REPLAY_COUNT; index += 1) {
  const participantId = participantIds[index];
  const outcome = outcomes[index % outcomes.length];
  const replay = placePrediction(store, {
    participantId,
    marketId: market.id,
    outcomeId: outcome.id,
    amountCredits: 100,
    requestId: requestIds[index]
  });
  assert.equal(replay.wallet.balanceCredits, 900);
}

const aggregate = getAggregate(store, market.id);
assert.equal(aggregate.totalPeople, PARTICIPANT_COUNT);
assert.equal(aggregate.totalSignalCredits, PARTICIPANT_COUNT * 98);
assert.equal(store.predictionActions.filter((action) => action.marketId === market.id).length, PARTICIPANT_COUNT);

transitionMarket(store, market.id, "lock");
resolveMarket(store, market.id, { outcomeId: outcomes[0].id, note: "Synthetic load gate." });
resolveMarket(store, market.id, { outcomeId: outcomes[0].id, note: "Idempotent retry." });

const winnerIds = new Set(
  store.positions
    .filter((position) => position.marketId === market.id && position.outcomeId === outcomes[0].id)
    .map((position) => position.participantId)
);
const settlementEntries = store.ledgerEntries.filter((entry) => entry.type === "resolution_credit" && entry.marketId === market.id);
const totalRaw = store.positions
  .filter((position) => position.marketId === market.id)
  .reduce((sum, position) => sum + position.rawCredits, 0);
assert.equal(settlementEntries.length, winnerIds.size);
assert.equal(settlementEntries.reduce((sum, entry) => sum + entry.amountCredits, 0), totalRaw);

console.log(JSON.stringify({
  participants: PARTICIPANT_COUNT,
  actions: PARTICIPANT_COUNT,
  idempotencyReplays: REPLAY_COUNT,
  winners: winnerIds.size,
  settledCredits: totalRaw,
  predictionMs: {
    p95: Number(percentile(durations, 95).toFixed(2)),
    p99: Number(percentile(durations, 99).toFixed(2))
  }
}, null, 2));
