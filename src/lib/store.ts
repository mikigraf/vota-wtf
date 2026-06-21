import fs from "node:fs";
import path from "node:path";
import {
  BLIND_LAUNCH_PREDICTIONS,
  BLIND_LAUNCH_SECONDS,
  COOLDOWN_SECONDS,
  DEFAULT_EVENT_SLUG,
  FAIR_LAUNCH_PEOPLE,
  FAIR_LAUNCH_SIGNAL_CREDITS,
  INITIAL_STAKE_AMOUNT,
  LIVESTREAM_DEMO_EVENT_SLUG,
  MAX_ACTION_STAKE,
  MAX_AGENT_MARKET_SHARE,
  MAX_HUMAN_MARKET_SHARE,
  MAX_PRICE_IMPACT,
  PLATFORM_PRIOR_CREDITS_PER_OUTCOME,
  STARTER_CREDITS,
  TEST_CHECKOUT_CREDITS,
  TEST_CHECKOUT_EUR
} from "./constants";
import { hasCompletedProfile } from "./participants";
import type {
  AdminAuditLog,
  AgentProfile,
  AgentRun,
  EventRecord,
  LedgerEntry,
  LeaderboardGroups,
  LeaderboardRow,
  Market,
  MarketAggregate,
  OddsHistoryPoint,
  Outcome,
  Participant,
  ParticipantSession,
  ParticipantType,
  Position,
  PredictionAction,
  PredictionPreview,
  PublicEventState,
  PublicMarketState,
  Purchase,
  CheckoutIntent,
  Role,
  StageMode,
  Store,
  UserMarketState,
  Wallet
} from "./types";
import { clamp, isValidEmail, makeId, normalizeEmail, normalizeNickname, normalizeRole, nowIso } from "./utils";

const defaultDataDir = path.join(process.cwd(), ".data");
const defaultDataFile = path.join(defaultDataDir, "vota-dev-store.json");

function storeFilePath() {
  return process.env.VOTA_STORE_FILE ? path.resolve(process.env.VOTA_STORE_FILE) : defaultDataFile;
}

function storePaths() {
  const dataFile = storeFilePath();
  return {
    dataDir: path.dirname(dataFile),
    dataFile,
    lockFile: `${dataFile}.lock`
  };
}

const liveStageModes = new Set<StageMode>(["live", "role_battle", "humans_vs_agents"]);

function isCompatibleStageMarket(stageMode: StageMode, market: Market) {
  if (stageMode === "resolution") return market.status === "resolved";
  if (liveStageModes.has(stageMode)) return market.status !== "resolved";
  return true;
}

function findStageFallbackMarket(store: Store, event: EventRecord, excludeMarketId?: string) {
  return store.markets.find((item) =>
    item.eventId === event.id &&
    item.id !== excludeMarketId &&
    item.status !== "draft" &&
    item.status !== "voided" &&
    item.showOnStage &&
    isCompatibleStageMarket(event.stageMode, item)
  );
}

function refreshFeaturedMarketAfterRemoval(store: Store, event: EventRecord, removedMarketId: string) {
  if (event.featuredMarketId !== removedMarketId) return;
  const fallback = findStageFallbackMarket(store, event, removedMarketId);
  event.featuredMarketId = fallback?.id;
  if (!fallback && event.stageMode !== "leaderboard") event.stageMode = "join";
}

export const SEED_IDS = {
  event: "00000000-0000-4000-8000-000000000001",
  livestreamEvent: "00000000-0000-4000-8000-000000000002",
  markets: {
    winner: "00000000-0000-4000-8000-000000000101",
    demoFail: "00000000-0000-4000-8000-000000000102",
    role: "00000000-0000-4000-8000-000000000103",
    livestream: "00000000-0000-4000-8000-000000000104"
  },
  outcomes: {
    orbit: "00000000-0000-4000-8000-000000000201",
    nova: "00000000-0000-4000-8000-000000000202",
    atlas: "00000000-0000-4000-8000-000000000203",
    other: "00000000-0000-4000-8000-000000000204",
    failYes: "00000000-0000-4000-8000-000000000205",
    failNo: "00000000-0000-4000-8000-000000000206",
    roleBuilders: "00000000-0000-4000-8000-000000000207",
    roleSponsors: "00000000-0000-4000-8000-000000000208",
    roleInvestors: "00000000-0000-4000-8000-000000000209",
    roleOther: "00000000-0000-4000-8000-000000000210",
    livestreamAiDemo: "00000000-0000-4000-8000-000000000211",
    livestreamAudienceUpset: "00000000-0000-4000-8000-000000000212",
    livestreamFounderCameo: "00000000-0000-4000-8000-000000000213",
    livestreamGlitchRecovery: "00000000-0000-4000-8000-000000000214"
  }
} as const;

const MIN_SCORING_WINDOW_MS = 60_000;

function emptyRoleBreakdown(): Record<Role, Record<string, number>> {
  return {
    builder: {},
    sponsor: {},
    investor: {},
    other: {}
  };
}

function defaultAggregate(marketId: string): MarketAggregate {
  return {
    marketId,
    totalPeople: 0,
    totalSignalCredits: 0,
    outcomePeopleCounts: {},
    outcomeCreditTotals: {},
    roleBreakdown: emptyRoleBreakdown(),
    agentBreakdown: { human: {}, agent: {} },
    updatedAt: nowIso()
  };
}

function seedUuid(group: string, index: number) {
  return `10000000-0000-4000-${group}-${index.toString(16).padStart(12, "0")}`;
}

const livestreamDemoNames = [
  "signal_sam",
  "nova_nina",
  "orbit_omar",
  "atlas_ava",
  "demo_dax",
  "pixel_priya",
  "macro_mila",
  "vibe_vik",
  "build_ben",
  "sponsor_sana",
  "investor_ian",
  "chaos_chloe",
  "metric_mo",
  "camera_cleo",
  "prompt_paz",
  "stage_stef",
  "booth_bram",
  "founder_faye",
  "stream_suki",
  "latency_lars",
  "signal_sia",
  "oracle_otto",
  "meme_mara",
  "hype_hugo",
  "demo_dee",
  "risk_ravi",
  "vote_val",
  "deck_dina",
  "pitch_pip",
  "finale_finn",
  "glitch_gia",
  "reboot_remy",
  "crowd_cato",
  "alpha_ana",
  "beta_boris",
  "gamma_gwen",
  "delta_dion"
];

const livestreamDemoOutcomePlan = [
  ...Array(14).fill(SEED_IDS.outcomes.livestreamAiDemo),
  ...Array(10).fill(SEED_IDS.outcomes.livestreamAudienceUpset),
  ...Array(8).fill(SEED_IDS.outcomes.livestreamFounderCameo),
  ...Array(5).fill(SEED_IDS.outcomes.livestreamGlitchRecovery)
] as string[];

const livestreamDemoAmounts = [100, 150, 200, 250, 125, 175, 225];

function addLivestreamDemoPredictions(store: Store, createdAt: string) {
  const roles: Role[] = ["builder", "sponsor", "investor", "other"];
  livestreamDemoNames.forEach((nickname, index) => {
    const idIndex = index + 1;
    const participantId = seedUuid("8100", idIndex);
    const amountCredits = livestreamDemoAmounts[index % livestreamDemoAmounts.length];
    const feeCredits = Math.floor(amountCredits * 0.02);
    const signalCredits = amountCredits - feeCredits;
    const outcomeId = livestreamDemoOutcomePlan[index];
    store.participants.push({
      id: participantId,
      eventId: SEED_IDS.livestreamEvent,
      participantType: "human",
      nickname,
      role: roles[index % roles.length],
      isAvatarHidden: false,
      isBanned: false,
      oracleScore: 0,
      createdAt
    });
    store.wallets.push({
      participantId,
      balanceCredits: STARTER_CREDITS - amountCredits,
      totalIssuedCredits: STARTER_CREDITS,
      totalCommittedCredits: amountCredits
    });
    store.positions.push({
      id: seedUuid("8200", idIndex),
      participantId,
      marketId: SEED_IDS.markets.livestream,
      outcomeId,
      rawCredits: amountCredits,
      signalCredits,
      feeCredits,
      lastActionAt: createdAt,
      createdAt,
      updatedAt: createdAt
    });
    store.predictionActions.push({
      id: seedUuid("8300", idIndex),
      participantId,
      marketId: SEED_IDS.markets.livestream,
      outcomeId,
      requestId: `livestream-demo-${idIndex}`,
      actionType: "initial",
      amountCredits,
      signalCredits,
      feeCredits,
      peopleSignalSnapshot: {},
      creditSignalSnapshot: {},
      convictionSignalSnapshot: {},
      stageSignalSnapshot: {},
      createdAt
    });
    store.ledgerEntries.push({
      id: seedUuid("8400", idIndex),
      participantId,
      type: "starter_credit",
      amountCredits: STARTER_CREDITS,
      direction: "credit",
      balanceAfter: STARTER_CREDITS,
      reason: "Starter MegaBucks",
      createdAt
    });
    store.ledgerEntries.push({
      id: seedUuid("8500", idIndex),
      participantId,
      type: "prediction_commit",
      amountCredits: -amountCredits,
      direction: "debit",
      balanceAfter: STARTER_CREDITS - amountCredits,
      idempotencyKey: `livestream-demo-${idIndex}`,
      reason: "Committed MegaBucks to livestream demo",
      marketId: SEED_IDS.markets.livestream,
      metadata: { outcomeId },
      createdAt
    });
  });
  recomputeMarketAggregate(store, SEED_IDS.markets.livestream);
}

export function createSeedStore(): Store {
  const now = nowIso();
  const eventId = SEED_IDS.event;
  const markets: Market[] = [
    {
      id: SEED_IDS.markets.winner,
      eventId,
      title: "Who wins MEGATHON?",
      description: "Call the team the room thinks will take the final announcement.",
      category: "Finals",
      imageUrl: "/stage-gradient.svg",
      status: "open",
      resolutionRule: "Official final winner announced by the MEGATHON judges on stage.",
      showOnStage: true,
      fairLaunchOverride: false,
      fairLaunchPeopleThreshold: FAIR_LAUNCH_PEOPLE,
      fairLaunchSignalCreditsThreshold: FAIR_LAUNCH_SIGNAL_CREDITS,
      maxActionStake: MAX_ACTION_STAKE,
      allowSwitching: true,
      blindLaunchEnabled: true,
      blindLaunchPredictionThreshold: BLIND_LAUNCH_PREDICTIONS,
      blindLaunchSeconds: BLIND_LAUNCH_SECONDS,
      openedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: SEED_IDS.markets.demoFail,
      eventId,
      title: "Will a live demo fail on stage?",
      description: "Any demo that needs an emergency restart, visible fallback, or presenter apology counts.",
      category: "Chaos",
      imageUrl: "/demo-signal.svg",
      status: "open",
      resolutionRule: "Resolved by organizer observation during the final ceremony.",
      showOnStage: true,
      fairLaunchOverride: false,
      fairLaunchPeopleThreshold: FAIR_LAUNCH_PEOPLE,
      fairLaunchSignalCreditsThreshold: FAIR_LAUNCH_SIGNAL_CREDITS,
      maxActionStake: MAX_ACTION_STAKE,
      allowSwitching: true,
      blindLaunchEnabled: true,
      blindLaunchPredictionThreshold: BLIND_LAUNCH_PREDICTIONS,
      blindLaunchSeconds: BLIND_LAUNCH_SECONDS,
      openedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: SEED_IDS.markets.role,
      eventId,
      title: "Which role predicts best?",
      description: "The room calls whether Builders, Sponsors, Investors, or Other guests top Oracle Score.",
      category: "Role battle",
      imageUrl: "/role-battle.svg",
      status: "open",
      resolutionRule: "Resolved from final role leaderboard after judging.",
      showOnStage: false,
      fairLaunchOverride: false,
      fairLaunchPeopleThreshold: FAIR_LAUNCH_PEOPLE,
      fairLaunchSignalCreditsThreshold: FAIR_LAUNCH_SIGNAL_CREDITS,
      maxActionStake: MAX_ACTION_STAKE,
      allowSwitching: true,
      blindLaunchEnabled: true,
      blindLaunchPredictionThreshold: BLIND_LAUNCH_PREDICTIONS,
      blindLaunchSeconds: BLIND_LAUNCH_SECONDS,
      openedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: SEED_IDS.markets.livestream,
      eventId: SEED_IDS.livestreamEvent,
      title: "What will own the livestream chat?",
      description: "A preloaded crowd market for livestream demos, with 37 seeded callers spread across the options.",
      category: "Livestream demo",
      imageUrl: "/demo-signal.svg",
      status: "open",
      resolutionRule: "Resolved by the host after the livestream segment based on the moment that dominated chat and stage reaction.",
      showOnStage: true,
      fairLaunchOverride: true,
      fairLaunchPeopleThreshold: FAIR_LAUNCH_PEOPLE,
      fairLaunchSignalCreditsThreshold: FAIR_LAUNCH_SIGNAL_CREDITS,
      maxActionStake: MAX_ACTION_STAKE,
      allowSwitching: true,
      blindLaunchEnabled: true,
      blindLaunchPredictionThreshold: BLIND_LAUNCH_PREDICTIONS,
      blindLaunchSeconds: BLIND_LAUNCH_SECONDS,
      blindLaunchEndedAt: now,
      openedAt: now,
      createdAt: now,
      updatedAt: now
    }
  ];
  const outcomes: Outcome[] = [
    { id: SEED_IDS.outcomes.orbit, marketId: SEED_IDS.markets.winner, label: "Team Orbit", icon: "O" },
    { id: SEED_IDS.outcomes.nova, marketId: SEED_IDS.markets.winner, label: "Team Nova", icon: "N" },
    { id: SEED_IDS.outcomes.atlas, marketId: SEED_IDS.markets.winner, label: "Team Atlas", icon: "A" },
    { id: SEED_IDS.outcomes.other, marketId: SEED_IDS.markets.winner, label: "Other", icon: "?" },
    { id: SEED_IDS.outcomes.failYes, marketId: SEED_IDS.markets.demoFail, label: "Yes, chaos wins", icon: "!" },
    { id: SEED_IDS.outcomes.failNo, marketId: SEED_IDS.markets.demoFail, label: "No, clean demos", icon: "OK" },
    { id: SEED_IDS.outcomes.roleBuilders, marketId: SEED_IDS.markets.role, label: "Builders", icon: "B" },
    { id: SEED_IDS.outcomes.roleSponsors, marketId: SEED_IDS.markets.role, label: "Sponsors", icon: "S" },
    { id: SEED_IDS.outcomes.roleInvestors, marketId: SEED_IDS.markets.role, label: "Investors", icon: "I" },
    { id: SEED_IDS.outcomes.roleOther, marketId: SEED_IDS.markets.role, label: "Other", icon: "*" },
    { id: SEED_IDS.outcomes.livestreamAiDemo, marketId: SEED_IDS.markets.livestream, label: "AI demo lands perfectly", icon: "AI" },
    { id: SEED_IDS.outcomes.livestreamAudienceUpset, marketId: SEED_IDS.markets.livestream, label: "Audience vote upset", icon: "UP" },
    { id: SEED_IDS.outcomes.livestreamFounderCameo, marketId: SEED_IDS.markets.livestream, label: "Founder cameo", icon: "FC" },
    { id: SEED_IDS.outcomes.livestreamGlitchRecovery, marketId: SEED_IDS.markets.livestream, label: "Live glitch recovery", icon: "GG" }
  ];
  const events: EventRecord[] = [
    {
      id: eventId,
      slug: DEFAULT_EVENT_SLUG,
      name: "MEGATHON 2026",
      status: "live",
      starterCredits: STARTER_CREDITS,
      emergencyPaused: false,
      stageMode: "join",
      featuredMarketId: SEED_IDS.markets.winner,
      createdAt: now
    },
    {
      id: SEED_IDS.livestreamEvent,
      slug: LIVESTREAM_DEMO_EVENT_SLUG,
      name: "Livestream Demo Arena",
      status: "live",
      starterCredits: STARTER_CREDITS,
      emergencyPaused: false,
      stageMode: "live",
      featuredMarketId: SEED_IDS.markets.livestream,
      createdAt: now
    },
    {
      id: "00000000-0000-4000-8000-000000000901",
      slug: "megathon",
      name: "megathon",
      status: "live",
      starterCredits: STARTER_CREDITS,
      emergencyPaused: false,
      stageMode: "join",
      createdAt: now
    },
    {
      id: "00000000-0000-4000-8000-000000000902",
      slug: "testingmiki",
      name: "testingmiki",
      status: "live",
      starterCredits: STARTER_CREDITS,
      emergencyPaused: false,
      stageMode: "join",
      createdAt: now
    }
  ];
  const store: Store = {
    events,
    participants: [],
    participantSessions: [],
    wallets: [],
    markets,
    outcomes,
    positions: [],
    predictionActions: [],
    ledgerEntries: [],
    marketAggregates: markets.map((market) => defaultAggregate(market.id)),
    purchases: [],
    checkoutIntents: [],
    adminAuditLogs: [],
    agentProfiles: [],
    agentRuns: [],
    mcpTokens: []
  };
  addLivestreamDemoPredictions(store, now);
  return store;
}

export function readStore(): Store {
  const { dataDir, dataFile } = storePaths();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const seed = createSeedStore();
    writeStore(seed);
    return seed;
  }
  const store = JSON.parse(fs.readFileSync(dataFile, "utf8")) as Store;
  store.mcpTokens ||= [];
  store.checkoutIntents ||= [];
  for (const market of store.markets) {
    market.fairLaunchPeopleThreshold ??= FAIR_LAUNCH_PEOPLE;
    market.fairLaunchSignalCreditsThreshold ??= FAIR_LAUNCH_SIGNAL_CREDITS;
    market.blindLaunchEnabled ??= true;
    market.blindLaunchPredictionThreshold ??= BLIND_LAUNCH_PREDICTIONS;
    market.blindLaunchSeconds ??= BLIND_LAUNCH_SECONDS;
  }
  for (const action of store.predictionActions) {
    action.convictionSignalSnapshot ||= {};
    action.stageSignalSnapshot ||= {};
  }
  return store;
}

export function writeStore(store: Store) {
  const { dataDir, dataFile } = storePaths();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, dataFile);
}

export function mutateStore<T>(mutator: (store: Store) => T): T {
  const { dataDir, lockFile } = storePaths();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const start = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = fs.openSync(lockFile, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - start > 5000) throw new Error("Store is busy. Try again.");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const store = readStore();
    const result = mutator(store);
    writeStore(store);
    return result;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Lock already gone; another request will recover through timeout.
    }
  }
}

export function findEvent(store: Store, slug = DEFAULT_EVENT_SLUG) {
  return store.events.find((event) => event.slug === slug);
}

export function getEventOrThrow(store: Store, slug = DEFAULT_EVENT_SLUG) {
  const event = findEvent(store, slug);
  if (!event) throw new Error(`Unknown event: ${slug}`);
  return event;
}

export function getSessionParticipant(store: Store, sessionId?: string) {
  if (!sessionId) return null;
  const session = store.participantSessions.find((item) => item.id === sessionId);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const participant = store.participants.find((item) => item.id === session.participantId);
  if (!participant) return null;
  const wallet = store.wallets.find((item) => item.participantId === participant.id);
  return { session, participant, wallet };
}

export function getSessionParticipantByGuard(store: Store, eventId: string, guardKeyHash?: string) {
  if (!guardKeyHash) return null;
  const session = store.participantSessions
    .filter((item) => item.eventId === eventId && item.guardKeyHash === guardKeyHash)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (session && new Date(session.expiresAt).getTime() < Date.now()) {
    session.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  }
  return getSessionParticipant(store, session?.id);
}

export function createParticipantSession(store: Store, eventSlug = DEFAULT_EVENT_SLUG, guardKeyHash?: string) {
  const event = getEventOrThrow(store, eventSlug);
  const participantId = makeId("par");
  const sessionId = makeId("ses");
  const now = nowIso();
  const participant: Participant = {
    id: participantId,
    eventId: event.id,
    participantType: "human",
    nickname: normalizeNickname("oracle"),
    role: "other",
    isAvatarHidden: false,
    isBanned: false,
    oracleScore: 0,
    createdAt: now
  };
  const wallet: Wallet = {
    participantId,
    balanceCredits: event.starterCredits,
    totalIssuedCredits: event.starterCredits,
    totalCommittedCredits: 0
  };
  const session: ParticipantSession = {
    id: sessionId,
    participantId,
    eventId: event.id,
    guardKeyHash,
    createdAt: now,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  };
  const ledger: LedgerEntry = {
    id: makeId("led"),
    participantId,
    type: "starter_credit",
    amountCredits: event.starterCredits,
    direction: "credit",
    balanceAfter: event.starterCredits,
    reason: "Starter MegaBucks for joining MEGATHON",
    createdAt: now
  };
  store.participants.push(participant);
  store.wallets.push(wallet);
  store.participantSessions.push(session);
  store.ledgerEntries.push(ledger);
  return { session, participant, wallet };
}

export function updateParticipantProfile(
  store: Store,
  participantId: string,
  input: { nickname: string; email?: string; role?: string; avatarUrl?: string }
) {
  const participant = store.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error("Participant not found");
  if (participant.participantType === "human" && hasCompletedProfile(participant)) {
    throw new Error("Profile is locked after entering the arena.");
  }
  const nickname = normalizeNickname(input.nickname);
  const email = normalizeEmail(input.email || "");
  if (!nickname || nickname === "oracle") throw new Error("Enter a stage name before joining.");
  if (!isValidEmail(email)) throw new Error("Enter your email address before joining.");
  const duplicate = store.participants.find(
    (item) =>
      item.id !== participant.id &&
      item.eventId === participant.eventId &&
      item.participantType === "human" &&
      item.nickname.trim().toLowerCase() === nickname.toLowerCase()
  );
  if (duplicate) throw new Error("That stage name is already taken.");
  const previousRole = participant.role;
  participant.nickname = nickname;
  participant.email = email;
  participant.role = normalizeRole(input.role || "other");
  if (input.avatarUrl) participant.avatarUrl = input.avatarUrl;
  if (previousRole !== participant.role) {
    const marketIds = new Set(
      store.positions.filter((position) => position.participantId === participant.id).map((position) => position.marketId)
    );
    for (const marketId of marketIds) recomputeMarketAggregate(store, marketId);
  }
  return participant;
}

export function outcomesForMarket(store: Store, marketId: string) {
  return store.outcomes.filter((outcome) => outcome.marketId === marketId);
}

export function recomputeMarketAggregate(store: Store, marketId: string) {
  const aggregate = defaultAggregate(marketId);
  for (const outcome of outcomesForMarket(store, marketId)) {
    aggregate.outcomePeopleCounts[outcome.id] = 0;
    aggregate.outcomeCreditTotals[outcome.id] = 0;
    aggregate.agentBreakdown.human[outcome.id] = 0;
    aggregate.agentBreakdown.agent[outcome.id] = 0;
    for (const role of Object.keys(aggregate.roleBreakdown) as Role[]) {
      aggregate.roleBreakdown[role][outcome.id] = 0;
    }
  }
  const positions = store.positions.filter((position) => position.marketId === marketId && position.signalCredits > 0);
  for (const position of positions) {
    const participant = store.participants.find((item) => item.id === position.participantId);
    if (!participant || participant.isBanned) continue;
    const isHuman = participant.participantType === "human";
    if (isHuman) aggregate.totalPeople += 1;
    aggregate.totalSignalCredits += position.signalCredits;
    if (isHuman) {
      aggregate.outcomePeopleCounts[position.outcomeId] = (aggregate.outcomePeopleCounts[position.outcomeId] || 0) + 1;
      aggregate.roleBreakdown[participant.role][position.outcomeId] =
        (aggregate.roleBreakdown[participant.role][position.outcomeId] || 0) + 1;
    }
    aggregate.outcomeCreditTotals[position.outcomeId] =
      (aggregate.outcomeCreditTotals[position.outcomeId] || 0) + position.signalCredits;
    const key = isHuman ? "human" : "agent";
    aggregate.agentBreakdown[key][position.outcomeId] = (aggregate.agentBreakdown[key][position.outcomeId] || 0) + 1;
  }
  const existingIndex = store.marketAggregates.findIndex((item) => item.marketId === marketId);
  if (existingIndex >= 0) store.marketAggregates[existingIndex] = aggregate;
  else store.marketAggregates.push(aggregate);
  return aggregate;
}

export function getAggregate(store: Store, marketId: string) {
  return store.marketAggregates.find((item) => item.marketId === marketId) || recomputeMarketAggregate(store, marketId);
}

function participantScopedAggregate(
  store: Store,
  marketId: string,
  includeParticipant: (participant: Participant) => boolean
) {
  const aggregate = defaultAggregate(marketId);
  for (const outcome of outcomesForMarket(store, marketId)) {
    aggregate.outcomePeopleCounts[outcome.id] = 0;
    aggregate.outcomeCreditTotals[outcome.id] = 0;
    aggregate.agentBreakdown.human[outcome.id] = 0;
    aggregate.agentBreakdown.agent[outcome.id] = 0;
    for (const role of Object.keys(aggregate.roleBreakdown) as Role[]) {
      aggregate.roleBreakdown[role][outcome.id] = 0;
    }
  }
  for (const position of store.positions.filter((item) => item.marketId === marketId && item.signalCredits > 0)) {
    const participant = store.participants.find((item) => item.id === position.participantId);
    if (!participant || participant.isBanned || !includeParticipant(participant)) continue;
    const isHuman = participant.participantType === "human";
    if (isHuman) {
      aggregate.totalPeople += 1;
      aggregate.outcomePeopleCounts[position.outcomeId] = (aggregate.outcomePeopleCounts[position.outcomeId] || 0) + 1;
      aggregate.roleBreakdown[participant.role][position.outcomeId] =
        (aggregate.roleBreakdown[participant.role][position.outcomeId] || 0) + 1;
    }
    aggregate.totalSignalCredits += position.signalCredits;
    aggregate.outcomeCreditTotals[position.outcomeId] =
      (aggregate.outcomeCreditTotals[position.outcomeId] || 0) + position.signalCredits;
    const key = isHuman ? "human" : "agent";
    aggregate.agentBreakdown[key][position.outcomeId] = (aggregate.agentBreakdown[key][position.outcomeId] || 0) + 1;
  }
  return aggregate;
}

function humanMarketAggregate(store: Store, marketId: string) {
  return participantScopedAggregate(store, marketId, (participant) => participant.participantType === "human");
}

interface MarketSignalSnapshot {
  people: Record<string, number>;
  credit: Record<string, number>;
  conviction: Record<string, number>;
  stage: Record<string, number>;
}

function signalSnapshotFromTotals(
  outcomes: Outcome[],
  input: {
    totalPeople: number;
    totalSignalCredits: number;
    outcomePeopleCounts: Record<string, number>;
    outcomeCreditTotals: Record<string, number>;
  }
): MarketSignalSnapshot {
  const people: Record<string, number> = {};
  const credit: Record<string, number> = {};
  const conviction: Record<string, number> = {};
  const stage: Record<string, number> = {};
  const neutralShare = outcomes.length > 0 ? 1 / outcomes.length : 0;
  const priorCredits = PLATFORM_PRIOR_CREDITS_PER_OUTCOME;
  const totalCreditsWithPrior = input.totalSignalCredits + priorCredits * outcomes.length;
  const weights = outcomes.reduce<Record<string, number>>((acc, outcome) => {
    acc[outcome.id] = Math.log1p(Math.max(0, input.outcomeCreditTotals[outcome.id] || 0) + priorCredits);
    return acc;
  }, {});
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  for (const outcome of outcomes) {
    people[outcome.id] = input.totalPeople > 0 ? (input.outcomePeopleCounts[outcome.id] || 0) / input.totalPeople : 0;
    credit[outcome.id] =
      totalCreditsWithPrior > 0
        ? ((input.outcomeCreditTotals[outcome.id] || 0) + priorCredits) / totalCreditsWithPrior
        : 0;
    conviction[outcome.id] = totalWeight > 0 ? weights[outcome.id] / totalWeight : 0;
    const peopleComponent = input.totalPeople > 0 ? people[outcome.id] : neutralShare;
    stage[outcome.id] = 0.65 * peopleComponent + 0.35 * conviction[outcome.id];
  }
  return { people, credit, conviction, stage };
}

export function signalSnapshots(store: Store, marketId: string) {
  const aggregate = humanMarketAggregate(store, marketId);
  return signalSnapshotFromTotals(outcomesForMarket(store, marketId), aggregate);
}

export function blindLaunchState(store: Store, market: Market, now = new Date()) {
  const aggregate = humanMarketAggregate(store, market.id);
  const predictedCount = aggregate.totalPeople;
  const unlocksAtPredictionCount = market.blindLaunchPredictionThreshold || BLIND_LAUNCH_PREDICTIONS;
  const openedAt = new Date(market.openedAt || market.createdAt).getTime();
  const unlocksAt = new Date(openedAt + (market.blindLaunchSeconds || BLIND_LAUNCH_SECONDS) * 1000).toISOString();
  const timeUnlocked = now.getTime() >= new Date(unlocksAt).getTime();
  const active = Boolean(
    market.blindLaunchEnabled &&
      market.status === "open" &&
      !market.blindLaunchEndedAt &&
      predictedCount < unlocksAtPredictionCount &&
      !timeUnlocked
  );
  return {
    active,
    predictedCount,
    unlocksAtPredictionCount,
    remainingPredictions: Math.max(0, unlocksAtPredictionCount - predictedCount),
    unlocksAt,
    endedAt: market.blindLaunchEndedAt
  };
}

export function marketOddsHistory(store: Store, marketId: string): OddsHistoryPoint[] {
  const outcomes = outcomesForMarket(store, marketId);
  const market = store.markets.find((item) => item.id === marketId);
  const actions = store.predictionActions
    .filter((action) => action.marketId === marketId && action.actionType !== "admin_void")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const peopleCounts = outcomes.reduce<Record<string, number>>((acc, outcome) => {
    acc[outcome.id] = 0;
    return acc;
  }, {});
  const creditTotals = outcomes.reduce<Record<string, number>>((acc, outcome) => {
    acc[outcome.id] = 0;
    return acc;
  }, {});
  const runningPositions = new Map<string, { outcomeId: string; signalCredits: number; isHuman: boolean }>();
  const points: OddsHistoryPoint[] = [];

  function pushPoint(at: string) {
    const totalPeople = Object.values(peopleCounts).reduce((sum, value) => sum + value, 0);
    const totalSignalCredits = Object.values(creditTotals).reduce((sum, value) => sum + value, 0);
    const snapshot = signalSnapshotFromTotals(outcomes, {
      totalPeople,
      totalSignalCredits,
      outcomePeopleCounts: peopleCounts,
      outcomeCreditTotals: creditTotals
    });
    points.push({
      at,
      outcomeSignals: outcomes.reduce<OddsHistoryPoint["outcomeSignals"]>((acc, outcome) => {
        acc[outcome.id] = {
          peopleSignal: snapshot.people[outcome.id] || 0,
          creditSignal: snapshot.credit[outcome.id] || 0,
          convictionSignal: snapshot.conviction[outcome.id] || 0,
          stageSignal: snapshot.stage[outcome.id] || 0,
          signalCredits: creditTotals[outcome.id] || 0
        };
        return acc;
      }, {})
    });
  }

  if (market) pushPoint(market.openedAt || market.createdAt);
  for (const action of actions) {
    const participant = store.participants.find((item) => item.id === action.participantId);
    if (!participant || participant.isBanned) continue;
    const isHuman = participant.participantType === "human";
    if (!isHuman) continue;
    const previous = runningPositions.get(action.participantId);
    const addedSignal = signalFromAmount(action.amountCredits).signalCredits;
    if (previous) {
      creditTotals[previous.outcomeId] = Math.max(0, (creditTotals[previous.outcomeId] || 0) - previous.signalCredits);
      if (previous.isHuman) peopleCounts[previous.outcomeId] = Math.max(0, (peopleCounts[previous.outcomeId] || 0) - 1);
    }
    const nextSignal = action.actionType === "switch" && previous ? previous.signalCredits + addedSignal : (previous?.signalCredits || 0) + addedSignal;
    runningPositions.set(action.participantId, { outcomeId: action.outcomeId, signalCredits: nextSignal, isHuman });
    creditTotals[action.outcomeId] = (creditTotals[action.outcomeId] || 0) + nextSignal;
    if (isHuman) peopleCounts[action.outcomeId] = (peopleCounts[action.outcomeId] || 0) + 1;
    pushPoint(action.createdAt);
  }
  return points;
}

export function marketIsInFairLaunch(store: Store, market: Market) {
  if (market.fairLaunchOverride) return false;
  const aggregate = humanMarketAggregate(store, market.id);
  const peopleThreshold = market.fairLaunchPeopleThreshold || FAIR_LAUNCH_PEOPLE;
  const signalThreshold = market.fairLaunchSignalCreditsThreshold || FAIR_LAUNCH_SIGNAL_CREDITS;
  return aggregate.totalPeople < peopleThreshold && aggregate.totalSignalCredits < signalThreshold;
}

function signalFromAmount(amountCredits: number) {
  const feeCredits = Math.floor(amountCredits * 0.02);
  return { feeCredits, signalCredits: amountCredits - feeCredits };
}

function creditShareAfter(aggregate: MarketAggregate, outcomeId: string, signalAdd: number) {
  const currentOutcome = aggregate.outcomeCreditTotals[outcomeId] || 0;
  const currentTotal = aggregate.totalSignalCredits;
  const nextTotal = currentTotal + signalAdd;
  if (nextTotal <= 0) return 0;
  return (currentOutcome + signalAdd) / nextTotal;
}

function priceImpactMax(aggregate: MarketAggregate, outcomeId: string, maxAmount: number) {
  if (aggregate.totalSignalCredits <= 0) return maxAmount;
  const currentShare = (aggregate.outcomeCreditTotals[outcomeId] || 0) / aggregate.totalSignalCredits;
  let allowed = 0;
  for (let amount = 1; amount <= maxAmount; amount += 1) {
    const { signalCredits } = signalFromAmount(amount);
    const nextShare = creditShareAfter(aggregate, outcomeId, signalCredits);
    if (Math.abs(nextShare - currentShare) <= MAX_PRICE_IMPACT + 0.000001) allowed = amount;
    else break;
  }
  return allowed;
}

function assertSwitchImpactAllowed(aggregate: MarketAggregate, fromOutcomeId: string, toOutcomeId: string, movingSignal: number, addedSignal: number) {
  if (isSwitchImpactAllowed(aggregate, fromOutcomeId, toOutcomeId, movingSignal, addedSignal)) return;
  throw new Error(`This market cannot absorb that switch yet. Max allowed now: 0 MBucks.`);
}

function isSwitchImpactAllowed(aggregate: MarketAggregate, fromOutcomeId: string, toOutcomeId: string, movingSignal: number, addedSignal: number) {
  if (movingSignal <= 0 && addedSignal <= 0) return true;
  const beforeTotal = Math.max(1, aggregate.totalSignalCredits);
  const afterTotal = aggregate.totalSignalCredits + addedSignal;
  const outcomeIds = new Set([
    ...Object.keys(aggregate.outcomeCreditTotals),
    fromOutcomeId,
    toOutcomeId
  ]);
  for (const outcomeId of outcomeIds) {
    const beforeCredits = aggregate.outcomeCreditTotals[outcomeId] || 0;
    const afterCredits =
      beforeCredits -
      (outcomeId === fromOutcomeId ? movingSignal : 0) +
      (outcomeId === toOutcomeId ? movingSignal + addedSignal : 0);
    const beforeShare = beforeCredits / beforeTotal;
    const afterShare = afterTotal > 0 ? Math.max(0, afterCredits) / afterTotal : 0;
    if (Math.abs(afterShare - beforeShare) > MAX_PRICE_IMPACT + 0.000001) {
      return false;
    }
  }
  return true;
}

function switchImpactMax(aggregate: MarketAggregate, fromOutcomeId: string, toOutcomeId: string, movingSignal: number, maxAmount: number) {
  let allowed = 0;
  for (let amount = 0; amount <= maxAmount; amount += 1) {
    const { signalCredits } = signalFromAmount(amount);
    if (isSwitchImpactAllowed(aggregate, fromOutcomeId, toOutcomeId, movingSignal, signalCredits)) allowed = amount;
    else if (amount === 0) break;
    else break;
  }
  return allowed;
}

function marketShareMax(
  aggregate: MarketAggregate,
  currentUserSignal: number,
  maxShare: number,
  maxAmount: number
) {
  if (aggregate.totalSignalCredits <= 0) return maxAmount;
  let allowed = 0;
  for (let amount = 1; amount <= maxAmount; amount += 1) {
    const { signalCredits } = signalFromAmount(amount);
    const nextUserSignal = currentUserSignal + signalCredits;
    const nextTotal = aggregate.totalSignalCredits + signalCredits;
    if (nextUserSignal / nextTotal <= maxShare + 0.000001) allowed = amount;
    else break;
  }
  return allowed;
}

export interface AllowedStakeResult {
  allowedAdd: number;
  reason: string;
  fairLaunch: boolean;
  minInitial: number;
  cooldownRemainingSeconds: number;
  parts: Record<string, number>;
}

export function calculateAllowedStake(
  store: Store,
  input: { participantId: string; marketId: string; outcomeId: string; now?: Date }
): AllowedStakeResult {
  const now = input.now || new Date();
  const market = store.markets.find((item) => item.id === input.marketId);
  const participant = store.participants.find((item) => item.id === input.participantId);
  const wallet = store.wallets.find((item) => item.participantId === input.participantId);
  const outcome = store.outcomes.find((item) => item.id === input.outcomeId && item.marketId === input.marketId);
  if (!market || !participant || !wallet) {
    return { allowedAdd: 0, reason: "Missing participant, market, or wallet.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  if (!outcome) {
    return { allowedAdd: 0, reason: "Prediction target not found.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  if (market.status !== "open") {
    return { allowedAdd: 0, reason: "This prediction is not open.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  if (participant.isBanned) {
    return { allowedAdd: 0, reason: "This profile is paused by moderation.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  if (participant.eventId !== market.eventId) {
    return { allowedAdd: 0, reason: "This profile cannot predict in another event.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  if (participant.participantType === "human" && !hasCompletedProfile(participant)) {
    return { allowedAdd: 0, reason: "Finish your profile before predicting.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }
  const event = store.events.find((item) => item.id === market.eventId);
  if (event?.emergencyPaused) {
    return { allowedAdd: 0, reason: "The arena is paused by the organizer.", fairLaunch: false, minInitial: 100, cooldownRemainingSeconds: 0, parts: {} };
  }

  const aggregate = participant.participantType === "human" ? humanMarketAggregate(store, market.id) : getAggregate(store, market.id);
  const position = store.positions.find((item) => item.participantId === participant.id && item.marketId === market.id);
  const fairLaunchActive = marketIsInFairLaunch(store, market);
  const fairLaunch = !position && fairLaunchActive;
  if (fairLaunch) {
    return {
      allowedAdd: Math.min(wallet.balanceCredits, INITIAL_STAKE_AMOUNT),
      reason: "Fair launch: first prediction is exactly 100 MBucks.",
      fairLaunch: true,
      minInitial: INITIAL_STAKE_AMOUNT,
      cooldownRemainingSeconds: 0,
      parts: {
        availableCredits: wallet.balanceCredits,
        fairLaunch: INITIAL_STAKE_AMOUNT
      }
    };
  }

  let cooldownRemainingSeconds = 0;
  if (position) {
    const elapsed = (now.getTime() - new Date(position.lastActionAt).getTime()) / 1000;
    cooldownRemainingSeconds = Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsed));
  }
  const cooldownCap = cooldownRemainingSeconds > 0 ? 0 : Number.MAX_SAFE_INTEGER;
  const stepUpCap = position ? Math.max(INITIAL_STAKE_AMOUNT, Math.floor(position.rawCredits * 0.5)) : market.maxActionStake;
  const currentUserSignal = position?.signalCredits || 0;
  const shareCap = participant.participantType === "human" ? MAX_HUMAN_MARKET_SHARE : MAX_AGENT_MARKET_SHARE;
  const switching = Boolean(position && position.outcomeId !== input.outcomeId);
  const fairLaunchStepUp = Boolean(position && fairLaunchActive);
  const shareMax = fairLaunchStepUp ? market.maxActionStake : marketShareMax(aggregate, currentUserSignal, shareCap, market.maxActionStake);
  const impactMax = fairLaunchStepUp
    ? market.maxActionStake
    : switching
      ? switchImpactMax(aggregate, position!.outcomeId, input.outcomeId, position!.signalCredits, market.maxActionStake)
      : priceImpactMax(aggregate, input.outcomeId, market.maxActionStake);
  const parts = {
    availableCredits: wallet.balanceCredits,
    maxActionStake: market.maxActionStake,
    stepUpCap,
    cooldownCap,
    marketShareCap: shareMax,
    priceImpactCap: impactMax,
    fairLaunchStepUp: fairLaunchStepUp ? market.maxActionStake : 0
  };
  const allowedAdd = Math.max(
    0,
    Math.min(
      wallet.balanceCredits,
      market.maxActionStake,
      stepUpCap,
      cooldownCap,
      shareMax,
      impactMax
    )
  );
  const reason =
    allowedAdd <= 0
      ? cooldownRemainingSeconds > 0
        ? `Cooldown active. Try again in ${cooldownRemainingSeconds}s.`
      : switching && impactMax <= 0
          ? "This market cannot absorb that switch yet."
        : "This market cannot absorb more MegaBucks from this profile yet."
      : `This market can absorb up to ${allowedAdd} MegaBucks from you right now.`;
  return {
    allowedAdd,
    reason,
    fairLaunch: false,
    minInitial: position ? 0 : INITIAL_STAKE_AMOUNT,
    cooldownRemainingSeconds,
    parts
  };
}

function advanceStageAfterHumanPrediction(store: Store, market: Market, participant: Participant) {
  if (participant.participantType !== "human") return;
  const event = store.events.find((item) => item.id === market.eventId);
  if (!event || event.stageMode !== "join") return;
  market.showOnStage = true;
  event.stageMode = "live";
  event.featuredMarketId = market.id;
}

export function placePrediction(
  store: Store,
  input: { participantId: string; marketId: string; outcomeId: string; amountCredits: number; requestId?: string }
) {
  const participant = store.participants.find((item) => item.id === input.participantId);
  const wallet = store.wallets.find((item) => item.participantId === input.participantId);
  const market = store.markets.find((item) => item.id === input.marketId);
  if (!participant || !wallet || !market) throw new Error("Prediction target not found.");
  const amountCredits = Math.floor(Number(input.amountCredits));
  if (!Number.isFinite(amountCredits) || amountCredits < 0) throw new Error("Choose a valid MegaBuck amount.");
  const requestId = input.requestId?.trim().slice(0, 128) || undefined;
  if (requestId) {
    const replayedAction = store.predictionActions.find(
      (item) => item.participantId === participant.id && item.marketId === market.id && item.requestId === requestId
    );
    if (replayedAction) {
      if (replayedAction.outcomeId !== input.outcomeId || replayedAction.amountCredits !== amountCredits) {
        throw new Error("Idempotency key was already used for a different prediction.");
      }
      const position = store.positions.find((item) => item.participantId === participant.id && item.marketId === market.id);
      if (!position) throw new Error("Prediction replay could not find the original position.");
      return {
        position,
        action: replayedAction,
        aggregate: getAggregate(store, market.id),
        wallet,
        allowed: calculateAllowedStake(store, {
          participantId: participant.id,
          marketId: market.id,
          outcomeId: replayedAction.outcomeId
        })
      };
    }
  }
  const outcome = store.outcomes.find((item) => item.id === input.outcomeId && item.marketId === input.marketId);
  if (!outcome) throw new Error("Prediction target not found.");
  if (participant.eventId !== market.eventId) throw new Error("This profile cannot predict in another event.");
  if (market.status !== "open") throw new Error("This prediction is not open.");
  if (participant.isBanned) throw new Error("This profile is paused by moderation.");
  if (participant.participantType === "human" && !hasCompletedProfile(participant)) throw new Error("Finish your profile before predicting.");
  const event = store.events.find((item) => item.id === market.eventId);
  if (event?.emergencyPaused) throw new Error("The arena is paused by the organizer.");

  const existing = store.positions.find((item) => item.participantId === participant.id && item.marketId === market.id);
  const switching = Boolean(existing && existing.outcomeId !== outcome.id);
  if (switching && !market.allowSwitching) throw new Error("Switching is disabled for this prediction.");
  if (!existing && amountCredits <= 0) throw new Error("First prediction needs MegaBucks.");
  if (existing && !switching && amountCredits <= 0) throw new Error("Choose MegaBucks to add.");
  const allowed = calculateAllowedStake(store, { participantId: participant.id, marketId: market.id, outcomeId: outcome.id });
  if (allowed.cooldownRemainingSeconds > 0) {
    throw new Error(`Cooldown active. Try again in ${allowed.cooldownRemainingSeconds}s.`);
  }
  if (!existing && allowed.fairLaunch && amountCredits !== INITIAL_STAKE_AMOUNT) {
    throw new Error("Fair launch: first prediction is exactly 100 MBucks.");
  }
  if (!allowed.fairLaunch && !existing && amountCredits < INITIAL_STAKE_AMOUNT) {
    throw new Error("First prediction must be at least 100 MBucks.");
  }
  if (amountCredits > allowed.allowedAdd) {
    const reason = switching ? "This market cannot absorb that switch yet." : "This market cannot absorb that much yet.";
    throw new Error(`${reason} This market can absorb up to ${allowed.allowedAdd} MegaBucks from you right now.`);
  }
  if (wallet.balanceCredits < amountCredits) throw new Error("Not enough MegaBucks.");

  const snapshots = signalSnapshots(store, market.id);
  const { feeCredits, signalCredits } = signalFromAmount(amountCredits);
  if (switching && existing && !marketIsInFairLaunch(store, market)) {
    assertSwitchImpactAllowed(getAggregate(store, market.id), existing.outcomeId, outcome.id, existing.signalCredits, signalCredits);
  }
  const now = nowIso();
  let position = existing;
  let actionType: PredictionAction["actionType"] = "initial";
  if (!position) {
    position = {
      id: makeId("pos"),
      participantId: participant.id,
      marketId: market.id,
      outcomeId: outcome.id,
      rawCredits: amountCredits,
      signalCredits,
      feeCredits,
      lastActionAt: now,
      createdAt: now,
      updatedAt: now
    };
    store.positions.push(position);
  } else {
    actionType = switching ? "switch" : "add";
    const movedSignalCredits = switching ? position.signalCredits + signalCredits : signalCredits;
    position.outcomeId = outcome.id;
    position.rawCredits += amountCredits;
    position.signalCredits += signalCredits;
    position.feeCredits += feeCredits;
    position.lastActionAt = now;
    position.updatedAt = now;
    if (switching) {
      store.predictionActions.push({
        id: makeId("act"),
        participantId: participant.id,
        marketId: market.id,
        outcomeId: outcome.id,
        requestId,
        actionType,
        amountCredits,
        signalCredits: movedSignalCredits,
        feeCredits,
        peopleSignalSnapshot: snapshots.people,
        creditSignalSnapshot: snapshots.credit,
        convictionSignalSnapshot: snapshots.conviction,
        stageSignalSnapshot: snapshots.stage,
        createdAt: now
      });
      wallet.balanceCredits -= amountCredits;
      wallet.totalCommittedCredits += amountCredits;
      if (amountCredits > 0) {
        store.ledgerEntries.push({
          id: makeId("led"),
          participantId: participant.id,
          type: "prediction_commit",
          amountCredits: -amountCredits,
          direction: "debit",
          balanceAfter: wallet.balanceCredits,
          idempotencyKey: requestId,
          reason: `Committed MegaBucks to ${market.title}`,
          marketId: market.id,
          metadata: { outcomeId: outcome.id },
          createdAt: now
        });
      }
      advanceStageAfterHumanPrediction(store, market, participant);
      const aggregate = recomputeMarketAggregate(store, market.id);
      return { position, action: store.predictionActions[store.predictionActions.length - 1], aggregate, wallet, allowed };
    }
  }
  wallet.balanceCredits -= amountCredits;
  wallet.totalCommittedCredits += amountCredits;
  const action: PredictionAction = {
    id: makeId("act"),
    participantId: participant.id,
    marketId: market.id,
    outcomeId: outcome.id,
    requestId,
    actionType,
    amountCredits,
    signalCredits,
    feeCredits,
    peopleSignalSnapshot: snapshots.people,
    creditSignalSnapshot: snapshots.credit,
    convictionSignalSnapshot: snapshots.conviction,
    stageSignalSnapshot: snapshots.stage,
    createdAt: now
  };
  store.predictionActions.push(action);
  if (amountCredits > 0) {
    store.ledgerEntries.push({
      id: makeId("led"),
      participantId: participant.id,
      type: "prediction_commit",
      amountCredits: -amountCredits,
      direction: "debit",
      balanceAfter: wallet.balanceCredits,
      idempotencyKey: requestId,
      reason: `Committed MegaBucks to ${market.title}`,
      marketId: market.id,
      metadata: { outcomeId: outcome.id },
      createdAt: now
    });
  }
  advanceStageAfterHumanPrediction(store, market, participant);
  const aggregate = recomputeMarketAggregate(store, market.id);
  return { position, action, aggregate, wallet, allowed };
}

export function publicMarketState(store: Store, market: Market): PublicMarketState {
  const aggregate = getAggregate(store, market.id);
  const humanAggregate = humanMarketAggregate(store, market.id);
  const snapshots = signalSnapshots(store, market.id);
  const blindLaunch = blindLaunchState(store, market);
  const signalsHidden = blindLaunch.active;
  const totalHumanSignals = Object.values(aggregate.agentBreakdown.human).reduce((sum, count) => sum + count, 0);
  const totalAgentSignals = Object.values(aggregate.agentBreakdown.agent).reduce((sum, count) => sum + count, 0);
  const outcomes = outcomesForMarket(store, market.id).map((outcome) => ({
    id: outcome.id,
    label: outcome.label,
    imageUrl: outcome.imageUrl,
    icon: outcome.icon,
    peopleSignal: signalsHidden ? 0 : snapshots.people[outcome.id] || 0,
    creditSignal: signalsHidden ? 0 : snapshots.credit[outcome.id] || 0,
    convictionSignal: signalsHidden ? 0 : snapshots.conviction[outcome.id] || 0,
    stageSignal: signalsHidden ? 0 : snapshots.stage[outcome.id] || 0,
    humanSignal:
      !signalsHidden && totalHumanSignals > 0
        ? (aggregate.agentBreakdown.human[outcome.id] || 0) / totalHumanSignals
        : 0,
    agentSignal:
      !signalsHidden && totalAgentSignals > 0
        ? (aggregate.agentBreakdown.agent[outcome.id] || 0) / totalAgentSignals
        : 0,
    combinedSignal:
      !signalsHidden && totalHumanSignals + totalAgentSignals > 0
        ? ((aggregate.agentBreakdown.human[outcome.id] || 0) + (aggregate.agentBreakdown.agent[outcome.id] || 0)) /
          (totalHumanSignals + totalAgentSignals)
        : 0,
    peopleCount: signalsHidden ? 0 : aggregate.outcomePeopleCounts[outcome.id] || 0,
    humanCount: signalsHidden ? 0 : aggregate.agentBreakdown.human[outcome.id] || 0,
    agentCount: signalsHidden ? 0 : aggregate.agentBreakdown.agent[outcome.id] || 0,
    signalCredits: signalsHidden ? 0 : humanAggregate.outcomeCreditTotals[outcome.id] || 0
  }));
  return {
    id: market.id,
    title: market.title,
    description: market.description,
    category: market.category,
    imageUrl: market.imageUrl,
    showOnStage: market.showOnStage,
    status: market.status,
    resolutionRule: market.resolutionRule,
    resolvedOutcomeId: market.resolvedOutcomeId,
    resolutionNote: market.resolutionNote,
    totalParticipants: aggregate.totalPeople,
    totalSignalCredits: humanAggregate.totalSignalCredits,
    blindLaunch,
    oddsHistory: signalsHidden ? [] : marketOddsHistory(store, market.id).slice(-80),
    outcomes
  };
}

export function userMarketState(
  store: Store,
  input: { participantId?: string; marketId: string }
): UserMarketState {
  if (!input.participantId) return { allowedByOutcome: {} };
  const participant = store.participants.find((item) => item.id === input.participantId);
  const wallet = store.wallets.find((item) => item.participantId === input.participantId);
  const position = store.positions.find((item) => item.participantId === input.participantId && item.marketId === input.marketId);
  const outcome = position ? store.outcomes.find((item) => item.id === position.outcomeId) : undefined;
  const allowedByOutcome = outcomesForMarket(store, input.marketId).reduce<UserMarketState["allowedByOutcome"]>(
    (acc, item) => {
      const allowed = calculateAllowedStake(store, {
        participantId: input.participantId!,
        marketId: input.marketId,
        outcomeId: item.id
      });
      const postCooldownAllowedAdd = Math.max(
        0,
        Math.min(
          allowed.parts.availableCredits ?? allowed.allowedAdd,
          allowed.parts.maxActionStake ?? allowed.allowedAdd,
          allowed.parts.stepUpCap ?? allowed.allowedAdd,
          allowed.parts.marketShareCap ?? allowed.allowedAdd,
          allowed.parts.priceImpactCap ?? allowed.allowedAdd
        )
      );
      acc[item.id] = {
        allowedAdd: allowed.allowedAdd,
        postCooldownAllowedAdd,
        reason: allowed.reason,
        fairLaunch: allowed.fairLaunch,
        minInitial: allowed.minInitial,
        cooldownRemainingSeconds: allowed.cooldownRemainingSeconds
      };
      return acc;
    },
    {}
  );
  const receipt = participant?.isBanned ? undefined : receiptActionsForParticipant(store, input.participantId, input.marketId)[0];
  return {
    participant,
    wallet,
    position: position ? { ...position, outcomeLabel: outcome?.label } : undefined,
    allowedByOutcome,
    receiptId: receipt?.action.id
  };
}

export function predictionPreview(
  store: Store,
  input: { participantId?: string; marketId: string; outcomeId: string; amountCredits: number }
): PredictionPreview | undefined {
  if (!input.participantId) return undefined;
  const market = store.markets.find((item) => item.id === input.marketId);
  const participant = store.participants.find((item) => item.id === input.participantId);
  const outcome = store.outcomes.find((item) => item.id === input.outcomeId && item.marketId === input.marketId);
  if (!market || !participant || !outcome) return undefined;
  const aggregate = humanMarketAggregate(store, market.id);
  const outcomes = outcomesForMarket(store, market.id);
  const before = signalSnapshots(store, market.id);
  const allowed = calculateAllowedStake(store, {
    participantId: participant.id,
    marketId: market.id,
    outcomeId: outcome.id
  });
  const requested = Math.max(0, Math.floor(Number(input.amountCredits) || 0));
  const position = store.positions.find((item) => item.participantId === participant.id && item.marketId === market.id);
  const isZeroMegaBuckSwitch = Boolean(position && position.outcomeId !== outcome.id && requested === 0);
  const zeroMegaBuckSwitchAllowed = Boolean(
    isZeroMegaBuckSwitch &&
      allowed.cooldownRemainingSeconds <= 0 &&
      (marketIsInFairLaunch(store, market) || isSwitchImpactAllowed(aggregate, position!.outcomeId, outcome.id, position!.signalCredits, 0))
  );
  const blocked = requested > allowed.allowedAdd || (allowed.allowedAdd <= 0 && !zeroMegaBuckSwitchAllowed);
  const appliedAmount = blocked ? 0 : Math.min(requested, allowed.allowedAdd);
  const addedSignal = signalFromAmount(appliedAmount).signalCredits;
  const peopleCounts = { ...aggregate.outcomePeopleCounts };
  const creditTotals = { ...aggregate.outcomeCreditTotals };
  const isHuman = participant.participantType === "human";

  if (!blocked && isHuman) {
    if (position && position.outcomeId !== outcome.id) {
      creditTotals[position.outcomeId] = Math.max(0, (creditTotals[position.outcomeId] || 0) - position.signalCredits);
      if (isHuman) peopleCounts[position.outcomeId] = Math.max(0, (peopleCounts[position.outcomeId] || 0) - 1);
      creditTotals[outcome.id] = (creditTotals[outcome.id] || 0) + position.signalCredits + addedSignal;
      if (isHuman) peopleCounts[outcome.id] = (peopleCounts[outcome.id] || 0) + 1;
    } else {
      creditTotals[outcome.id] = (creditTotals[outcome.id] || 0) + addedSignal;
      if (isHuman && !position) peopleCounts[outcome.id] = (peopleCounts[outcome.id] || 0) + 1;
    }
  }

  const after = signalSnapshotFromTotals(outcomes, {
    totalPeople: Object.values(peopleCounts).reduce((sum, value) => sum + value, 0),
    totalSignalCredits: Object.values(creditTotals).reduce((sum, value) => sum + value, 0),
    outcomePeopleCounts: peopleCounts,
    outcomeCreditTotals: creditTotals
  });
  return {
    outcomeId: outcome.id,
    amountCredits: requested,
    allowedAdd: allowed.allowedAdd,
    blocked,
    reason: requested > allowed.allowedAdd ? `Too much conviction for this market right now. Max allowed: ${allowed.allowedAdd} MegaBucks.` : allowed.reason,
    before: {
      peopleSignal: before.people[outcome.id] || 0,
      creditSignal: before.credit[outcome.id] || 0,
      convictionSignal: before.conviction[outcome.id] || 0,
      stageSignal: before.stage[outcome.id] || 0
    },
    after: {
      peopleSignal: after.people[outcome.id] || 0,
      creditSignal: after.credit[outcome.id] || 0,
      convictionSignal: after.conviction[outcome.id] || 0,
      stageSignal: after.stage[outcome.id] || 0
    },
    movement: (after.stage[outcome.id] || 0) - (before.stage[outcome.id] || 0)
  };
}

export function publicState(store: Store, slug = DEFAULT_EVENT_SLUG): PublicEventState {
  const event = getEventOrThrow(store, slug);
  const rawMarkets = store.markets
    .filter((market) => market.eventId === event.id && market.status !== "draft" && market.status !== "voided");
  const stageMarkets = rawMarkets.filter((market) => market.status !== "voided" && market.showOnStage);
  const markets = rawMarkets
    .map((market) => publicMarketState(store, market));
  const featuredMarketId =
    stageMarkets.find((market) => market.id === event.featuredMarketId && isCompatibleStageMarket(event.stageMode, market))?.id ||
    stageMarkets.find((market) => isCompatibleStageMarket(event.stageMode, market))?.id;
  const featuredMarket = featuredMarketId ? rawMarkets.find((market) => market.id === featuredMarketId) : undefined;
  const hideRoleWinners = Boolean(featuredMarket && blindLaunchState(store, featuredMarket).active);
  return {
    event: {
      slug: event.slug,
      name: event.name,
      status: event.status,
      stageMode: event.stageMode,
      featuredMarketId,
      emergencyPaused: event.emergencyPaused
    },
    markets,
    roleWinners: featuredMarketId && !hideRoleWinners
      ? {
          builder: roleWinnerLabel(store, featuredMarketId, "builder"),
          sponsor: roleWinnerLabel(store, featuredMarketId, "sponsor"),
          investor: roleWinnerLabel(store, featuredMarketId, "investor"),
          other: roleWinnerLabel(store, featuredMarketId, "other")
        }
      : {
          builder: "pure chaos",
          sponsor: "pure chaos",
          investor: "pure chaos",
          other: "pure chaos"
        }
  };
}

export function createAuditLog(
  store: Store,
  input: Omit<AdminAuditLog, "id" | "createdAt">
) {
  const log: AdminAuditLog = {
    id: makeId("aud"),
    createdAt: nowIso(),
    ...input
  };
  store.adminAuditLogs.push(log);
  return log;
}

export function createMarket(
  store: Store,
  input: {
    eventSlug: string;
    title: string;
    description: string;
    category: string;
    imageUrl?: string;
    resolutionRule: string;
    outcomes: { label: string; imageUrl?: string; icon?: string }[];
    showOnStage?: boolean;
    fairLaunchOverride?: boolean;
    fairLaunchPeopleThreshold?: number;
    fairLaunchSignalCreditsThreshold?: number;
    maxActionStake?: number;
    allowSwitching?: boolean;
    blindLaunchEnabled?: boolean;
    blindLaunchPredictionThreshold?: number;
    blindLaunchSeconds?: number;
    blindLaunchEndedAt?: string;
    auditIp?: string;
  }
) {
  const event = getEventOrThrow(store, input.eventSlug);
  if (!input.title.trim()) throw new Error("Market title is required.");
  if (!input.description.trim()) throw new Error("Market description is required.");
  if (!input.resolutionRule.trim()) throw new Error("Resolution rule is required.");
  const validOutcomes = input.outcomes.filter((item) => item.label.trim()).slice(0, 8);
  if (validOutcomes.length < 2) throw new Error("At least two outcomes are required.");
  const now = nowIso();
  const market: Market = {
    id: makeId("mkt"),
    eventId: event.id,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim() || "General",
    imageUrl: input.imageUrl?.trim() || undefined,
    status: "draft",
    resolutionRule: input.resolutionRule.trim(),
    showOnStage: Boolean(input.showOnStage),
    fairLaunchOverride: Boolean(input.fairLaunchOverride),
    fairLaunchPeopleThreshold: clamp(Math.floor(input.fairLaunchPeopleThreshold || FAIR_LAUNCH_PEOPLE), 1, 500),
    fairLaunchSignalCreditsThreshold: clamp(
      Math.floor(input.fairLaunchSignalCreditsThreshold || FAIR_LAUNCH_SIGNAL_CREDITS),
      INITIAL_STAKE_AMOUNT,
      1_000_000
    ),
    maxActionStake: clamp(Math.floor(input.maxActionStake || MAX_ACTION_STAKE), 100, 5000),
    allowSwitching: input.allowSwitching !== false,
    blindLaunchEnabled: input.blindLaunchEnabled !== false,
    blindLaunchPredictionThreshold: clamp(
      Math.floor(input.blindLaunchPredictionThreshold || BLIND_LAUNCH_PREDICTIONS),
      1,
      500
    ),
    blindLaunchSeconds: clamp(Math.floor(input.blindLaunchSeconds || BLIND_LAUNCH_SECONDS), 10, 86_400),
    blindLaunchEndedAt: input.blindLaunchEndedAt,
    createdAt: now,
    updatedAt: now
  };
  store.markets.push(market);
  for (const rawOutcome of validOutcomes) {
    store.outcomes.push({
      id: makeId("out"),
      marketId: market.id,
      label: rawOutcome.label.trim(),
      imageUrl: rawOutcome.imageUrl?.trim() || undefined,
      icon: rawOutcome.icon?.trim().slice(0, 2) || rawOutcome.label.trim().slice(0, 1).toUpperCase()
    });
  }
  recomputeMarketAggregate(store, market.id);
  createAuditLog(store, {
    action: "create_market",
    entityType: "market",
    entityId: market.id,
    details: { title: market.title },
    ip: input.auditIp
  });
  return market;
}

export function updateMarket(
  store: Store,
  marketId: string,
  input: Partial<
    Pick<
      Market,
      | "title"
      | "description"
      | "category"
      | "imageUrl"
      | "resolutionRule"
      | "showOnStage"
      | "maxActionStake"
      | "allowSwitching"
      | "blindLaunchEnabled"
      | "blindLaunchPredictionThreshold"
      | "blindLaunchSeconds"
      | "blindLaunchEndedAt"
      | "fairLaunchOverride"
      | "fairLaunchPeopleThreshold"
      | "fairLaunchSignalCreditsThreshold"
    >
  > & {
    outcomes?: { id?: string; label: string; imageUrl?: string; icon?: string }[];
    clearBlindLaunchEndedAt?: boolean;
    auditIp?: string;
  }
) {
  const market = store.markets.find((item) => item.id === marketId);
  if (!market) throw new Error("Market not found");
  if (market.status !== "draft" && market.status !== "open" && input.outcomes) {
    throw new Error("Outcome editing is only allowed before lock.");
  }
  const nextShowOnStage = market.status === "voided"
    ? false
    : input.showOnStage ?? market.showOnStage;

  Object.assign(market, {
    title: input.title?.trim() || market.title,
    description: input.description?.trim() || market.description,
    category: input.category?.trim() || market.category,
    imageUrl: input.imageUrl?.trim() || market.imageUrl,
    resolutionRule: input.resolutionRule?.trim() || market.resolutionRule,
    showOnStage: nextShowOnStage,
    fairLaunchPeopleThreshold: input.fairLaunchPeopleThreshold
      ? clamp(Math.floor(input.fairLaunchPeopleThreshold), 1, 500)
      : market.fairLaunchPeopleThreshold,
    fairLaunchSignalCreditsThreshold: input.fairLaunchSignalCreditsThreshold
      ? clamp(Math.floor(input.fairLaunchSignalCreditsThreshold), INITIAL_STAKE_AMOUNT, 1_000_000)
      : market.fairLaunchSignalCreditsThreshold,
    maxActionStake: input.maxActionStake ? clamp(Math.floor(input.maxActionStake), 100, 5000) : market.maxActionStake,
    allowSwitching: input.allowSwitching ?? market.allowSwitching,
    blindLaunchEnabled: input.blindLaunchEnabled ?? market.blindLaunchEnabled,
    blindLaunchPredictionThreshold: input.blindLaunchPredictionThreshold
      ? clamp(Math.floor(input.blindLaunchPredictionThreshold), 1, 500)
      : market.blindLaunchPredictionThreshold,
    blindLaunchSeconds: input.blindLaunchSeconds
      ? clamp(Math.floor(input.blindLaunchSeconds), 10, 86_400)
      : market.blindLaunchSeconds,
    blindLaunchEndedAt: input.clearBlindLaunchEndedAt ? undefined : input.blindLaunchEndedAt ?? market.blindLaunchEndedAt,
    fairLaunchOverride: input.fairLaunchOverride ?? market.fairLaunchOverride,
    updatedAt: nowIso()
  });
  if (!market.showOnStage) {
    const event = store.events.find((item) => item.id === market.eventId);
    if (event) refreshFeaturedMarketAfterRemoval(store, event, market.id);
  }
  if (input.outcomes) {
    if (market.status !== "draft") throw new Error("Outcome editing is only allowed while the market is a draft.");
    const validOutcomes = input.outcomes.filter((item) => item.label.trim()).slice(0, 8);
    if (validOutcomes.length < 2) throw new Error("At least two outcomes are required.");
    store.outcomes = store.outcomes.filter((outcome) => outcome.marketId !== market.id);
    for (const rawOutcome of validOutcomes) {
      store.outcomes.push({
        id: rawOutcome.id || makeId("out"),
        marketId: market.id,
        label: rawOutcome.label.trim(),
        imageUrl: rawOutcome.imageUrl?.trim() || undefined,
        icon: rawOutcome.icon?.trim().slice(0, 2) || rawOutcome.label.trim().slice(0, 1).toUpperCase()
      });
    }
  }
  recomputeMarketAggregate(store, market.id);
  createAuditLog(store, {
    action: "update_market",
    entityType: "market",
    entityId: market.id,
    details: { title: market.title },
    ip: input.auditIp
  });
  return market;
}

export function transitionMarket(store: Store, marketId: string, action: "open" | "lock" | "void", auditIp?: string) {
  const market = store.markets.find((item) => item.id === marketId);
  if (!market) throw new Error("Market not found");
  const now = nowIso();
  if (action === "open") {
    if (market.status !== "draft") throw new Error("Only draft markets can be opened.");
    market.status = "open";
    market.openedAt = market.openedAt || now;
  }
  if (action === "lock") {
    if (market.status !== "open") throw new Error("Only open markets can be locked.");
    stampClosingStageSignals(store, market.id);
    market.status = "locked";
    market.lockedAt = now;
  }
  if (action === "void") {
    if (market.status === "voided") return market;
    if (market.status === "resolved") throw new Error("Resolved markets cannot be voided.");
    market.status = "voided";
    market.voidedAt = now;
    market.showOnStage = false;
    const event = store.events.find((item) => item.id === market.eventId);
    if (event) refreshFeaturedMarketAfterRemoval(store, event, market.id);
    const positions = store.positions.filter((position) => position.marketId === market.id && position.rawCredits > 0);
    const snapshots = signalSnapshots(store, market.id);
    for (const position of positions) {
      const wallet = store.wallets.find((item) => item.participantId === position.participantId);
      if (wallet) {
        wallet.balanceCredits += position.rawCredits;
        wallet.totalCommittedCredits = Math.max(0, wallet.totalCommittedCredits - position.rawCredits);
      }
      store.predictionActions.push({
        id: makeId("act"),
        participantId: position.participantId,
        marketId: market.id,
        outcomeId: position.outcomeId,
        actionType: "admin_void",
        amountCredits: 0,
        signalCredits: 0,
        feeCredits: 0,
        peopleSignalSnapshot: snapshots.people,
        creditSignalSnapshot: snapshots.credit,
        convictionSignalSnapshot: snapshots.conviction,
        stageSignalSnapshot: snapshots.stage,
        createdAt: now
      });
      store.ledgerEntries.push({
        id: makeId("led"),
        participantId: position.participantId,
        type: "void_refund",
        amountCredits: position.rawCredits,
        direction: "credit",
        balanceAfter: wallet?.balanceCredits,
        reason: `Voided prediction refund: ${market.title}`,
        marketId: market.id,
        metadata: { outcomeId: position.outcomeId },
        createdAt: now
      });
      position.rawCredits = 0;
      position.signalCredits = 0;
      position.feeCredits = 0;
      position.updatedAt = now;
    }
    recomputeMarketAggregate(store, market.id);
    recomputeOracleScores(store, market.id);
  }
  market.updatedAt = now;
  createAuditLog(store, {
    action: `${action}_market`,
    entityType: "market",
    entityId: market.id,
    details: { title: market.title },
    ip: auditIp
  });
  return market;
}

function stampClosingStageSignals(store: Store, marketId: string) {
  const snapshots = signalSnapshots(store, marketId);
  for (const action of store.predictionActions) {
    if (action.marketId === marketId && action.actionType !== "admin_void" && !action.closingStageSignalSnapshot) {
      action.closingStageSignalSnapshot = snapshots.stage;
    }
  }
}

function settleResolvedMarketCredits(store: Store, market: Market, outcomeId: string, createdAt: string) {
  let settledCount = 0;
  let settledCredits = 0;
  const marketPositions = store.positions.filter((position) => position.marketId === market.id && position.rawCredits > 0);
  const winningPositions = marketPositions
    .filter((position) => position.outcomeId === outcomeId)
    .sort((a, b) => b.rawCredits - a.rawCredits || a.id.localeCompare(b.id));
  const winningPool = winningPositions.reduce((sum, position) => sum + position.rawCredits, 0);
  const losingPool = marketPositions
    .filter((position) => position.outcomeId !== outcomeId)
    .reduce((sum, position) => sum + position.rawCredits, 0);
  const poolShares = new Map<string, number>();
  if (winningPool > 0) {
    let assignedPool = 0;
    for (const position of winningPositions) {
      const share = Math.floor((losingPool * position.rawCredits) / winningPool);
      poolShares.set(position.id, share);
      assignedPool += share;
    }
    let remainder = losingPool - assignedPool;
    for (const position of winningPositions) {
      if (remainder <= 0) break;
      poolShares.set(position.id, (poolShares.get(position.id) || 0) + 1);
      remainder -= 1;
    }
  }
  for (const position of marketPositions) {
    const wallet = store.wallets.find((item) => item.participantId === position.participantId);
    if (!wallet) throw new Error("Wallet not found.");
    wallet.totalCommittedCredits = Math.max(0, wallet.totalCommittedCredits - position.rawCredits);
  }
  for (const position of winningPositions) {
    const alreadySettled = store.ledgerEntries.some(
      (entry) => entry.type === "resolution_credit" && entry.participantId === position.participantId && entry.marketId === market.id
    );
    if (alreadySettled) continue;
    const wallet = store.wallets.find((item) => item.participantId === position.participantId);
    if (!wallet) throw new Error("Wallet not found.");
    const poolShare = poolShares.get(position.id) || 0;
    const payoutCredits = position.rawCredits + poolShare;
    wallet.balanceCredits += payoutCredits;
    store.ledgerEntries.push({
      id: makeId("led"),
      participantId: position.participantId,
      type: "resolution_credit",
      amountCredits: payoutCredits,
      direction: "credit",
      balanceAfter: wallet.balanceCredits,
      reason: `Resolved prediction credit: ${market.title}`,
      marketId: market.id,
      metadata: { outcomeId, stakeReturned: position.rawCredits, poolShare, losingPool, winningPool },
      createdAt
    });
    settledCount += 1;
    settledCredits += payoutCredits;
  }
  return { settledCount, settledCredits };
}

export function resolveMarket(
  store: Store,
  marketId: string,
  input: { outcomeId: string; note: string; auditIp?: string }
) {
  const market = store.markets.find((item) => item.id === marketId);
  const outcome = store.outcomes.find((item) => item.id === input.outcomeId && item.marketId === marketId);
  if (!market || !outcome) throw new Error("Resolution target not found");
  if (market.status === "resolved") {
    if (market.resolvedOutcomeId === outcome.id) return market;
    throw new Error("Market is already resolved with a different outcome.");
  }
  if (market.status !== "locked") throw new Error("Only locked markets can be resolved.");
  const now = nowIso();
  market.status = "resolved";
  market.resolvedOutcomeId = outcome.id;
  market.resolutionNote = input.note.trim() || "Resolved by organizer/admin.";
  market.resolvedAt = now;
  market.lockedAt = market.lockedAt || now;
  market.showOnStage = true;
  market.updatedAt = now;
  const event = store.events.find((item) => item.id === market.eventId);
  if (event) {
    event.stageMode = "resolution";
    event.featuredMarketId = market.id;
  }
  stampClosingStageSignals(store, market.id);
  recomputeOracleScores(store, market.id);
  const settlement = settleResolvedMarketCredits(store, market, outcome.id, now);
  createAuditLog(store, {
    action: "resolve_market",
    entityType: "market",
    entityId: market.id,
    details: {
      outcomeId: outcome.id,
      note: market.resolutionNote,
      settledCount: settlement.settledCount,
      settledCredits: settlement.settledCredits
    },
    ip: input.auditIp
  });
  return market;
}

export function recomputeOracleScores(store: Store, changedMarketId?: string) {
  for (const participant of store.participants) participant.oracleScore = 0;
  const resolvedMarkets = store.markets.filter((market) => market.status === "resolved" && market.resolvedOutcomeId);
  for (const market of resolvedMarkets) {
    const marketActions = store.predictionActions.filter((action) => action.marketId === market.id);
    const opened = market.openedAt ? new Date(market.openedAt).getTime() : new Date(market.createdAt).getTime();
    const resolved = market.resolvedAt ? new Date(market.resolvedAt).getTime() : Date.now();
    const duration = Math.max(MIN_SCORING_WINDOW_MS, resolved - opened);
    const positions = store.positions.filter((position) => position.marketId === market.id);
    for (const position of positions) {
      const participant = store.participants.find((item) => item.id === position.participantId);
      if (!participant || position.outcomeId !== market.resolvedOutcomeId) continue;
      const participantActions = marketActions
        .filter((action) => action.participantId === participant.id && action.actionType !== "admin_void")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      let lastSwitchToWinningOutcome = -1;
      for (let index = participantActions.length - 1; index >= 0; index -= 1) {
        const action = participantActions[index];
        if (action.actionType === "switch" && action.outcomeId === market.resolvedOutcomeId) {
          lastSwitchToWinningOutcome = index;
          break;
        }
      }
      const scoreableActions =
        lastSwitchToWinningOutcome >= 0
          ? participantActions.slice(lastSwitchToWinningOutcome)
          : participantActions;
      for (const action of scoreableActions) {
        if (action.outcomeId !== market.resolvedOutcomeId || action.signalCredits <= 0) continue;
        const actionTime = new Date(action.createdAt).getTime();
        const progress = clamp((actionTime - opened) / duration, 0, 1);
        const entryStageSignal =
          action.stageSignalSnapshot[market.resolvedOutcomeId] ?? action.peopleSignalSnapshot[market.resolvedOutcomeId] ?? 0;
        const lockTime = market.lockedAt ? new Date(market.lockedAt).getTime() : resolved;
        const minutesBeforeLock = Math.max(0, (lockTime - actionTime) / 60_000);
        participant.oracleScore += oracleScoreForReceiptAction(action, minutesBeforeLock, entryStageSignal);
      }
    }
  }
  if (changedMarketId) recomputeMarketAggregate(store, changedMarketId);
}

function scoreableCorrectActionsForParticipant(store: Store, participantId: string) {
  const results: Array<{
    action: PredictionAction;
    market: Market;
    progress: number;
    popularity: number;
    minutesBeforeLock: number;
    entryStageSignal: number;
  }> = [];
  const resolvedMarkets = store.markets.filter((market) => market.status === "resolved" && market.resolvedOutcomeId);
  for (const market of resolvedMarkets) {
    const position = store.positions.find((item) => item.participantId === participantId && item.marketId === market.id);
    if (!position || position.outcomeId !== market.resolvedOutcomeId) continue;
    const marketActions = store.predictionActions.filter((action) => action.marketId === market.id);
    const participantActions = marketActions
      .filter((action) => action.participantId === participantId && action.actionType !== "admin_void")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let lastSwitchToWinningOutcome = -1;
    for (let index = participantActions.length - 1; index >= 0; index -= 1) {
      const action = participantActions[index];
      if (action.actionType === "switch" && action.outcomeId === market.resolvedOutcomeId) {
        lastSwitchToWinningOutcome = index;
        break;
      }
    }
    const opened = market.openedAt ? new Date(market.openedAt).getTime() : new Date(market.createdAt).getTime();
    const resolved = market.resolvedAt ? new Date(market.resolvedAt).getTime() : Date.now();
    const duration = Math.max(MIN_SCORING_WINDOW_MS, resolved - opened);
    const scoreableActions = lastSwitchToWinningOutcome >= 0 ? participantActions.slice(lastSwitchToWinningOutcome) : participantActions;
    for (const action of scoreableActions) {
      if (action.outcomeId !== market.resolvedOutcomeId || action.signalCredits <= 0) continue;
      const actionTime = new Date(action.createdAt).getTime();
      const progress = clamp((actionTime - opened) / duration, 0, 1);
      const entryStageSignal =
        action.stageSignalSnapshot[market.resolvedOutcomeId] ?? action.peopleSignalSnapshot[market.resolvedOutcomeId] ?? 0;
      const lockTime = market.lockedAt ? new Date(market.lockedAt).getTime() : resolved;
      const minutesBeforeLock = Math.max(0, (lockTime - actionTime) / 60_000);
      results.push({ action, market, progress, popularity: entryStageSignal, minutesBeforeLock, entryStageSignal });
    }
  }
  return results;
}

function receiptActionsForParticipant(store: Store, participantId: string | undefined, marketId?: string) {
  if (!participantId) return [];
  return scoreableCorrectActionsForParticipant(store, participantId)
    .filter((item) => !marketId || item.market.id === marketId)
    .sort((a, b) => new Date(a.action.createdAt).getTime() - new Date(b.action.createdAt).getTime());
}

function participantLeaderboardStats(store: Store, participantId: string) {
  const actions = scoreableCorrectActionsForParticipant(store, participantId);
  return actions.reduce(
    (acc, item) => {
      acc.earlyScore += item.action.signalCredits * (1 - item.progress);
      acc.contrarianScore += item.action.signalCredits * (1 - item.popularity);
      return acc;
    },
    { earlyScore: 0, contrarianScore: 0 }
  );
}

function oracleScoreForReceiptAction(action: PredictionAction, minutesBeforeLock: number, entrySignal: number) {
  const correctnessBase = 100;
  const stakeDisciplineMultiplier = Math.sqrt(Math.max(0, action.signalCredits) / INITIAL_STAKE_AMOUNT);
  const earlyMultiplier = clamp(1 + minutesBeforeLock / 60, 1, 2);
  const contrarianMultiplier = clamp(1 / Math.sqrt(Math.max(entrySignal, 0.01)), 1, 3);
  const roleBonus = 1;
  return Math.round(correctnessBase * stakeDisciplineMultiplier * earlyMultiplier * contrarianMultiplier * roleBonus);
}

export function leaderboard(store: Store, eventSlug = DEFAULT_EVENT_SLUG): LeaderboardRow[] {
  const event = getEventOrThrow(store, eventSlug);
  return store.participants
    .filter((participant) => participant.eventId === event.id && !participant.isBanned)
    .map((participant) => {
      const actions = store.predictionActions.filter((action) => action.participantId === participant.id && action.actionType !== "admin_void");
      const lifetimeCommitted = actions.reduce((sum, action) => sum + Math.max(0, action.amountCredits), 0);
      const stats = participantLeaderboardStats(store, participant.id);
      const correctMarkets = store.markets.filter(
        (market) =>
          market.status === "resolved" &&
          store.positions.some(
            (position) =>
              position.participantId === participant.id &&
              position.marketId === market.id &&
              position.outcomeId === market.resolvedOutcomeId
          )
      ).length;
      return {
        id: participant.id,
        nickname: participant.nickname,
        role: participant.role,
        participantType: participant.participantType,
        avatarUrl: participant.isAvatarHidden ? undefined : participant.avatarUrl,
        oracleScore: participant.oracleScore,
        predictions: actions.length,
        correctMarkets,
        efficiency: lifetimeCommitted > 0 ? participant.oracleScore / lifetimeCommitted : participant.oracleScore,
        earlyScore: Math.round(stats.earlyScore),
        contrarianScore: Math.round(stats.contrarianScore)
      };
    })
    .sort((a, b) => b.oracleScore - a.oracleScore || b.efficiency - a.efficiency || a.nickname.localeCompare(b.nickname));
}

export function leaderboardGroups(store: Store, eventSlug = DEFAULT_EVENT_SLUG): LeaderboardGroups {
  const overall = leaderboard(store, eventSlug);
  const scored = overall.filter((row) => row.oracleScore > 0);
  const byRole = (["builder", "sponsor", "investor", "other"] as Role[]).reduce<LeaderboardGroups["byRole"]>(
    (acc, role) => {
      acc[role] = scored.filter((row) => row.role === role);
      return acc;
    },
    { builder: [], sponsor: [], investor: [], other: [] }
  );
  return {
    overall,
    byRole,
    humans: scored.filter((row) => row.participantType === "human"),
    agents: scored.filter((row) => row.participantType !== "human"),
    earlyCallers: [...scored]
      .filter((row) => row.earlyScore > 0)
      .sort((a, b) => b.earlyScore - a.earlyScore || b.oracleScore - a.oracleScore || a.nickname.localeCompare(b.nickname)),
    contrarianCalls: [...scored]
      .filter((row) => row.contrarianScore > 0)
      .sort((a, b) => b.contrarianScore - a.contrarianScore || b.oracleScore - a.oracleScore || a.nickname.localeCompare(b.nickname))
  };
}

export function createPurchase(store: Store, participantId: string) {
  const purchase: Purchase = {
    id: makeId("pur"),
    participantId,
    status: "pending",
    amountEur: TEST_CHECKOUT_EUR,
    currency: "EUR",
    credits: TEST_CHECKOUT_CREDITS,
    createdAt: nowIso()
  };
  store.purchases.push(purchase);
  return purchase;
}

export function recordCheckoutIntent(store: Store, participantId: string, purchaseId?: string) {
  const participant = store.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error("Participant not found");
  const now = nowIso();
  const existing = store.checkoutIntents.find(
    (intent) => intent.eventId === participant.eventId && intent.participantId === participant.id
  );
  if (existing) {
    existing.lastClickedAt = now;
    existing.clickCount += 1;
    if (purchaseId) existing.purchaseId = purchaseId;
    return existing;
  }
  const intent: CheckoutIntent = {
    id: makeId("cki"),
    eventId: participant.eventId,
    participantId: participant.id,
    firstClickedAt: now,
    lastClickedAt: now,
    clickCount: 1,
    amountEur: TEST_CHECKOUT_EUR,
    credits: TEST_CHECKOUT_CREDITS,
    purchaseId
  };
  store.checkoutIntents.push(intent);
  return intent;
}

export function linkCheckoutIntentToPurchase(store: Store, participantId: string, purchaseId: string) {
  const participant = store.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error("Participant not found");
  const intent = store.checkoutIntents.find(
    (item) => item.eventId === participant.eventId && item.participantId === participant.id
  );
  if (!intent) return recordCheckoutIntent(store, participantId, purchaseId);
  intent.purchaseId = purchaseId;
  intent.lastClickedAt = nowIso();
  return intent;
}

export function creditPaidPurchase(store: Store, purchaseId: string, status: "paid" | "failed" | "canceled" = "paid", auditIp?: string) {
  const purchase = store.purchases.find((item) => item.id === purchaseId || item.molliePaymentId === purchaseId);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.status === "credited") return { purchase, credited: false };
  if (status !== "paid") {
    const previousStatus = purchase.status;
    purchase.status = status;
    if (previousStatus !== status) {
      createAuditLog(store, {
        action: "payment_status",
        entityType: "purchase",
        entityId: purchase.id,
        details: { previousStatus, status: purchase.status },
        ip: auditIp
      });
    }
    return { purchase, credited: false };
  }
  purchase.status = "paid";
  purchase.paidAt = purchase.paidAt || nowIso();
  const existingLedger = store.ledgerEntries.find((entry) => entry.purchaseId === purchase.id && entry.type === "test_checkout_credit");
  if (existingLedger) {
    purchase.status = "credited";
    purchase.creditedAt = purchase.creditedAt || existingLedger.createdAt;
    return { purchase, credited: false };
  }
  const wallet = store.wallets.find((item) => item.participantId === purchase.participantId);
  if (!wallet) throw new Error("Wallet not found");
  wallet.balanceCredits += purchase.credits;
  wallet.totalIssuedCredits += purchase.credits;
  purchase.status = "credited";
  purchase.creditedAt = nowIso();
  store.ledgerEntries.push({
    id: makeId("led"),
    participantId: purchase.participantId,
    type: "test_checkout_credit",
    amountCredits: purchase.credits,
    direction: "credit",
    balanceAfter: wallet.balanceCredits,
    idempotencyKey: purchase.id,
    reason: "Mollie test checkout completed",
    purchaseId: purchase.id,
    metadata: { purchaseId: purchase.id },
    createdAt: purchase.creditedAt
  });
  createAuditLog(store, {
    action: "payment_credit",
    entityType: "purchase",
    entityId: purchase.id,
    details: { credits: purchase.credits, status: purchase.status },
    ip: auditIp
  });
  return { purchase, credited: true };
}

export function upsertHouseAgents(store: Store, eventSlug = DEFAULT_EVENT_SLUG) {
  const event = getEventOrThrow(store, eventSlug);
  const definitions: Array<{ name: string; role: Role; strategy: AgentProfile["strategy"] }> = [
    { name: "Builder Agent", role: "builder", strategy: "builder_bias" },
    { name: "Sponsor Agent", role: "sponsor", strategy: "sponsor_bias" },
    { name: "Investor Agent", role: "investor", strategy: "investor_bias" },
    { name: "Skeptic Agent", role: "other", strategy: "skeptic" },
    { name: "Chaos Agent", role: "other", strategy: "chaos" }
  ];
  const agents: AgentProfile[] = [];
  for (const definition of definitions) {
    let agent = store.agentProfiles.find((item) => item.eventId === event.id && item.name === definition.name);
    if (!agent) {
      const participantId = makeId("agtpar");
      const now = nowIso();
      const participant: Participant = {
        id: participantId,
        eventId: event.id,
        participantType: "house_agent",
        nickname: definition.name,
        role: definition.role,
        isAvatarHidden: false,
        isBanned: false,
        oracleScore: 0,
        createdAt: now
      };
      store.participants.push(participant);
      store.wallets.push({
        participantId,
        balanceCredits: STARTER_CREDITS,
        totalIssuedCredits: STARTER_CREDITS,
        totalCommittedCredits: 0
      });
      agent = {
        id: makeId("agent"),
        eventId: event.id,
        participantId,
        name: definition.name,
        strategy: definition.strategy,
        createdAt: now
      };
      store.agentProfiles.push(agent);
    }
    agents.push(agent);
  }
  return agents;
}

export function chooseHouseAgentMove(store: Store, input: { eventSlug: string; agentId?: string; marketId: string }) {
  const event = getEventOrThrow(store, input.eventSlug);
  const agents = store.agentProfiles.filter((item) => item.eventId === event.id);
  const market = store.markets.find((item) => item.id === input.marketId);
  if (!market) throw new Error("Market not found");
  const agent = input.agentId ? agents.find((item) => item.id === input.agentId) : agents[Math.floor(Math.random() * agents.length)];
  if (!agent) throw new Error("Agent not found");
  const outcomes = outcomesForMarket(store, market.id);
  const aggregate = getAggregate(store, market.id);
  let chosen = outcomes[0];
  if (agent.strategy === "skeptic") {
    chosen = outcomes.reduce((least, outcome) =>
      (aggregate.outcomePeopleCounts[outcome.id] || 0) < (aggregate.outcomePeopleCounts[least.id] || 0) ? outcome : least
    , outcomes[0]);
  } else if (agent.strategy === "chaos") {
    chosen = outcomes[Math.floor(Math.random() * outcomes.length)];
  } else {
    chosen = outcomes.reduce((most, outcome) =>
      (aggregate.outcomePeopleCounts[outcome.id] || 0) > (aggregate.outcomePeopleCounts[most.id] || 0) ? outcome : most
    , outcomes[0]);
  }
  const allowed = calculateAllowedStake(store, { participantId: agent.participantId, marketId: market.id, outcomeId: chosen.id });
  const amount = allowed.fairLaunch ? INITIAL_STAKE_AMOUNT : Math.min(INITIAL_STAKE_AMOUNT, allowed.allowedAdd);
  return { agent, market, outcome: chosen, allowed, amount };
}

export function runHouseAgent(store: Store, input: { eventSlug: string; agentId?: string; marketId: string }) {
  upsertHouseAgents(store, input.eventSlug);
  const { agent, market, outcome, allowed, amount } = chooseHouseAgentMove(store, input);
  const run: AgentRun = {
    id: makeId("run"),
    agentProfileId: agent.id,
    marketId: market.id,
    outcomeId: outcome.id,
    status: "planned",
    note: "",
    createdAt: nowIso()
  };
  try {
    if (amount <= 0) throw new Error(allowed.reason);
    placePrediction(store, { participantId: agent.participantId, marketId: market.id, outcomeId: outcome.id, amountCredits: amount });
    run.status = "placed";
    run.note = `${agent.name} committed ${amount} MegaBucks to ${outcome.label}.`;
  } catch (error) {
    run.status = "skipped";
    run.note = error instanceof Error ? error.message : "Agent skipped.";
  }
  store.agentRuns.push(run);
  return run;
}

export function paymentMetrics(store: Store, participantIds?: Set<string>) {
  const purchases = participantIds
    ? store.purchases.filter((purchase) => participantIds.has(purchase.participantId))
    : store.purchases;
  const checkoutIntents = participantIds
    ? store.checkoutIntents.filter((intent) => participantIds.has(intent.participantId))
    : store.checkoutIntents;
  const byStatus = purchases.reduce<Record<string, number>>((acc, purchase) => {
    acc[purchase.status] = (acc[purchase.status] || 0) + 1;
    return acc;
  }, {});
  const credited = purchases.filter((purchase) => purchase.status === "credited");
  return {
    byStatus,
    completed: credited.length,
    creditsIssued: credited.reduce((sum, purchase) => sum + purchase.credits, 0),
    projectedEur: credited.reduce((sum, purchase) => sum + purchase.amountEur, 0),
    intentCount: checkoutIntents.length,
    intentClicks: checkoutIntents.reduce((sum, intent) => sum + intent.clickCount, 0),
    intentProjectedEur: checkoutIntents.reduce((sum, intent) => sum + intent.amountEur, 0)
  };
}

export function dashboardMetrics(store: Store, eventSlug = DEFAULT_EVENT_SLUG) {
  const event = getEventOrThrow(store, eventSlug);
  const eventMarkets = store.markets.filter((market) => market.eventId === event.id);
  const eventMarketIds = new Set(eventMarkets.map((market) => market.id));
  const activeMarketIds = new Set(eventMarkets.filter((market) => market.status !== "voided").map((market) => market.id));
  const eventParticipants = store.participants.filter((participant) => participant.eventId === event.id);
  const eventParticipantIds = new Set(eventParticipants.map((participant) => participant.id));
  const participants = store.participants.filter((participant) => participant.eventId === event.id && participant.participantType === "human");
  const participantIds = new Set(participants.map((participant) => participant.id));
  const eventActions = store.predictionActions.filter(
    (action) => eventMarketIds.has(action.marketId) && action.actionType !== "admin_void"
  );
  const humanActions = eventActions.filter((action) => participantIds.has(action.participantId));
  const totalCommitted = store.wallets
    .filter((wallet) => eventParticipantIds.has(wallet.participantId))
    .reduce((sum, wallet) => sum + wallet.totalCommittedCredits, 0);
  const feeCredits = store.positions
    .filter((position) => activeMarketIds.has(position.marketId) && eventParticipantIds.has(position.participantId))
    .reduce((sum, position) => sum + position.feeCredits, 0);
  const firstPredictionParticipants = new Set(humanActions.map((action) => action.participantId));
  return {
    event,
    totalParticipants: participants.length,
    activeMarkets: eventMarkets.filter((market) => market.status === "open").length,
    predictionsSubmitted: eventActions.length,
    creditsCommitted: totalCommitted,
    virtualProvisionCredits: feeCredits,
    testCheckouts: paymentMetrics(store, eventParticipantIds),
    predictionsPerParticipant: participants.length > 0 ? humanActions.length / participants.length : 0,
    scanToFirstPrediction: participants.length > 0 ? firstPredictionParticipants.size / participants.length : 0
  };
}

export function roleWinnerLabel(store: Store, marketId: string, role: Role) {
  const aggregate = getAggregate(store, marketId);
  const entries = Object.entries(aggregate.roleBreakdown[role] || {});
  if (entries.length === 0) return "pure chaos";
  const [outcomeId, count] = entries.sort((a, b) => b[1] - a[1])[0];
  if (count <= 0) return "pure chaos";
  return store.outcomes.find((outcome) => outcome.id === outcomeId)?.label || "pure chaos";
}

export function participantReceipt(store: Store, participantId: string | undefined, receiptId: string) {
  const action = store.predictionActions.find((item) => item.id === receiptId);
  const targetParticipant = action
    ? store.participants.find((item) => item.id === action.participantId)
    : store.participants.find((item) => item.id === participantId || item.id === receiptId);
  if (!targetParticipant) return null;
  if (targetParticipant.isBanned) return null;
  const receipt = action
    ? receiptActionsForParticipant(store, targetParticipant.id, action.marketId).find((item) => item.action.id === action.id)
    : receiptActionsForParticipant(store, targetParticipant.id)[0];
  if (!receipt) return { participant: targetParticipant };
  const market = receipt.market;
  const outcome = store.outcomes.find((item) => item.id === receipt.action.outcomeId);
  const peopleAtCall = market.resolvedOutcomeId ? receipt.action.peopleSignalSnapshot[market.resolvedOutcomeId] || 0 : 0;
  const closingStageSignal = market.resolvedOutcomeId ? receipt.action.closingStageSignalSnapshot?.[market.resolvedOutcomeId] : undefined;
  const oracleScore = oracleScoreForReceiptAction(receipt.action, receipt.minutesBeforeLock, receipt.entryStageSignal);
  return { participant: targetParticipant, market, outcome, peopleAtCall, closingStageSignal, oracleScore };
}

export type { ParticipantType };
