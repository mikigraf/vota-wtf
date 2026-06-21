import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAllowedStake,
  createMarket,
  createParticipantSession,
  createSeedStore,
  creditPaidPurchase,
  getAggregate,
  placePrediction,
  recomputeMarketAggregate,
  resolveMarket,
  transitionMarket,
  createPurchase,
  dashboardMetrics,
  leaderboardGroups,
  paymentMetrics,
  participantReceipt,
  predictionPreview,
  publicState,
  readStore,
  recordCheckoutIntent,
  roleWinnerLabel,
  updateMarket,
  updateParticipantProfile,
  upsertHouseAgents,
  userMarketState,
  writeStore,
  SEED_IDS
} from "../src/lib/store";
import { listAuditLogs } from "../src/lib/audit";
import { joinGuardHash } from "../src/lib/auth";
import { analyticsReportRows, buildAdvancedAnalyticsReport } from "../src/lib/analytics";
import {
  featureMarketData,
  initParticipantSessionData,
  placePredictionData,
  readPublicEventStoreData,
  readPublicMarketStoreData,
  updateStageControlsData
} from "../src/lib/data";
import { hasCompletedProfile, listParticipants } from "../src/lib/participants";
import { buildReceiptPromo } from "../src/lib/promo";
import { LIVESTREAM_DEMO_EVENT_SLUG, PLATFORM_PRIOR_CREDITS_PER_OUTCOME } from "../src/lib/constants";

function join(store = createSeedStore()) {
  const joined = createParticipantSession(store, "megathon-2026");
  joined.participant = updateParticipantProfile(store, joined.participant.id, {
    nickname: `builder_${joined.participant.id.slice(-4)}`,
    role: "builder",
    avatarUrl: `/uploads/avatars/${joined.participant.id}.webp`
  });
  return joined;
}

function joinEvent(store: ReturnType<typeof createSeedStore>, eventSlug: string) {
  const joined = createParticipantSession(store, eventSlug);
  joined.participant = updateParticipantProfile(store, joined.participant.id, {
    nickname: `builder_${joined.participant.id.slice(-4)}`,
    role: "builder",
    avatarUrl: `/uploads/avatars/${joined.participant.id}.webp`
  });
  return joined;
}

test("first fair-launch prediction must be exactly 100 MBucks and records 2% virtual provision", () => {
  const store = createSeedStore();
  const user = join(store);
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: user.participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.orbit,
        amountCredits: 250
      }),
    /exactly 100/
  );
  const result = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  assert.equal(result.position.rawCredits, 100);
  assert.equal(result.position.feeCredits, 2);
  assert.equal(result.position.signalCredits, 98);
  assert.equal(result.wallet.balanceCredits, 900);
  assert.equal(result.aggregate.totalPeople, 1);
  assert.equal(result.aggregate.totalSignalCredits, 98);
});

test("fair-launch participants can step up before the room fills", () => {
  const store = createSeedStore();
  const user = join(store);
  placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  const position = store.positions.find((item) => item.participantId === user.participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position to exist.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();

  const allowed = calculateAllowedStake(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit
  });
  assert.equal(allowed.allowedAdd, 100);
  assert.equal(allowed.parts.fairLaunchStepUp, 250);

  const result = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  assert.equal(result.position.rawCredits, 200);
  assert.equal(result.wallet.balanceCredits, 800);
});

test("human sessions must complete profile before predicting", () => {
  const store = createSeedStore();
  const joined = createParticipantSession(store, "megathon-2026");
  const allowed = calculateAllowedStake(store, {
    participantId: joined.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit
  });
  assert.equal(allowed.allowedAdd, 0);
  assert.match(allowed.reason, /Finish your profile/);
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: joined.participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.orbit,
        amountCredits: 100
      }),
    /Finish your profile/
  );
});

test("profile completion requires a real stage name and role but not an uploaded photo", () => {
  assert.equal(hasCompletedProfile({ nickname: "oracle", role: "other" }), false);
  assert.equal(hasCompletedProfile({ nickname: "  ", role: "builder" }), false);
  assert.equal(hasCompletedProfile({ nickname: "livestream_host", role: "other" }), true);
});

test("human profile is locked after entering the arena", () => {
  const store = createSeedStore();
  const user = join(store);
  assert.throws(
    () =>
      updateParticipantProfile(store, user.participant.id, {
        nickname: "renamed_builder",
        role: "sponsor",
        avatarUrl: "/uploads/avatars/renamed.webp"
      }),
    /locked after entering/
  );
  assert.equal(store.participants.find((item) => item.id === user.participant.id)?.role, "builder");
});

test("livestream demo seed preloads 37 callers across all outcomes", () => {
  const store = createSeedStore();
  const state = publicState(store, LIVESTREAM_DEMO_EVENT_SLUG);
  const metrics = dashboardMetrics(store, LIVESTREAM_DEMO_EVENT_SLUG);
  const market = state.markets.find((item) => item.id === SEED_IDS.markets.livestream);
  assert.ok(market);
  assert.equal(state.event.stageMode, "live");
  assert.equal(state.event.featuredMarketId, SEED_IDS.markets.livestream);
  assert.equal(metrics.totalParticipants, 37);
  assert.equal(metrics.predictionsSubmitted, 37);
  assert.equal(metrics.scanToFirstPrediction, 1);
  assert.equal(market.totalParticipants, 37);
  assert.equal(market.totalSignalCredits, 6255);
  assert.deepEqual(
    market.outcomes.map((outcome) => [outcome.label, outcome.peopleCount]),
    [
      ["AI demo lands perfectly", 14],
      ["Audience vote upset", 10],
      ["Founder cameo", 8],
      ["Live glitch recovery", 5]
    ]
  );
});

test("v8 market state separates room people credit conviction and odds history", () => {
  const store = createSeedStore();
  const state = publicState(store, LIVESTREAM_DEMO_EVENT_SLUG);
  const market = state.markets.find((item) => item.id === SEED_IDS.markets.livestream);
  if (!market) throw new Error("Expected livestream market");
  const ai = market.outcomes.find((item) => item.id === SEED_IDS.outcomes.livestreamAiDemo);
  if (!ai) throw new Error("Expected AI demo outcome");
  const aggregate = getAggregate(store, market.id);
  const weights = market.outcomes.reduce(
    (sum, outcome) => sum + Math.log1p((aggregate.outcomeCreditTotals[outcome.id] || 0) + PLATFORM_PRIOR_CREDITS_PER_OUTCOME),
    0
  );
  const expectedConviction = Math.log1p((aggregate.outcomeCreditTotals[ai.id] || 0) + PLATFORM_PRIOR_CREDITS_PER_OUTCOME) / weights;
  const expectedStage = 0.65 * ai.peopleSignal + 0.35 * expectedConviction;

  assert.equal(market.blindLaunch.active, false);
  assert.equal(market.oddsHistory.length, 38);
  assert.equal(ai.peopleSignal, 14 / 37);
  assert.equal(Math.abs(ai.convictionSignal - expectedConviction) < 0.000001, true);
  assert.equal(Math.abs(ai.stageSignal - expectedStage) < 0.000001, true);
  assert.notEqual(ai.stageSignal, ai.creditSignal);
});

test("platform signal priors keep empty public markets neutral without fake committed credits", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Neutral prior check",
    description: "Fresh markets should start neutral for the room.",
    category: "Ops",
    resolutionRule: "Organizer resolves.",
    blindLaunchEnabled: false,
    outcomes: [{ label: "Alpha" }, { label: "Beta" }, { label: "Gamma" }]
  });
  transitionMarket(store, market.id, "open");
  const publicMarket = publicState(store, "megathon-2026").markets.find((item) => item.id === market.id);
  if (!publicMarket) throw new Error("Expected public market");
  const neutralShare = 1 / publicMarket.outcomes.length;

  assert.equal(publicMarket.totalParticipants, 0);
  assert.equal(publicMarket.totalSignalCredits, 0);
  assert.equal(publicMarket.oddsHistory.length, 1);
  for (const outcome of publicMarket.outcomes) {
    assert.equal(outcome.peopleSignal, 0);
    assert.equal(outcome.peopleCount, 0);
    assert.equal(outcome.signalCredits, 0);
    assert.equal(Math.abs(outcome.creditSignal - neutralShare) < 0.000001, true);
    assert.equal(Math.abs(outcome.convictionSignal - neutralShare) < 0.000001, true);
    assert.equal(Math.abs(outcome.stageSignal - neutralShare) < 0.000001, true);
    assert.equal(Math.abs((publicMarket.oddsHistory[0]?.outcomeSignals[outcome.id]?.stageSignal || 0) - neutralShare) < 0.000001, true);
  }
});

test("public odds history is capped before it reaches clients", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Busy livestream chart",
    description: "Many participants should not create an unbounded public payload.",
    category: "Load",
    resolutionRule: "Organizer resolves.",
    showOnStage: true,
    blindLaunchEnabled: false,
    fairLaunchPeopleThreshold: 500,
    outcomes: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }]
  });
  transitionMarket(store, market.id, "open");
  const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
  for (let index = 0; index < 85; index += 1) {
    const user = join(store);
    placePrediction(store, {
      participantId: user.participant.id,
      marketId: market.id,
      outcomeId: outcomes[index % outcomes.length].id,
      amountCredits: 100
    });
  }
  const publicMarket = publicState(store, "megathon-2026").markets.find((item) => item.id === market.id);
  assert.equal(publicMarket?.oddsHistory.length, 80);
});

test("blind launch redacts public distribution until unlock", () => {
  const store = createSeedStore();
  const user = join(store);
  placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  const hiddenState = publicState(store, "megathon-2026");
  const hiddenMarket = hiddenState.markets.find((item) => item.id === SEED_IDS.markets.winner);
  const hiddenOutcome = hiddenMarket?.outcomes.find((item) => item.id === SEED_IDS.outcomes.orbit);
  assert.equal(hiddenMarket?.blindLaunch.active, true);
  assert.equal(hiddenMarket?.blindLaunch.remainingPredictions, 19);
  assert.equal(hiddenOutcome?.stageSignal, 0);
  assert.equal(hiddenMarket?.oddsHistory.length, 0);
  assert.deepEqual(hiddenState.roleWinners, {
    builder: "pure chaos",
    sponsor: "pure chaos",
    investor: "pure chaos",
    other: "pure chaos"
  });

  const market = store.markets.find((item) => item.id === SEED_IDS.markets.winner);
  if (!market) throw new Error("Expected market");
  market.blindLaunchEndedAt = new Date().toISOString();
  const revealed = publicState(store, "megathon-2026").markets.find((item) => item.id === SEED_IDS.markets.winner);
  const revealedOutcome = revealed?.outcomes.find((item) => item.id === SEED_IDS.outcomes.orbit);
  assert.equal(revealed?.blindLaunch.active, false);
  assert.equal(revealedOutcome && revealedOutcome.stageSignal > 0.65, true);
  assert.equal(revealedOutcome && revealedOutcome.stageSignal < 1, true);
  assert.equal(revealed?.oddsHistory.length, 2);
});

test("slippage preview shows before after movement and capacity block", () => {
  const store = createSeedStore();
  const user = joinEvent(store, LIVESTREAM_DEMO_EVENT_SLUG);
  const valid = predictionPreview(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.livestream,
    outcomeId: SEED_IDS.outcomes.livestreamAiDemo,
    amountCredits: 100
  });
  assert.equal(valid?.blocked, false);
  assert.equal(valid?.after.stageSignal > valid?.before.stageSignal, true);
  assert.equal(valid?.movement && valid.movement > 0, true);

  const blocked = predictionPreview(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.livestream,
    outcomeId: SEED_IDS.outcomes.livestreamAiDemo,
    amountCredits: 10_000
  });
  assert.equal(blocked?.blocked, true);
  assert.match(blocked?.reason || "", /Max allowed/);
});

test("post-fair-launch zero-MegaBuck switches do not preview impossible room movement", () => {
  const store = createSeedStore();
  const joined = join(store);
  const marketId = SEED_IDS.markets.winner;
  const currentOutcomeId = SEED_IDS.outcomes.orbit;
  const nextOutcomeId = SEED_IDS.outcomes.nova;

  placePrediction(store, {
    participantId: joined.participant.id,
    marketId,
    outcomeId: currentOutcomeId,
    amountCredits: 100
  });
  const position = store.positions.find((item) => item.participantId === joined.participant.id && item.marketId === marketId);
  assert.ok(position);
  position.lastActionAt = new Date(Date.now() - 31_000).toISOString();
  const market = store.markets.find((item) => item.id === marketId);
  if (!market) throw new Error("Expected market.");
  market.fairLaunchOverride = true;

  const preview = predictionPreview(store, {
    participantId: joined.participant.id,
    marketId,
    outcomeId: nextOutcomeId,
    amountCredits: 0
  });

  assert.equal(preview?.blocked, true);
  assert.equal(preview?.after.stageSignal, preview?.before.stageSignal);
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: joined.participant.id,
        marketId,
        outcomeId: nextOutcomeId,
        amountCredits: 0
      }),
    /cannot absorb that switch/
  );
});

test("prediction request idempotency replays the original action without spending twice", () => {
  const store = createSeedStore();
  const user = join(store);
  const requestId = "predict-double-submit-1";
  const first = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100,
    requestId
  });
  const second = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100,
    requestId
  });

  assert.equal(second.action.id, first.action.id);
  assert.equal(second.action.requestId, requestId);
  assert.equal(second.wallet.balanceCredits, 900);
  assert.equal(store.predictionActions.filter((action) => action.marketId === SEED_IDS.markets.winner).length, 1);
  assert.equal(store.ledgerEntries.filter((entry) => entry.type === "prediction_commit" && entry.marketId === SEED_IDS.markets.winner).length, 1);
  assert.equal(store.positions.find((position) => position.marketId === SEED_IDS.markets.winner)?.rawCredits, 100);
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: user.participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.nova,
        amountCredits: 100,
        requestId
      }),
    /Idempotency key/
  );
});

test("first human prediction moves the stage from QR join to live signal", () => {
  const store = createSeedStore();
  const user = join(store);
  assert.equal(store.events[0].stageMode, "join");

  placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });

  const state = publicState(store, "megathon-2026");
  assert.equal(state.event.stageMode, "live");
  assert.equal(state.event.featuredMarketId, SEED_IDS.markets.winner);
  assert.equal(store.markets.find((market) => market.id === SEED_IDS.markets.winner)?.showOnStage, true);
});

test("house agent predictions stay out of default human People Signal", () => {
  const store = createSeedStore();
  const [agent] = upsertHouseAgents(store, "megathon-2026");
  const result = placePrediction(store, {
    participantId: agent.participantId,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  const state = publicState(store, "megathon-2026");
  const market = state.markets.find((item) => item.id === SEED_IDS.markets.winner);
  const outcome = market?.outcomes.find((item) => item.id === SEED_IDS.outcomes.orbit);

  assert.equal(result.aggregate.totalPeople, 0);
  assert.equal(result.aggregate.outcomePeopleCounts[SEED_IDS.outcomes.orbit], 0);
  assert.equal(result.aggregate.agentBreakdown.agent[SEED_IDS.outcomes.orbit], 1);
  assert.equal(result.aggregate.agentBreakdown.human[SEED_IDS.outcomes.orbit], 0);
  assert.equal(store.events[0].stageMode, "join");
  assert.equal(market?.blindLaunch.active, true);
  assert.equal(outcome?.peopleSignal, 0);
  assert.equal(outcome?.humanSignal, 0);
  assert.equal(outcome?.agentSignal, 0);
  assert.equal(outcome?.combinedSignal, 0);
});

test("agent predictions stay out of default room signal and odds history", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Agent isolation market",
    description: "Agents should not move the default room signal.",
    category: "Agents",
    resolutionRule: "Organizer resolves.",
    showOnStage: true,
    blindLaunchEnabled: false,
    outcomes: [{ label: "Human room" }, { label: "Agent room" }]
  });
  transitionMarket(store, market.id, "open");
  const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
  const [agent] = upsertHouseAgents(store, "megathon-2026");

  placePrediction(store, {
    participantId: agent.participantId,
    marketId: market.id,
    outcomeId: outcomes[1].id,
    amountCredits: 100
  });

  const state = publicState(store, "megathon-2026");
  const publicMarket = state.markets.find((item) => item.id === market.id);
  const agentOutcome = publicMarket?.outcomes.find((outcome) => outcome.id === outcomes[1].id);

  assert.equal(publicMarket?.totalParticipants, 0);
  assert.equal(publicMarket?.totalSignalCredits, 0);
  assert.equal(publicMarket?.oddsHistory.length, 1);
  assert.equal(agentOutcome?.peopleSignal, 0);
  assert.equal(agentOutcome?.creditSignal, 0.5);
  assert.equal(agentOutcome?.convictionSignal, 0.5);
  assert.equal(agentOutcome?.stageSignal, 0.5);
  assert.equal(agentOutcome?.signalCredits, 0);
  assert.equal(agentOutcome?.agentSignal, 1);
  assert.equal(agentOutcome?.agentCount, 1);

  const human = join(store);
  const preview = predictionPreview(store, {
    participantId: human.participant.id,
    marketId: market.id,
    outcomeId: outcomes[0].id,
    amountCredits: 100
  });
  assert.equal(preview?.blocked, false);
  assert.equal(preview?.before.stageSignal, 0.5);
  assert.equal(preview && preview.after.stageSignal > preview.before.stageSignal, true);
  assert.equal(preview && preview.after.stageSignal < 1, true);
  assert.equal(preview?.movement, (preview?.after.stageSignal || 0) - (preview?.before.stageSignal || 0));
});

test("one active position per participant per market switches without double counting people", () => {
  const store = createSeedStore();
  const outcomes = [SEED_IDS.outcomes.orbit, SEED_IDS.outcomes.nova, SEED_IDS.outcomes.atlas, SEED_IDS.outcomes.other];
  const user = join(store);
  for (let index = 0; index < 25; index += 1) {
    const participant = index === 0 ? user : join(store);
    placePrediction(store, {
      participantId: participant.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: outcomes[index % outcomes.length],
      amountCredits: 100
    });
  }
  const position = store.positions.find((item) => item.participantId === user.participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position to exist.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 0
  });
  const aggregate = recomputeMarketAggregate(store, SEED_IDS.markets.winner);
  assert.equal(store.positions.filter((position) => position.participantId === user.participant.id && position.marketId === SEED_IDS.markets.winner).length, 1);
  assert.equal(aggregate.totalPeople, 25);
  assert.equal(aggregate.outcomePeopleCounts[SEED_IDS.outcomes.orbit], 6);
  assert.equal(aggregate.outcomePeopleCounts[SEED_IDS.outcomes.nova], 7);
  assert.equal(store.positions.find((item) => item.participantId === user.participant.id && item.marketId === SEED_IDS.markets.winner)?.outcomeId, SEED_IDS.outcomes.nova);
});

test("locked markets reject further predictions", () => {
  const store = createSeedStore();
  const user = join(store);
  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: user.participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.orbit,
        amountCredits: 100
      }),
    /not open/
  );
});

test("market lifecycle follows draft open locked resolved order", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Lifecycle order",
    description: "Verifies the MVP market lifecycle.",
    category: "Ops",
    resolutionRule: "Organizer resolves.",
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });
  const outcome = store.outcomes.find((item) => item.marketId === market.id);
  if (!outcome) throw new Error("Expected outcome.");

  transitionMarket(store, market.id, "open");
  assert.throws(
    () => resolveMarket(store, market.id, { outcomeId: outcome.id, note: "Too soon." }),
    /Only locked/
  );
  transitionMarket(store, market.id, "lock");
  assert.throws(
    () => transitionMarket(store, market.id, "open"),
    /Only draft/
  );
  resolveMarket(store, market.id, { outcomeId: outcome.id, note: "Locked then resolved." });
  assert.equal(market.status, "resolved");
});

test("market fair-launch thresholds are configurable", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Threshold market",
    description: "Verifies custom fair launch settings.",
    category: "Ops",
    resolutionRule: "Organizer resolves.",
    fairLaunchPeopleThreshold: 1,
    fairLaunchSignalCreditsThreshold: 5000,
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });
  const [yes] = store.outcomes.filter((item) => item.marketId === market.id);
  if (!yes) throw new Error("Expected outcome.");
  transitionMarket(store, market.id, "open");

  const first = join(store);
  assert.equal(calculateAllowedStake(store, {
    participantId: first.participant.id,
    marketId: market.id,
    outcomeId: yes.id
  }).fairLaunch, true);
  placePrediction(store, {
    participantId: first.participant.id,
    marketId: market.id,
    outcomeId: yes.id,
    amountCredits: 100
  });

  const second = join(store);
  assert.equal(calculateAllowedStake(store, {
    participantId: second.participant.id,
    marketId: market.id,
    outcomeId: yes.id
  }).fairLaunch, false);
});

test("markets require complete copy and at least two outcomes", () => {
  const store = createSeedStore();
  assert.throws(
    () =>
      createMarket(store, {
        eventSlug: "megathon-2026",
        title: "",
        description: "Incomplete market.",
        category: "Ops",
        resolutionRule: "Organizer resolves.",
        outcomes: [{ label: "Yes" }, { label: "No" }]
      }),
    /title/
  );
  assert.throws(
    () =>
      createMarket(store, {
        eventSlug: "megathon-2026",
        title: "Invalid outcome count",
        description: "Incomplete market.",
        category: "Ops",
        resolutionRule: "Organizer resolves.",
        outcomes: [{ label: "Only one" }]
      }),
    /two outcomes/
  );
  const draft = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Draft with invalid outcomes",
    description: "Used to verify draft outcome validation.",
    category: "Ops",
    resolutionRule: "Organizer resolves.",
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });
  assert.throws(
    () =>
      updateMarket(store, draft.id, {
        outcomes: [{ label: "Builders" }]
      }),
    /two outcomes/
  );
});

test("fair launch ends after 25 unique participants and add-ons use Whale Guard max", () => {
  const store = createSeedStore();
  const outcomes = [SEED_IDS.outcomes.orbit, SEED_IDS.outcomes.nova, SEED_IDS.outcomes.atlas, SEED_IDS.outcomes.other];
  const first = join(store);
  for (let index = 0; index < 25; index += 1) {
    const user = index === 0 ? first : join(store);
    placePrediction(store, {
      participantId: user.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: outcomes[index % outcomes.length],
      amountCredits: 100
    });
  }
  const position = store.positions.find((item) => item.participantId === first.participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position to exist.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  const allowed = calculateAllowedStake(store, {
    participantId: first.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: position.outcomeId
  });
  assert.equal(allowed.fairLaunch, false);
  assert.ok(allowed.allowedAdd > 0);
  assert.ok(allowed.allowedAdd <= 250);
});

test("Mollie-style test purchase crediting is idempotent", () => {
  const store = createSeedStore();
  const user = join(store);
  const purchase = createPurchase(store, user.participant.id);
  const first = creditPaidPurchase(store, purchase.id, "paid");
  const second = creditPaidPurchase(store, purchase.id, "paid");
  const wallet = store.wallets.find((item) => item.participantId === user.participant.id);
  assert.equal(first.credited, true);
  assert.equal(second.credited, false);
  assert.equal(wallet?.balanceCredits, 1100);
  assert.equal(store.ledgerEntries.filter((entry) => entry.purchaseId === purchase.id && entry.type === "test_checkout_credit").length, 1);
});

test("checkout button intent is counted once per participant with repeat click totals", () => {
  const store = createSeedStore();
  const user = join(store);
  const purchase = createPurchase(store, user.participant.id);
  const first = recordCheckoutIntent(store, user.participant.id);
  const second = recordCheckoutIntent(store, user.participant.id, purchase.id);
  const metrics = paymentMetrics(store, new Set([user.participant.id]));
  assert.equal(first.id, second.id);
  assert.equal(second.clickCount, 2);
  assert.equal(second.purchaseId, purchase.id);
  assert.equal(store.checkoutIntents.length, 1);
  assert.equal(metrics.intentCount, 1);
  assert.equal(metrics.intentClicks, 2);
  assert.equal(metrics.intentProjectedEur, 1);
});

test("failed or canceled test purchase status changes are audited once per transition", () => {
  const store = createSeedStore();
  const user = join(store);
  const purchase = createPurchase(store, user.participant.id);
  const failed = creditPaidPurchase(store, purchase.id, "failed", "203.0.113.44");
  const duplicateFailed = creditPaidPurchase(store, purchase.id, "failed", "203.0.113.44");

  assert.equal(failed.credited, false);
  assert.equal(duplicateFailed.credited, false);
  assert.equal(purchase.status, "failed");
  assert.equal(store.ledgerEntries.filter((entry) => entry.purchaseId === purchase.id).length, 0);
  assert.equal(store.adminAuditLogs.filter((log) => log.action === "payment_status" && log.entityId === purchase.id).length, 1);
  const failedLog = store.adminAuditLogs.find((log) => log.action === "payment_status" && log.entityId === purchase.id);
  assert.equal(failedLog?.details.previousStatus, "pending");
  assert.equal(failedLog?.details.status, "failed");
  assert.equal(failedLog?.ip, "203.0.113.44");

  creditPaidPurchase(store, purchase.id, "canceled", "203.0.113.45");
  const statusLogs = store.adminAuditLogs.filter((log) => log.action === "payment_status" && log.entityId === purchase.id);
  assert.equal(statusLogs.length, 2);
  assert.equal(statusLogs[1]?.details.previousStatus, "failed");
  assert.equal(statusLogs[1]?.details.status, "canceled");
});

test("voiding a market refunds committed MegaBucks and removes public signal", () => {
  const store = createSeedStore();
  const user = join(store);
  const secondUser = join(store);
  const prediction = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  placePrediction(store, {
    participantId: secondUser.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 100
  });
  assert.equal(prediction.wallet.balanceCredits, 900);
  assert.equal(getAggregate(store, SEED_IDS.markets.winner).totalSignalCredits, 196);

  transitionMarket(store, SEED_IDS.markets.winner, "void");
  const aggregate = getAggregate(store, SEED_IDS.markets.winner);
  const wallet = store.wallets.find((item) => item.participantId === user.participant.id);
  const position = store.positions.find((item) => item.participantId === user.participant.id && item.marketId === SEED_IDS.markets.winner);
  const voidActions = store.predictionActions.filter((action) => action.actionType === "admin_void" && action.marketId === SEED_IDS.markets.winner);
  assert.equal(wallet?.balanceCredits, 1000);
  assert.equal(wallet?.totalCommittedCredits, 0);
  assert.equal(position?.rawCredits, 0);
  assert.equal(position?.signalCredits, 0);
  assert.equal(aggregate.totalPeople, 0);
  assert.equal(aggregate.totalSignalCredits, 0);
  assert.equal(dashboardMetrics(store, "megathon-2026").virtualProvisionCredits, 0);
  assert.equal(publicState(store, "megathon-2026").markets.some((market) => market.id === SEED_IDS.markets.winner), false);
  assert.equal(voidActions.length, 2);
  assert.deepEqual(voidActions[0]?.peopleSignalSnapshot, voidActions[1]?.peopleSignalSnapshot);
  assert.deepEqual(voidActions[0]?.creditSignalSnapshot, voidActions[1]?.creditSignalSnapshot);
  assert.equal(store.ledgerEntries.filter((entry) => entry.type === "void_refund" && entry.marketId === SEED_IDS.markets.winner).length, 2);

  transitionMarket(store, SEED_IDS.markets.winner, "void");
  assert.equal(store.ledgerEntries.filter((entry) => entry.type === "void_refund" && entry.marketId === SEED_IDS.markets.winner).length, 2);
});

test("public store readers exclude voided markets before participant projection", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    const voided = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Voided public reader candidate",
      description: "Voided markets should not enter public scoped stores.",
      category: "Ops",
      resolutionRule: "Organizer voids.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    transitionMarket(store, voided.id, "open");
    transitionMarket(store, voided.id, "void");
    writeStore(store);

    const eventStore = await readPublicEventStoreData("megathon-2026");
    assert.equal(eventStore.markets.some((market) => market.id === voided.id), false);
    assert.equal(eventStore.outcomes.some((outcome) => outcome.marketId === voided.id), false);
    assert.equal(eventStore.marketAggregates.some((aggregate) => aggregate.marketId === voided.id), false);

    const marketStore = await readPublicMarketStoreData(voided.id);
    assert.equal(marketStore.markets.length, 0);
    assert.equal(marketStore.outcomes.length, 0);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("feature on stage rejects draft and voided markets", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = "/tmp/vota-feature-stage-guard.json";
  try {
    const store = createSeedStore();
    const draftMarket = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Draft stage trap",
      description: "Should not be featured while draft.",
      category: "Ops",
      resolutionRule: "Not used.",
      outcomes: [{ label: "A" }, { label: "B" }],
      showOnStage: true
    });
    transitionMarket(store, SEED_IDS.markets.winner, "void");
    writeStore(store);
    await assert.rejects(() => featureMarketData(draftMarket.id), /Only non-voided public markets/);
    await assert.rejects(() => featureMarketData(SEED_IDS.markets.winner), /Only non-voided public markets/);

    const liveStore = createSeedStore();
    const resolved = createMarket(liveStore, {
      eventSlug: "megathon-2026",
      title: "Resolved stage card",
      description: "Used to put stage into resolution mode.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    const [winningOutcome] = liveStore.outcomes.filter((outcome) => outcome.marketId === resolved.id);
    if (!winningOutcome) throw new Error("Expected winning outcome.");
    transitionMarket(liveStore, resolved.id, "open");
    transitionMarket(liveStore, resolved.id, "lock");
    resolveMarket(liveStore, resolved.id, { outcomeId: winningOutcome.id, note: "Resolved." });
    liveStore.events[0].stageMode = "live";
    writeStore(liveStore);
    const resolvedFeatured = await featureMarketData(resolved.id);
    assert.equal(resolvedFeatured.event.featuredMarketId, resolved.id);
    assert.equal(resolvedFeatured.event.stageMode, "resolution");
    const openStore = readStore();
    const openMarket = createMarket(openStore, {
      eventSlug: "megathon-2026",
      title: "Open stage card",
      description: "Feature should return stage to live mode.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      showOnStage: true,
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    transitionMarket(openStore, openMarket.id, "open");
    writeStore(openStore);
    const featured = await featureMarketData(openMarket.id);
    assert.equal(featured.event.featuredMarketId, openMarket.id);
    assert.equal(featured.event.stageMode, "live");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
  }
});

test("resolved markets cannot be voided after winner settlement", () => {
  const store = createSeedStore();
  const correct = join(store);
  placePrediction(store, {
    participantId: correct.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, {
    outcomeId: SEED_IDS.outcomes.orbit,
    note: "Official result."
  });
  assert.equal(store.wallets.find((wallet) => wallet.participantId === correct.participant.id)?.balanceCredits, 1000);
  assert.throws(() => transitionMarket(store, SEED_IDS.markets.winner, "void"), /Resolved markets cannot be voided/);
  assert.equal(store.wallets.find((wallet) => wallet.participantId === correct.participant.id)?.balanceCredits, 1000);
  assert.equal(store.ledgerEntries.filter((entry) => entry.type === "void_refund" && entry.marketId === SEED_IDS.markets.winner).length, 0);
});

test("admin market and payment actions append audit log entries", () => {
  const store = createSeedStore();
  const user = join(store);
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Audit trail market",
    description: "Tracks whether organizer actions are recorded.",
    category: "Operations",
    resolutionRule: "Organizer resolves on stage.",
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });
  transitionMarket(store, market.id, "open");
  transitionMarket(store, market.id, "lock");
  resolveMarket(store, market.id, {
    outcomeId: store.outcomes.find((outcome) => outcome.marketId === market.id)?.id || "",
    note: "Audit verification."
  });
  const voidMarket = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Void audit market",
    description: "Tracks void audit entries.",
    category: "Operations",
    resolutionRule: "Organizer may void.",
    outcomes: [{ label: "A" }, { label: "B" }]
  });
  transitionMarket(store, voidMarket.id, "void");
  const purchase = createPurchase(store, user.participant.id);
  creditPaidPurchase(store, purchase.id, "paid");

  const actions = store.adminAuditLogs.map((log) => log.action);
  assert.ok(actions.includes("create_market"));
  assert.ok(actions.includes("open_market"));
  assert.ok(actions.includes("lock_market"));
  assert.ok(actions.includes("resolve_market"));
  assert.ok(actions.includes("void_market"));
  assert.ok(actions.includes("payment_credit"));
  const paymentLog = store.adminAuditLogs.find((log) => log.action === "payment_credit" && log.entityId === purchase.id);
  assert.equal(paymentLog?.details.status, "credited");
});

test("audit filters tolerate duplicate query parameters", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Duplicate query audit market",
    description: "Tracks duplicate query handling.",
    category: "Operations",
    resolutionRule: "Organizer resolves.",
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });

  const logs = listAuditLogs(store, {
    action: ["create_market", "void_market"],
    entityType: ["market", "participant"],
    q: [market.title, "ignored"]
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.entityId, market.id);
});

test("dashboard metrics are scoped to the selected event", () => {
  const store = createSeedStore();
  store.events.push({
    id: "00000000-0000-4000-8000-000000009001",
    slug: "side-event",
    name: "Side Event",
    status: "live",
    starterCredits: 1000,
    emergencyPaused: false,
    stageMode: "join",
    createdAt: new Date().toISOString()
  });
  const sideParticipant = joinEvent(store, "side-event");
  const sideMarket = createMarket(store, {
    eventSlug: "side-event",
    title: "Side event market",
    description: "Should not affect MEGATHON dashboard metrics.",
    category: "Side",
    resolutionRule: "Side event only.",
    outcomes: [{ label: "A" }, { label: "B" }]
  });
  transitionMarket(store, sideMarket.id, "open");
  const sideOutcome = store.outcomes.find((outcome) => outcome.marketId === sideMarket.id);
  if (!sideOutcome) throw new Error("Expected side outcome.");
  placePrediction(store, {
    participantId: sideParticipant.participant.id,
    marketId: sideMarket.id,
    outcomeId: sideOutcome.id,
    amountCredits: 100
  });
  const purchase = createPurchase(store, sideParticipant.participant.id);
  creditPaidPurchase(store, purchase.id, "paid");

  const metrics = dashboardMetrics(store, "megathon-2026");
  assert.equal(metrics.totalParticipants, 0);
  assert.equal(metrics.predictionsSubmitted, 0);
  assert.equal(metrics.creditsCommitted, 0);
  assert.equal(metrics.virtualProvisionCredits, 0);
  assert.equal(metrics.testCheckouts.completed, 0);
});

test("dashboard predictions per participant counts actions while scan conversion counts people", () => {
  const store = createSeedStore();
  const outcomes = [SEED_IDS.outcomes.orbit, SEED_IDS.outcomes.nova, SEED_IDS.outcomes.atlas, SEED_IDS.outcomes.other];
  const participants = Array.from({ length: 25 }, () => join(store));
  participants.forEach((participant, index) => {
    placePrediction(store, {
      participantId: participant.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: outcomes[index % outcomes.length],
      amountCredits: 100
    });
  });
  const firstPosition = store.positions.find(
    (position) => position.participantId === participants[0].participant.id && position.marketId === SEED_IDS.markets.winner
  );
  if (!firstPosition) throw new Error("Expected first participant position.");
  firstPosition.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  placePrediction(store, {
    participantId: participants[0].participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: outcomes[0],
    amountCredits: 100
  });

  const metrics = dashboardMetrics(store, "megathon-2026");
  assert.equal(metrics.predictionsSubmitted, 26);
  assert.equal(metrics.predictionsPerParticipant, 26 / 25);
  assert.equal(metrics.scanToFirstPrediction, 1);
});

test("participant listing is scoped to event and preserves admin filters", () => {
  const store = createSeedStore();
  const defaultUser = join(store);
  defaultUser.participant.nickname = "default_builder";
  defaultUser.participant.role = "builder";
  store.events.push({
    id: "00000000-0000-4000-8000-000000009003",
    slug: "side-participants",
    name: "Side Participants",
    status: "live",
    starterCredits: 1000,
    emergencyPaused: false,
    stageMode: "join",
    createdAt: new Date().toISOString()
  });
  const sideUser = joinEvent(store, "side-participants");
  sideUser.participant.nickname = "side_builder";
  sideUser.participant.role = "builder";

  const defaultParticipants = listParticipants(store, { eventSlug: "megathon-2026", q: "builder", role: "builder" });
  const sideParticipants = listParticipants(store, { eventSlug: "side-participants", q: "builder", role: "builder" });

  assert.deepEqual(defaultParticipants.map((participant) => participant.id), [defaultUser.participant.id]);
  assert.deepEqual(sideParticipants.map((participant) => participant.id), [sideUser.participant.id]);
});

test("stage featured market respects show-on-stage visibility", () => {
  const store = createSeedStore();
  const winner = store.markets.find((market) => market.id === SEED_IDS.markets.winner);
  const demoFail = store.markets.find((market) => market.id === SEED_IDS.markets.demoFail);
  if (!winner || !demoFail) throw new Error("Expected seed markets.");
  winner.showOnStage = false;
  store.events[0].featuredMarketId = winner.id;

  const state = publicState(store, "megathon-2026");

  assert.equal(state.markets.some((market) => market.id === winner.id), true);
  assert.equal(state.event.featuredMarketId, demoFail.id);
  assert.equal(state.markets.find((market) => market.id === winner.id)?.showOnStage, false);
});

test("participants cannot predict in another event", () => {
  const store = createSeedStore();
  store.events.push({
    id: "00000000-0000-4000-8000-000000009002",
    slug: "side-event-locked",
    name: "Side Event Locked",
    status: "live",
    starterCredits: 1000,
    emergencyPaused: false,
    stageMode: "join",
    createdAt: new Date().toISOString()
  });
  const sideParticipant = joinEvent(store, "side-event-locked");

  assert.throws(
    () =>
      placePrediction(store, {
        participantId: sideParticipant.participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.orbit,
        amountCredits: 100
      }),
    /another event/
  );
  const allowed = calculateAllowedStake(store, {
    participantId: sideParticipant.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit
  });
  assert.equal(allowed.allowedAdd, 0);
  assert.match(allowed.reason, /another event/);
});

test("allowed stake rejects outcomes from another market", () => {
  const store = createSeedStore();
  const user = join(store);
  const allowed = calculateAllowedStake(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.failYes
  });
  assert.equal(allowed.allowedAdd, 0);
  assert.match(allowed.reason, /Prediction target/);
});

test("switch allowed stake includes moved signal price impact", () => {
  const store = createSeedStore();
  const outcomes = [SEED_IDS.outcomes.orbit, SEED_IDS.outcomes.nova, SEED_IDS.outcomes.atlas, SEED_IDS.outcomes.other];
  const target = join(store);
  for (let index = 0; index < 25; index += 1) {
    const participant = index === 0 ? target : join(store);
    placePrediction(store, {
      participantId: participant.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: outcomes[index % outcomes.length],
      amountCredits: 100
    });
  }
  const position = store.positions.find((item) => item.participantId === target.participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  position.rawCredits = 5000;
  position.signalCredits = 4900;
  recomputeMarketAggregate(store, SEED_IDS.markets.winner);

  const allowed = calculateAllowedStake(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    now: new Date(Date.now() + 60_000)
  });

  assert.equal(allowed.allowedAdd, 0);
  assert.match(allowed.reason, /switch/);
});

test("prediction data uses the session participant instead of client participant input", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    const real = join(store);
    const impostor = join(store);
    writeStore(store);

    const result = await placePredictionData(real.session.id, {
      participantId: impostor.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: SEED_IDS.outcomes.orbit,
      amountCredits: 100
    });

    assert.equal(result.position.participantId, real.participant.id);
    assert.notEqual(result.position.participantId, impostor.participant.id);
    assert.equal(result.user.position?.participantId, real.participant.id);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("guarded session init reuses a participant when the session cookie is cleared", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    writeStore(createSeedStore());
    const first = await initParticipantSessionData(undefined, "megathon-2026", "same-device");
    const second = await initParticipantSessionData(undefined, "megathon-2026", "same-device");
    const store = readStore();
    assert.equal(second.participant.id, first.participant.id);
    assert.equal(
      store.participants.filter((participant) => participant.eventId === first.participant.eventId && participant.participantType === "human").length,
      1
    );
    assert.equal(
      store.ledgerEntries.filter((entry) => entry.type === "starter_credit" && entry.participantId === first.participant.id).length,
      1
    );
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("join guard hash is stable across mobile IP and browser changes", async () => {
  const first = await joinGuardHash("stable-guard", "203.0.113.1", "Mobile Safari");
  const second = await joinGuardHash("stable-guard", "198.51.100.2", "Chrome Android");

  assert.equal(first, second);
});

test("guarded session init refreshes an expired session instead of duplicating the participant", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    writeStore(createSeedStore());
    const first = await initParticipantSessionData(undefined, "megathon-2026", "same-device-expired");
    const expiredStore = readStore();
    const expiredSession = expiredStore.participantSessions.find((session) => session.id === first.session.id);
    assert.ok(expiredSession);
    expiredSession.expiresAt = new Date(Date.now() - 60_000).toISOString();
    writeStore(expiredStore);

    const second = await initParticipantSessionData(undefined, "megathon-2026", "same-device-expired");
    const store = readStore();

    assert.equal(second.participant.id, first.participant.id);
    assert.equal(second.session.id, first.session.id);
    assert.equal(new Date(second.session.expiresAt).getTime() > Date.now(), true);
    assert.equal(
      store.participants.filter((participant) => participant.eventId === first.participant.eventId && participant.participantType === "human").length,
      1
    );
    assert.equal(
      store.ledgerEntries.filter((entry) => entry.type === "starter_credit" && entry.participantId === first.participant.id).length,
      1
    );
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("session init creates a new session when an existing cookie belongs to another event", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    store.events.push({
      id: "00000000-0000-4000-8000-000000009005",
      slug: "second-event",
      name: "Second Event",
      status: "live",
      starterCredits: 700,
      emergencyPaused: false,
      stageMode: "join",
      createdAt: new Date().toISOString()
    });
    writeStore(store);

    const first = await initParticipantSessionData(undefined, "megathon-2026", "device-a");
    const second = await initParticipantSessionData(first.session.id, "second-event", "device-a");

    assert.notEqual(second.session.id, first.session.id);
    assert.notEqual(second.participant.id, first.participant.id);
    assert.equal(second.session.eventId, "00000000-0000-4000-8000-000000009005");
    assert.equal(second.wallet?.balanceCredits, 700);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("stage quick controls can preserve emergency pause", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    store.events[0].emergencyPaused = true;
    writeStore(store);
    await updateStageControlsData({
      eventSlug: "megathon-2026",
      stageMode: "live",
      featuredMarketId: SEED_IDS.markets.winner
    });
    assert.equal(readStore().events[0].emergencyPaused, true);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("stage quick controls reject featured markets that are not stage-visible", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    const winner = store.markets.find((market) => market.id === SEED_IDS.markets.winner);
    if (!winner) throw new Error("Expected winner market.");
    winner.showOnStage = false;
    const draftMarket = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Draft stage candidate",
      description: "Draft markets should not be featureable.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    store.events.push({
      id: "00000000-0000-4000-8000-000000009004",
      slug: "side-stage-controls",
      name: "Side Stage Controls",
      status: "live",
      starterCredits: 1000,
      emergencyPaused: false,
      stageMode: "join",
      createdAt: new Date().toISOString()
    });
    const sideMarket = createMarket(store, {
      eventSlug: "side-stage-controls",
      title: "Side stage market",
      description: "Cross-event markets should not be featureable.",
      category: "Side",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    transitionMarket(store, sideMarket.id, "open");
    const voidedMarket = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Voided stage candidate",
      description: "Voided markets should not be featureable.",
      category: "Ops",
      resolutionRule: "Organizer voids.",
      showOnStage: true,
      outcomes: [{ label: "Hot" }, { label: "Cold" }]
    });
    transitionMarket(store, voidedMarket.id, "open");
    transitionMarket(store, voidedMarket.id, "void");
    const unresolvedMarket = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Unresolved stage candidate",
      description: "Resolution reveal should wait for resolved status.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "Alpha" }, { label: "Beta" }]
    });
    transitionMarket(store, unresolvedMarket.id, "open");
    writeStore(store);

    await assert.rejects(
      () =>
        updateStageControlsData({
          eventSlug: "megathon-2026",
          stageMode: "live",
          featuredMarketId: SEED_IDS.markets.winner
        }),
      /not available on stage/
    );
    await assert.rejects(
      () =>
        updateStageControlsData({
          eventSlug: "megathon-2026",
          stageMode: "live",
          featuredMarketId: draftMarket.id
        }),
      /not available on stage/
    );
    await assert.rejects(
      () =>
        updateStageControlsData({
          eventSlug: "megathon-2026",
          stageMode: "live",
          featuredMarketId: sideMarket.id
        }),
      /not available on stage/
    );
    await assert.rejects(
      () =>
        updateStageControlsData({
          eventSlug: "megathon-2026",
          stageMode: "live",
          featuredMarketId: voidedMarket.id
        }),
      /not available on stage/
    );
    await assert.rejects(
      () =>
        updateStageControlsData({
          eventSlug: "megathon-2026",
          stageMode: "resolution",
          featuredMarketId: unresolvedMarket.id
        }),
      /resolved stage-visible market/
    );
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("resolution stage fallback chooses a resolved stage market", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    const unresolved = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Currently featured unresolved",
      description: "Should not block the resolution reveal fallback.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    transitionMarket(store, unresolved.id, "open");
    const resolved = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Resolved fallback",
      description: "Resolution reveal should find this market.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    const [winningOutcome] = store.outcomes.filter((outcome) => outcome.marketId === resolved.id);
    if (!winningOutcome) throw new Error("Expected winning outcome.");
    transitionMarket(store, resolved.id, "open");
    transitionMarket(store, resolved.id, "lock");
    resolveMarket(store, resolved.id, { outcomeId: winningOutcome.id, note: "Resolved for stage fallback." });
    store.events[0].featuredMarketId = unresolved.id;
    writeStore(store);

    const event = await updateStageControlsData({
      eventSlug: "megathon-2026",
      stageMode: "resolution",
      featuredMarketId: unresolved.id
    });
    assert.equal(event.stageMode, "resolution");
    assert.equal(event.featuredMarketId, resolved.id);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("live stage modes never feature a resolved market", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStore = readStore();
  process.env.VOTA_DATA_BACKEND = "local";
  try {
    const store = createSeedStore();
    const resolved = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Resolved live-mode trap",
      description: "Finished markets should only appear in resolution mode.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    const [winningOutcome] = store.outcomes.filter((outcome) => outcome.marketId === resolved.id);
    if (!winningOutcome) throw new Error("Expected winning outcome.");
    transitionMarket(store, resolved.id, "open");
    transitionMarket(store, resolved.id, "lock");
    resolveMarket(store, resolved.id, { outcomeId: winningOutcome.id, note: "Resolved for live guard." });
    writeStore(store);

    const fallbackEvent = await updateStageControlsData({
      eventSlug: "megathon-2026",
      stageMode: "live",
      featuredMarketId: resolved.id
    });
    assert.equal(fallbackEvent.stageMode, "live");
    assert.equal(fallbackEvent.featuredMarketId, SEED_IDS.markets.winner);

    const current = readStore();
    current.events[0].featuredMarketId = resolved.id;
    writeStore(current);
    const event = await updateStageControlsData({
      eventSlug: "megathon-2026",
      stageMode: "role_battle"
    });
    assert.equal(event.stageMode, "role_battle");
    assert.equal(event.featuredMarketId, SEED_IDS.markets.winner);

    const fallbackOnlyStore = createSeedStore();
    for (const market of fallbackOnlyStore.markets) market.showOnStage = false;
    const active = createMarket(fallbackOnlyStore, {
      eventSlug: "megathon-2026",
      title: "Only active live candidate",
      description: "Voiding this should not fall back to a resolved market.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    transitionMarket(fallbackOnlyStore, active.id, "open");
    const resolvedFallback = createMarket(fallbackOnlyStore, {
      eventSlug: "megathon-2026",
      title: "Resolved only fallback",
      description: "Must not become a live-mode featured market.",
      category: "Ops",
      resolutionRule: "Organizer resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    const [resolvedFallbackOutcome] = fallbackOnlyStore.outcomes.filter((outcome) => outcome.marketId === resolvedFallback.id);
    if (!resolvedFallbackOutcome) throw new Error("Expected resolved fallback outcome.");
    transitionMarket(fallbackOnlyStore, resolvedFallback.id, "open");
    transitionMarket(fallbackOnlyStore, resolvedFallback.id, "lock");
    resolveMarket(fallbackOnlyStore, resolvedFallback.id, { outcomeId: resolvedFallbackOutcome.id, note: "Resolved only fallback." });
    fallbackOnlyStore.events[0].stageMode = "live";
    fallbackOnlyStore.events[0].featuredMarketId = active.id;
    transitionMarket(fallbackOnlyStore, active.id, "void");
    assert.equal(fallbackOnlyStore.events[0].stageMode, "join");
    assert.equal(fallbackOnlyStore.events[0].featuredMarketId, undefined);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    writeStore(previousStore);
  }
});

test("resolving a market scores correct positions and settles MegaBucks to winners", () => {
  const store = createSeedStore();
  const correct = join(store);
  const wrong = join(store);
  placePrediction(store, {
    participantId: correct.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  placePrediction(store, {
    participantId: wrong.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 100
  });
  assert.equal(store.wallets.find((wallet) => wallet.participantId === correct.participant.id)?.balanceCredits, 900);
  assert.equal(store.wallets.find((wallet) => wallet.participantId === wrong.participant.id)?.balanceCredits, 900);
  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, { outcomeId: SEED_IDS.outcomes.orbit, note: "Official stage announcement." });
  const correctParticipant = store.participants.find((item) => item.id === correct.participant.id);
  const wrongParticipant = store.participants.find((item) => item.id === wrong.participant.id);
  const correctWallet = store.wallets.find((wallet) => wallet.participantId === correct.participant.id);
  const wrongWallet = store.wallets.find((wallet) => wallet.participantId === wrong.participant.id);
  const settlementEntries = store.ledgerEntries.filter(
    (entry) => entry.type === "resolution_credit" && entry.marketId === SEED_IDS.markets.winner
  );
  assert.ok((correctParticipant?.oracleScore || 0) > 0);
  assert.equal(wrongParticipant?.oracleScore, 0);
  assert.equal(correctWallet?.balanceCredits, 1100);
  assert.equal(correctWallet?.totalCommittedCredits, 0);
  assert.equal(wrongWallet?.balanceCredits, 900);
  assert.equal(wrongWallet?.totalCommittedCredits, 0);
  assert.equal(settlementEntries.length, 1);
  assert.equal(settlementEntries[0]?.participantId, correct.participant.id);
  assert.equal(settlementEntries[0]?.amountCredits, 200);
  assert.equal(settlementEntries[0]?.metadata?.stakeReturned, 100);
  assert.equal(settlementEntries[0]?.metadata?.poolShare, 100);
  assert.equal(
    store.adminAuditLogs.find((entry) => entry.action === "resolve_market")?.details.settledCredits,
    200
  );
});

test("winner settlement distributes losing pool proportionally and is idempotent", () => {
  const store = createSeedStore();
  const market = createMarket(store, {
    eventSlug: "megathon-2026",
    title: "Pool settlement",
    description: "Checks proportional winner pool payout.",
    category: "Ops",
    resolutionRule: "Organizer resolves.",
    maxActionStake: 1000,
    outcomes: [{ label: "Yes" }, { label: "No" }]
  });
  const [yes, no] = store.outcomes.filter((outcome) => outcome.marketId === market.id);
  if (!yes || !no) throw new Error("Expected outcomes.");
  transitionMarket(store, market.id, "open");
  const smallWinner = join(store);
  const largeWinner = join(store);
  const loser = join(store);
  placePrediction(store, { participantId: smallWinner.participant.id, marketId: market.id, outcomeId: yes.id, amountCredits: 100 });
  placePrediction(store, { participantId: largeWinner.participant.id, marketId: market.id, outcomeId: yes.id, amountCredits: 100 });
  placePrediction(store, { participantId: loser.participant.id, marketId: market.id, outcomeId: no.id, amountCredits: 100 });
  for (const participantId of [largeWinner.participant.id, loser.participant.id, loser.participant.id]) {
    const position = store.positions.find((item) => item.participantId === participantId && item.marketId === market.id);
    if (!position) throw new Error("Expected stepped position.");
    position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
    placePrediction(store, {
      participantId,
      marketId: market.id,
      outcomeId: participantId === loser.participant.id ? no.id : yes.id,
      amountCredits: 100
    });
  }

  transitionMarket(store, market.id, "lock");
  resolveMarket(store, market.id, { outcomeId: yes.id, note: "Yes won." });
  resolveMarket(store, market.id, { outcomeId: yes.id, note: "Duplicate resolve." });

  const smallWallet = store.wallets.find((wallet) => wallet.participantId === smallWinner.participant.id);
  const largeWallet = store.wallets.find((wallet) => wallet.participantId === largeWinner.participant.id);
  const loserWallet = store.wallets.find((wallet) => wallet.participantId === loser.participant.id);
  const entries = store.ledgerEntries.filter((entry) => entry.type === "resolution_credit" && entry.marketId === market.id);
  assert.equal(smallWallet?.balanceCredits, 1100);
  assert.equal(largeWallet?.balanceCredits, 1200);
  assert.equal(loserWallet?.balanceCredits, 700);
  assert.deepEqual(entries.map((entry) => entry.amountCredits).sort((a, b) => a - b), [200, 400]);
  assert.equal(entries.length, 2);
  assert.throws(() => resolveMarket(store, market.id, { outcomeId: no.id, note: "Wrong duplicate." }), /different outcome/);
});

test("receipt links use the first scoreable correct action after a switch", () => {
  const store = createSeedStore();
  const outcomes = [SEED_IDS.outcomes.nova, SEED_IDS.outcomes.orbit, SEED_IDS.outcomes.atlas, SEED_IDS.outcomes.other];
  const target = join(store);
  const initial = placePrediction(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 100
  });
  for (let index = 1; index < 25; index += 1) {
    const participant = join(store);
    placePrediction(store, {
      participantId: participant.participant.id,
      marketId: SEED_IDS.markets.winner,
      outcomeId: outcomes[index % outcomes.length],
      amountCredits: 100
    });
  }
  const position = store.positions.find((item) => item.participantId === target.participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position to exist.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  const switched = placePrediction(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 0
  });
  const second = placePrediction(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.demoFail,
    outcomeId: SEED_IDS.outcomes.failYes,
    amountCredits: 100
  });

  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, { outcomeId: SEED_IDS.outcomes.orbit, note: "Official stage announcement." });
  transitionMarket(store, SEED_IDS.markets.demoFail, "lock");
  resolveMarket(store, SEED_IDS.markets.demoFail, { outcomeId: SEED_IDS.outcomes.failYes, note: "Official stage observation." });

  const userState = userMarketState(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.winner
  });
  const receipt = participantReceipt(store, switched.action.id, switched.action.id);
  const secondReceipt = participantReceipt(store, second.action.id, second.action.id);
  const losingActionReceipt = participantReceipt(store, initial.action.id, initial.action.id);

  assert.equal(userState.receiptId, switched.action.id);
  assert.equal(receipt?.outcome?.id, SEED_IDS.outcomes.orbit);
  assert.equal(receipt?.peopleAtCall, switched.action.peopleSignalSnapshot[SEED_IDS.outcomes.orbit] || 0);
  assert.ok(receipt?.oracleScore && receipt.oracleScore > 0);
  assert.ok(secondReceipt?.oracleScore && secondReceipt.oracleScore > 0);
  assert.equal(receipt!.participant.oracleScore, receipt!.oracleScore + secondReceipt!.oracleScore);
  assert.equal(losingActionReceipt?.market, undefined);

  target.participant.isBanned = true;
  assert.equal(participantReceipt(store, switched.action.id, switched.action.id), null);
  assert.equal(userMarketState(store, {
    participantId: target.participant.id,
    marketId: SEED_IDS.markets.winner
  }).receiptId, undefined);
});

test("advanced analytics report includes role, market, Cala, and PixVerse outputs", () => {
  const store = createSeedStore();
  const user = createParticipantSession(store, "megathon-2026");
  user.participant = updateParticipantProfile(store, user.participant.id, { nickname: "demo_builder", role: "builder" });
  const prediction = placePrediction(store, {
    participantId: user.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  const [agent] = upsertHouseAgents(store, "megathon-2026");
  placePrediction(store, {
    participantId: agent.participantId,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 100
  });
  const purchase = createPurchase(store, user.participant.id);
  creditPaidPurchase(store, purchase.id);
  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, { outcomeId: SEED_IDS.outcomes.orbit, note: "Orbit won." });

  const report = buildAdvancedAnalyticsReport(store, "megathon-2026");
  const winnerMarket = report.markets.find((market) => market.id === SEED_IDS.markets.winner);

  assert.equal(report.funnel.scanned, 1);
  assert.equal(report.funnel.predicted, 1);
  assert.equal(report.funnel.checkedOut, 1);
  assert.equal(winnerMarket?.topPeopleOutcome, "Team Orbit");
  assert.equal(winnerMarket?.humanAgentDelta, 2);
  assert.equal(report.rolePerformance.find((role) => role.role === "builder")?.leadingOutcome, "Team Orbit");
  assert.match(report.calaContextPacks[0].operatorPrompt, /Cala context/);
  assert.match(report.pixVersePromoBriefs[0].prompt, /vota\.wtf/);
  assert.ok(analyticsReportRows(report).some((row) => row.section === "market" && row.name === "Who wins MEGATHON?"));

  const promo = buildReceiptPromo(store, prediction.action.id);
  assert.equal(promo.status, "ready");
  assert.match(promo.title, /called it/);
  assert.match(promo.shareCopy, /You saw it first/);
  assert.doesNotMatch(promo.pixVersePrompt, /payout/i);
});

test("leaderboard groups expose role, early caller, and contrarian boards", () => {
  const store = createSeedStore();
  const correct = join(store);
  const wrong = join(store);
  correct.participant.role = "builder";
  wrong.participant.role = "sponsor";
  placePrediction(store, {
    participantId: correct.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  placePrediction(store, {
    participantId: wrong.participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.nova,
    amountCredits: 100
  });
  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, { outcomeId: SEED_IDS.outcomes.orbit, note: "Official stage announcement." });
  const groups = leaderboardGroups(store, "megathon-2026");
  assert.equal(groups.overall[0].id, correct.participant.id);
  assert.equal(groups.byRole.builder[0].id, correct.participant.id);
  assert.equal(groups.byRole.sponsor.length, 0);
  assert.equal(groups.humans.some((row) => row.id === correct.participant.id), true);
  assert.equal(groups.earlyCallers[0].id, correct.participant.id);
  assert.equal(groups.contrarianCalls[0].id, correct.participant.id);
  assert.ok(groups.earlyCallers[0].earlyScore > 0);
  assert.ok(groups.contrarianCalls[0].contrarianScore > 0);
});

test("role winner labels stay chaotic until a role has human signal", () => {
  const store = createSeedStore();
  recomputeMarketAggregate(store, SEED_IDS.markets.winner);
  assert.equal(roleWinnerLabel(store, SEED_IDS.markets.winner, "builder"), "pure chaos");
});

test("Sunday acceptance loop works through prediction, checkout, resolution, leaderboard, and receipt", () => {
  const store = createSeedStore();
  const joined = createParticipantSession(store, "megathon-2026");
  const participant = updateParticipantProfile(store, joined.participant.id, {
    nickname: "demo_druid",
    role: "builder",
    avatarUrl: "/uploads/avatars/demo.webp"
  });

  const prediction = placePrediction(store, {
    participantId: participant.id,
    marketId: SEED_IDS.markets.winner,
    outcomeId: SEED_IDS.outcomes.orbit,
    amountCredits: 100
  });
  assert.equal(prediction.wallet.balanceCredits, 900);
  assert.equal(prediction.aggregate.outcomePeopleCounts[SEED_IDS.outcomes.orbit], 1);
  assert.equal(store.events[0].stageMode, "live");
  assert.equal(store.events[0].featuredMarketId, SEED_IDS.markets.winner);

  for (let index = 0; index < 25; index += 1) {
    const roomParticipant = join(store);
    placePrediction(store, {
      participantId: roomParticipant.participant.id,
      marketId: SEED_IDS.markets.demoFail,
      outcomeId: SEED_IDS.outcomes.failYes,
      amountCredits: 100
    });
  }
  const customPrediction = placePrediction(store, {
    participantId: participant.id,
    marketId: SEED_IDS.markets.demoFail,
    outcomeId: SEED_IDS.outcomes.failYes,
    amountCredits: 250
  });
  assert.equal(customPrediction.action.amountCredits, 250);
  assert.equal(customPrediction.action.feeCredits, 5);
  assert.equal(customPrediction.wallet.balanceCredits, 650);
  assert.equal(store.positions.filter((item) => item.participantId === participant.id).length, 2);

  const position = store.positions.find((item) => item.participantId === participant.id && item.marketId === SEED_IDS.markets.winner);
  if (!position) throw new Error("Expected position to exist.");
  position.lastActionAt = new Date(Date.now() - 60_000).toISOString();
  assert.throws(
    () =>
      placePrediction(store, {
        participantId: participant.id,
        marketId: SEED_IDS.markets.winner,
        outcomeId: SEED_IDS.outcomes.orbit,
        amountCredits: 10_000
      }),
    /can absorb up to/
  );

  const purchase = createPurchase(store, participant.id);
  const credited = creditPaidPurchase(store, purchase.id, "paid");
  assert.equal(credited.credited, true);
  assert.equal(store.wallets.find((wallet) => wallet.participantId === participant.id)?.balanceCredits, 750);

  transitionMarket(store, SEED_IDS.markets.winner, "lock");
  resolveMarket(store, SEED_IDS.markets.winner, {
    outcomeId: SEED_IDS.outcomes.orbit,
    note: "Official stage announcement."
  });
  assert.equal(store.events[0].stageMode, "resolution");
  assert.equal(store.events[0].featuredMarketId, SEED_IDS.markets.winner);
  assert.equal(store.markets.find((market) => market.id === SEED_IDS.markets.winner)?.showOnStage, true);
  assert.equal(store.wallets.find((wallet) => wallet.participantId === participant.id)?.balanceCredits, 850);
  assert.equal(
    store.ledgerEntries.some(
      (entry) => entry.type === "resolution_credit" && entry.participantId === participant.id && entry.marketId === SEED_IDS.markets.winner
    ),
    true
  );

  const groups = leaderboardGroups(store, "megathon-2026");
  const receiptId = userMarketState(store, {
    participantId: participant.id,
    marketId: SEED_IDS.markets.winner
  }).receiptId;
  const receipt = participantReceipt(store, receiptId, receiptId || "");
  const metrics = dashboardMetrics(store, "megathon-2026");

  assert.equal(groups.overall[0]?.id, participant.id);
  assert.equal(receipt?.participant.id, participant.id);
  assert.equal(receipt?.outcome?.id, SEED_IDS.outcomes.orbit);
  assert.equal(metrics.totalParticipants, 26);
  assert.equal(metrics.predictionsSubmitted, 27);
  assert.equal(metrics.testCheckouts.completed, 1);
  assert.ok(metrics.virtualProvisionCredits >= 57);
});
