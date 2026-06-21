import { DEFAULT_EVENT_SLUG } from "./constants";
import { dashboardMetrics, getAggregate } from "./store";
import type { Market, Outcome, Store } from "./types";

export interface MarketReportRow {
  id: string;
  title: string;
  status: Market["status"];
  category: string;
  people: number;
  signalCredits: number;
  predictionActions: number;
  topPeopleOutcome: string;
  topCreditOutcome: string;
  humanAgentDelta: number;
  whaleGuardShare: number;
  fairLaunchComplete: boolean;
}

export interface CalaContextPack {
  marketId: string;
  title: string;
  contextSummary: string;
  roomThesis: string;
  agentContrast: string;
  operatorPrompt: string;
  sourceFacts: string[];
}

export interface PixVersePromoBrief {
  marketId: string;
  title: string;
  prompt: string;
  shots: string[];
  onScreenText: string[];
}

export interface AdvancedAnalyticsReport {
  event: {
    slug: string;
    name: string;
    stageMode: string;
    status: string;
  };
  generatedAt: string;
  overview: ReturnType<typeof dashboardMetrics>;
  funnel: {
    scanned: number;
    predicted: number;
    checkedOut: number;
    resolvedWinners: number;
    scanToPredictionRate: number;
    checkoutRate: number;
  };
  markets: MarketReportRow[];
  calaContextPacks: CalaContextPack[];
  pixVersePromoBriefs: PixVersePromoBrief[];
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function percentLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function outcomeLabel(outcomes: Outcome[], outcomeId?: string) {
  if (!outcomeId) return "No signal yet";
  return outcomes.find((outcome) => outcome.id === outcomeId)?.label || "Unknown outcome";
}

function topOutcomeId(totals: Record<string, number>) {
  return Object.entries(totals)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
}

function eventScope(store: Store, eventSlug: string) {
  const event = store.events.find((item) => item.slug === eventSlug);
  if (!event) throw new Error("Event not found");
  const markets = store.markets.filter((market) => market.eventId === event.id);
  const marketIds = new Set(markets.map((market) => market.id));
  const participants = store.participants.filter((participant) => participant.eventId === event.id);
  const participantIds = new Set(participants.map((participant) => participant.id));
  const humans = participants.filter((participant) => participant.participantType === "human");
  const humanIds = new Set(humans.map((participant) => participant.id));
  const actions = store.predictionActions.filter(
    (action) => marketIds.has(action.marketId) && action.actionType !== "admin_void"
  );
  return { event, markets, marketIds, participants, participantIds, humans, humanIds, actions };
}

function humanAgentDivergence(human: Record<string, number>, agent: Record<string, number>) {
  const outcomeIds = new Set([...Object.keys(human), ...Object.keys(agent)]);
  return [...outcomeIds].reduce((sum, outcomeId) => sum + Math.abs((human[outcomeId] || 0) - (agent[outcomeId] || 0)), 0);
}

function marketReportRows(store: Store, eventSlug: string): MarketReportRow[] {
  const { markets, actions } = eventScope(store, eventSlug);
  return markets.map((market) => {
    const aggregate = getAggregate(store, market.id);
    const outcomes = store.outcomes.filter((outcome) => outcome.marketId === market.id);
    const topPeople = topOutcomeId(aggregate.outcomePeopleCounts);
    const topCredit = topOutcomeId(aggregate.outcomeCreditTotals);
    const marketActions = actions.filter((action) => action.marketId === market.id);
    const largestPosition = store.positions
      .filter((position) => position.marketId === market.id)
      .reduce((max, position) => Math.max(max, position.signalCredits), 0);
    return {
      id: market.id,
      title: market.title,
      status: market.status,
      category: market.category,
      people: aggregate.totalPeople,
      signalCredits: aggregate.totalSignalCredits,
      predictionActions: marketActions.length,
      topPeopleOutcome: outcomeLabel(outcomes, topPeople),
      topCreditOutcome: outcomeLabel(outcomes, topCredit),
      humanAgentDelta: humanAgentDivergence(aggregate.agentBreakdown.human, aggregate.agentBreakdown.agent),
      whaleGuardShare: aggregate.totalSignalCredits > 0 ? largestPosition / aggregate.totalSignalCredits : 0,
      fairLaunchComplete:
        aggregate.totalPeople >= market.fairLaunchPeopleThreshold ||
        aggregate.totalSignalCredits >= market.fairLaunchSignalCreditsThreshold ||
        market.fairLaunchOverride
    };
  });
}

function calaContextPacks(store: Store, eventSlug: string): CalaContextPack[] {
  const rows = marketReportRows(store, eventSlug).filter((market) => market.status !== "draft");
  return rows.map((market) => ({
    marketId: market.id,
    title: market.title,
    contextSummary: `${market.title} is ${market.status} with ${market.people} people and ${market.signalCredits} signal MegaBucks committed.`,
    roomThesis:
      market.people > 0
        ? `The room currently leans toward ${market.topPeopleOutcome}; MegaBuck-weighted conviction leans toward ${market.topCreditOutcome}.`
        : "No public room thesis yet; use this as a clean setup card before scanning starts.",
    agentContrast:
      market.humanAgentDelta > 0
        ? `Human and agent participation differ by ${market.humanAgentDelta} active positions. Keep the human layer primary.`
        : "Human and agent layers are currently aligned or inactive.",
    operatorPrompt: `Use Cala context to brief the host: explain ${market.title}, call out ${market.topPeopleOutcome}, and remind the room that MegaBucks stay inside the game.`,
    sourceFacts: [
      `Status: ${market.status}`,
      `Category: ${market.category}`,
      `People signal leader: ${market.topPeopleOutcome}`,
      `MegaBuck signal leader: ${market.topCreditOutcome}`,
      `Fair launch complete: ${market.fairLaunchComplete ? "yes" : "no"}`,
      `Largest position share: ${percentLabel(market.whaleGuardShare)}`
    ]
  }));
}

function pixVersePromoBriefs(store: Store, eventSlug: string, eventName: string): PixVersePromoBrief[] {
  const rows = marketReportRows(store, eventSlug).filter((market) => market.status !== "draft");
  return rows.map((market) => ({
    marketId: market.id,
    title: market.title,
    prompt:
      `Create a fast 9:16 event promo for vota.wtf at ${eventName}. Show a QR scan, prediction cards, live signal bars, ` +
      `${market.topPeopleOutcome} as the room signal, and a final reputation receipt. Use energetic stage lighting and crisp UI overlays.`,
    shots: [
      "Phone scans the stage QR and opens vota.wtf.",
      "Participant commits MegaBucks to a prediction card.",
      `Stage bars move toward ${market.topPeopleOutcome}.`,
      "Admin locks and resolves the market.",
      "Animated receipt appears with Oracle Score."
    ],
    onScreenText: [
      "WTF does the room believe?",
      `${market.people} people in`,
      `${market.signalCredits} signal MegaBucks`,
      "Reputation only.",
      "I called it. You saw it first."
    ]
  }));
}

export function buildAdvancedAnalyticsReport(store: Store, eventSlug = DEFAULT_EVENT_SLUG): AdvancedAnalyticsReport {
  const scope = eventScope(store, eventSlug);
  const overview = dashboardMetrics(store, eventSlug);
  const predictedHumanIds = new Set(
    scope.actions.filter((action) => scope.humanIds.has(action.participantId)).map((action) => action.participantId)
  );
  const checkoutHumanIds = new Set(
    store.purchases
      .filter((purchase) => purchase.status === "credited" && scope.humanIds.has(purchase.participantId))
      .map((purchase) => purchase.participantId)
  );
  const markets = marketReportRows(store, eventSlug);
  return {
    event: {
      slug: scope.event.slug,
      name: scope.event.name,
      stageMode: scope.event.stageMode,
      status: scope.event.status
    },
    generatedAt: new Date().toISOString(),
    overview,
    funnel: {
      scanned: scope.humans.length,
      predicted: predictedHumanIds.size,
      checkedOut: checkoutHumanIds.size,
      resolvedWinners: scope.markets.filter((market) => market.status === "resolved").length,
      scanToPredictionRate: ratio(predictedHumanIds.size, scope.humans.length),
      checkoutRate: ratio(checkoutHumanIds.size, scope.humans.length)
    },
    markets,
    calaContextPacks: calaContextPacks(store, eventSlug),
    pixVersePromoBriefs: pixVersePromoBriefs(store, eventSlug, scope.event.name)
  };
}

export function analyticsReportRows(report: AdvancedAnalyticsReport) {
  const overviewRows = [
    ["overview", "Participants", "count", report.overview.totalParticipants, ""],
    ["overview", "Prediction actions", "count", report.overview.predictionsSubmitted, ""],
    ["overview", "Committed MegaBucks", "mbucks", report.overview.creditsCommitted, ""],
    ["overview", "Platform provision", "mbucks", report.overview.virtualProvisionCredits, ""],
    ["overview", "Scan to prediction", "rate", report.funnel.scanToPredictionRate, ""],
    ["overview", "Checkout conversion", "rate", report.funnel.checkoutRate, ""]
  ];
  const marketRows = report.markets.map((market) => [
    "market",
    market.title,
    market.status,
    market.signalCredits,
    `${market.people} people, people leader ${market.topPeopleOutcome}, credit leader ${market.topCreditOutcome}`
  ]);
  return [...overviewRows, ...marketRows].map(([section, name, metric, value, detail]) => ({
    section,
    name,
    metric,
    value,
    detail
  }));
}
