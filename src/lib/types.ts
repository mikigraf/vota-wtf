export type Role = "builder" | "sponsor" | "investor" | "other";
export type ParticipantType = "human" | "house_agent" | "external_agent";
export type MarketStatus = "draft" | "open" | "locked" | "resolved" | "voided";
export type StageMode =
  | "join"
  | "live"
  | "role_battle"
  | "humans_vs_agents"
  | "leaderboard"
  | "resolution";
export type PurchaseStatus = "pending" | "paid" | "credited" | "failed" | "canceled";

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "live" | "paused" | "finished";
  starterCredits: number;
  emergencyPaused: boolean;
  stageMode: StageMode;
  featuredMarketId?: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  eventId: string;
  participantType: ParticipantType;
  nickname: string;
  role: Role;
  avatarUrl?: string;
  isAvatarHidden: boolean;
  isBanned: boolean;
  oracleScore: number;
  createdAt: string;
}

export interface ParticipantSession {
  id: string;
  participantId: string;
  eventId: string;
  guardKeyHash?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Wallet {
  participantId: string;
  balanceCredits: number;
  totalIssuedCredits: number;
  totalCommittedCredits: number;
}

export interface Market {
  id: string;
  eventId: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  status: MarketStatus;
  resolutionRule: string;
  resolvedOutcomeId?: string;
  resolutionNote?: string;
  showOnStage: boolean;
  fairLaunchOverride: boolean;
  fairLaunchPeopleThreshold: number;
  fairLaunchSignalCreditsThreshold: number;
  maxActionStake: number;
  allowSwitching: boolean;
  blindLaunchEnabled: boolean;
  blindLaunchPredictionThreshold: number;
  blindLaunchSeconds: number;
  blindLaunchEndedAt?: string;
  openedAt?: string;
  lockedAt?: string;
  resolvedAt?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Outcome {
  id: string;
  marketId: string;
  label: string;
  imageUrl?: string;
  icon?: string;
}

export interface Position {
  id: string;
  participantId: string;
  marketId: string;
  outcomeId: string;
  rawCredits: number;
  signalCredits: number;
  feeCredits: number;
  lastActionAt: string;
  createdAt: string;
  updatedAt: string;
}

export type PredictionActionType = "initial" | "add" | "switch" | "admin_void";

export interface PredictionAction {
  id: string;
  participantId: string;
  marketId: string;
  outcomeId: string;
  requestId?: string;
  actionType: PredictionActionType;
  amountCredits: number;
  signalCredits: number;
  feeCredits: number;
  peopleSignalSnapshot: Record<string, number>;
  creditSignalSnapshot: Record<string, number>;
  convictionSignalSnapshot: Record<string, number>;
  stageSignalSnapshot: Record<string, number>;
  closingStageSignalSnapshot?: Record<string, number>;
  createdAt: string;
}

export type LedgerEntryType =
  | "starter_credit"
  | "prediction_commit"
  | "test_checkout_credit"
  | "void_refund"
  | "resolution_credit";

export interface LedgerEntry {
  id: string;
  participantId: string;
  type: LedgerEntryType;
  amountCredits: number;
  direction?: "credit" | "debit";
  balanceAfter?: number;
  idempotencyKey?: string;
  reason: string;
  marketId?: string;
  purchaseId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MarketAggregate {
  marketId: string;
  totalPeople: number;
  totalSignalCredits: number;
  outcomePeopleCounts: Record<string, number>;
  outcomeCreditTotals: Record<string, number>;
  roleBreakdown: Record<Role, Record<string, number>>;
  agentBreakdown: {
    human: Record<string, number>;
    agent: Record<string, number>;
  };
  updatedAt: string;
}

export interface Purchase {
  id: string;
  participantId: string;
  status: PurchaseStatus;
  amountEur: number;
  currency: "EUR";
  credits: number;
  molliePaymentId?: string;
  checkoutUrl?: string;
  createdAt: string;
  paidAt?: string;
  creditedAt?: string;
}

export interface CheckoutIntent {
  id: string;
  eventId: string;
  participantId: string;
  firstClickedAt: string;
  lastClickedAt: string;
  clickCount: number;
  amountEur: number;
  credits: number;
  purchaseId?: string;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface AgentProfile {
  id: string;
  eventId: string;
  participantId: string;
  name: string;
  strategy: "builder_bias" | "sponsor_bias" | "investor_bias" | "skeptic" | "chaos";
  createdAt: string;
}

export interface AgentRun {
  id: string;
  agentProfileId: string;
  marketId: string;
  outcomeId?: string;
  status: "planned" | "placed" | "skipped" | "failed";
  note: string;
  createdAt: string;
}

export interface McpToken {
  id: string;
  participantId?: string;
  tokenHash: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Store {
  events: EventRecord[];
  participants: Participant[];
  participantSessions: ParticipantSession[];
  wallets: Wallet[];
  markets: Market[];
  outcomes: Outcome[];
  positions: Position[];
  predictionActions: PredictionAction[];
  ledgerEntries: LedgerEntry[];
  marketAggregates: MarketAggregate[];
  purchases: Purchase[];
  checkoutIntents: CheckoutIntent[];
  adminAuditLogs: AdminAuditLog[];
  agentProfiles: AgentProfile[];
  agentRuns: AgentRun[];
  mcpTokens: McpToken[];
}

export interface PublicOutcomeState {
  id: string;
  label: string;
  imageUrl?: string;
  icon?: string;
  peopleSignal: number;
  creditSignal: number;
  convictionSignal: number;
  stageSignal: number;
  humanSignal: number;
  agentSignal: number;
  combinedSignal: number;
  peopleCount: number;
  humanCount: number;
  agentCount: number;
  signalCredits: number;
}

export interface OddsHistoryPoint {
  at: string;
  outcomeSignals: Record<
    string,
    {
      peopleSignal: number;
      creditSignal: number;
      convictionSignal: number;
      stageSignal: number;
      signalCredits: number;
    }
  >;
}

export interface PublicMarketState {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  showOnStage: boolean;
  status: MarketStatus;
  resolutionRule: string;
  resolvedOutcomeId?: string;
  resolutionNote?: string;
  totalParticipants: number;
  totalSignalCredits: number;
  blindLaunch: {
    active: boolean;
    predictedCount: number;
    unlocksAtPredictionCount: number;
    remainingPredictions: number;
    unlocksAt?: string;
    endedAt?: string;
  };
  oddsHistory: OddsHistoryPoint[];
  outcomes: PublicOutcomeState[];
}

export interface PublicEventState {
  event: {
    slug: string;
    name: string;
    status: EventRecord["status"];
    stageMode: StageMode;
    featuredMarketId?: string;
    emergencyPaused: boolean;
  };
  markets: PublicMarketState[];
  roleWinners: Record<Role, string>;
}

export interface UserMarketState {
  participant?: Participant;
  wallet?: Wallet;
  position?: Position & { outcomeLabel?: string };
  allowedByOutcome: Record<string, {
    allowedAdd: number;
    postCooldownAllowedAdd: number;
    reason: string;
    fairLaunch: boolean;
    minInitial: number;
    cooldownRemainingSeconds: number;
  }>;
  receiptId?: string;
}

export interface PredictionPreview {
  outcomeId: string;
  amountCredits: number;
  allowedAdd: number;
  blocked: boolean;
  reason: string;
  before: {
    peopleSignal: number;
    creditSignal: number;
    convictionSignal: number;
    stageSignal: number;
  };
  after: {
    peopleSignal: number;
    creditSignal: number;
    convictionSignal: number;
    stageSignal: number;
  };
  movement: number;
}

export interface LeaderboardRow {
  id: string;
  nickname: string;
  role: Role;
  participantType: ParticipantType;
  avatarUrl?: string;
  oracleScore: number;
  predictions: number;
  correctMarkets: number;
  efficiency: number;
  earlyScore: number;
  contrarianScore: number;
}

export interface LeaderboardGroups {
  overall: LeaderboardRow[];
  byRole: Record<Role, LeaderboardRow[]>;
  humans: LeaderboardRow[];
  agents: LeaderboardRow[];
  earlyCallers: LeaderboardRow[];
  contrarianCalls: LeaderboardRow[];
}
