import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest, verifyBearerToken } from "./auth";
import { DEFAULT_EVENT_SLUG, TEST_CHECKOUT_CREDITS, TEST_CHECKOUT_EUR } from "./constants";
import {
  calculateAllowedStake,
  chooseHouseAgentMove,
  createMarket,
  createParticipantSession,
  createPurchase,
  createAuditLog,
  createSeedStore,
  creditPaidPurchase,
  getEventOrThrow,
  getSessionParticipantByGuard,
  getSessionParticipant,
  leaderboardGroups,
  mutateStore,
  placePrediction,
  predictionPreview,
  publicState,
  readStore,
  recomputeMarketAggregate,
  resolveMarket,
  runHouseAgent,
  transitionMarket,
  updateMarket,
  updateParticipantProfile,
  upsertHouseAgents,
  userMarketState
} from "./store";
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
  McpToken,
  Outcome,
  Participant,
  ParticipantSession,
  Position,
  PredictionAction,
  PublicEventState,
  Purchase,
  Role,
  Store,
  StageMode,
  UserMarketState,
  PredictionPreview,
  Wallet
} from "./types";
import { makeId, normalizeNickname, normalizeRole, nowIso } from "./utils";

type Row = Record<string, any>;
type PaymentStatus = "paid" | "failed" | "canceled";
type ParticipantModerationAction = "rename" | "hide_avatar" | "show_avatar" | "ban" | "unban";
type MarketOutcomeInput = { id?: string; label: string; imageUrl?: string; icon?: string };
type MarketWriteInput = {
  eventSlug: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string;
  resolutionRule: string;
  outcomes?: MarketOutcomeInput[];
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
  clearBlindLaunchEndedAt?: boolean;
  auditIp?: string;
};

function mcpTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const TABLES = [
  "events",
  "participants",
  "participant_sessions",
  "wallets",
  "markets",
  "outcomes",
  "positions",
  "prediction_actions",
  "ledger_entries",
  "market_aggregates",
  "purchases",
  "admin_audit_logs",
  "agent_profiles",
  "agent_runs",
  "mcp_tokens"
] as const;

function emptyDataStore(): Store {
  return {
    events: [],
    participants: [],
    participantSessions: [],
    wallets: [],
    markets: [],
    outcomes: [],
    positions: [],
    predictionActions: [],
    ledgerEntries: [],
    marketAggregates: [],
    purchases: [],
    adminAuditLogs: [],
    agentProfiles: [],
    agentRuns: [],
    mcpTokens: []
  };
}

function configuredForSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function useSupabaseStore() {
  const requested = process.env.VOTA_DATA_BACKEND;
  if (requested === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("VOTA_DATA_BACKEND=local is only allowed outside production. Use Supabase for the live product.");
    }
    return false;
  }
  if (requested === "supabase") {
    if (!configuredForSupabase()) throw new Error("VOTA_DATA_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    return true;
  }
  if (process.env.NODE_ENV === "production") {
    if (!configuredForSupabase()) {
      throw new Error("Production requires Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    return true;
  }
  return false;
}

function supabaseBaseUrl() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase backend requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return url.replace(/\/$/, "");
}

async function supabaseFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseBaseUrl()}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) return null as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

function withPage(query: string, limit: number, offset: number) {
  const separator = query.length > 0 ? "&" : "";
  return `${query}${separator}limit=${limit}&offset=${offset}`;
}

async function selectRows(table: string, query = "select=*") {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseFetch<Row[]>(`/${table}?${withPage(query, pageSize, offset)}`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function upsertRows(table: string, rows: Row[], conflict = "id", ignoreDuplicates = false) {
  if (rows.length === 0) return;
  await supabaseFetch(`/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: {
      Prefer: `${ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates"},return=minimal`
    },
    body: JSON.stringify(rows)
  });
}

async function patchRows(table: string, filter: string, row: Row) {
  await supabaseFetch(`/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row)
  });
}

async function patchRowsReturning(table: string, filter: string, row: Row) {
  return supabaseFetch<Row[]>(`/${table}?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row)
  });
}

async function deleteByIds(table: string, ids: string[]) {
  if (ids.length === 0) return;
  await supabaseFetch(`/${table}?id=in.(${ids.join(",")})`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

function changedRows<T>(before: T[], after: T[], key: (item: T) => string, toRow: (item: T) => Row) {
  const beforeRows = new Map(before.map((item) => [key(item), JSON.stringify(toRow(item))]));
  return after
    .map((item) => ({ item, row: toRow(item), key: key(item) }))
    .filter(({ row, key: rowKey }) => beforeRows.get(rowKey) !== JSON.stringify(row))
    .map(({ row }) => row);
}

function newRows<T>(before: T[], after: T[], key: (item: T) => string, toRow: (item: T) => Row) {
  const beforeKeys = new Set(before.map(key));
  return after.filter((item) => !beforeKeys.has(key(item))).map(toRow);
}

function changedExistingRows<T>(
  before: T[],
  after: T[],
  key: (item: T) => string,
  toComparableRow: (item: T) => Row,
  toPatchRow: (item: T) => Row
) {
  const beforeRows = new Map(before.map((item) => [key(item), JSON.stringify(toComparableRow(item))]));
  const beforeItems = new Map(before.map((item) => [key(item), item]));
  return after
    .filter((item) => beforeRows.has(key(item)))
    .map((item) => ({ item, row: toPatchRow(item), comparableRow: toComparableRow(item), rowKey: key(item) }))
    .filter(({ comparableRow, rowKey }) => beforeRows.get(rowKey) !== JSON.stringify(comparableRow))
    .map(({ rowKey, row }) => ({ id: rowKey, row, previous: beforeItems.get(rowKey) as T }));
}

async function patchChangedRows(table: string, rows: Array<{ id: string; row: Row }>, keyColumn = "id") {
  for (const item of rows) {
    await patchRows(table, `${keyColumn}=eq.${encodeURIComponent(item.id)}`, item.row);
  }
}

async function patchChangedMarketRows(rows: Array<{ id: string; row: Row; previous: Market }>) {
  for (const item of rows) {
    const result = await patchRowsReturning(
      "markets",
      `id=eq.${encodeURIComponent(item.id)}&updated_at=eq.${encodeURIComponent(item.previous.updatedAt)}`,
      item.row
    );
    if (result.length !== 1) throw new Error("Market changed since this form loaded. Refresh and try again.");
  }
}

async function rpc<T = any>(name: string, body: Row) {
  return supabaseFetch<T>(`/rpc/${name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
}

function hashThrottleKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function adminLoginThrottleStatusData(key: string) {
  if (!useSupabaseStore()) return null;
  const result = await rpc<Row>("check_admin_login_throttle", {
    p_key_hash: hashThrottleKey(key)
  }).catch((error) => {
    if (process.env.NODE_ENV === "production") throw error;
    return null;
  });
  if (!result) return null;
  return {
    allowed: Boolean(result.allowed),
    failureCount: Number(result.failureCount || result.failure_count || 0),
    resetAt: String(result.resetAt || result.reset_at || "")
  };
}

export async function recordAdminLoginFailureData(key: string) {
  if (!useSupabaseStore()) return null;
  const result = await rpc<Row>("record_admin_login_failure", {
    p_key_hash: hashThrottleKey(key)
  }).catch((error) => {
    if (process.env.NODE_ENV === "production") throw error;
    return null;
  });
  if (!result) return null;
  return {
    allowed: Boolean(result.allowed),
    failureCount: Number(result.failureCount || result.failure_count || 0),
    resetAt: String(result.resetAt || result.reset_at || "")
  };
}

export async function clearAdminLoginFailuresData(key: string) {
  if (!useSupabaseStore()) return;
  await rpc("clear_admin_login_failures", {
    p_key_hash: hashThrottleKey(key)
  }).catch(() => null);
}

function eventFromRow(row: Row): EventRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    starterCredits: row.starter_credits,
    emergencyPaused: row.emergency_paused,
    stageMode: row.stage_mode,
    featuredMarketId: row.featured_market_id || undefined,
    createdAt: row.created_at
  };
}

function eventToRow(event: EventRecord, includeFeatured = true): Row {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    starter_credits: event.starterCredits,
    emergency_paused: event.emergencyPaused,
    stage_mode: event.stageMode,
    featured_market_id: includeFeatured ? event.featuredMarketId || null : null,
    created_at: event.createdAt
  };
}

function participantFromRow(row: Row): Participant {
  return {
    id: row.id,
    eventId: row.event_id,
    participantType: row.participant_type,
    nickname: row.nickname,
    role: row.role,
    avatarUrl: row.avatar_url || undefined,
    isAvatarHidden: row.is_avatar_hidden,
    isBanned: row.is_banned,
    oracleScore: row.oracle_score,
    createdAt: row.created_at
  };
}

function participantToRow(participant: Participant): Row {
  return {
    id: participant.id,
    event_id: participant.eventId,
    participant_type: participant.participantType,
    nickname: participant.nickname,
    role: participant.role,
    avatar_url: participant.avatarUrl || null,
    is_avatar_hidden: participant.isAvatarHidden,
    is_banned: participant.isBanned,
    oracle_score: participant.oracleScore,
    created_at: participant.createdAt
  };
}

function participantMutableToRow(participant: Participant): Row {
  return {
    nickname: participant.nickname,
    role: participant.role,
    avatar_url: participant.avatarUrl || null
  };
}

function sessionFromRow(row: Row): ParticipantSession {
  return {
    id: row.id,
    participantId: row.participant_id,
    eventId: row.event_id,
    guardKeyHash: row.guard_key_hash || undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function sessionToRow(session: ParticipantSession): Row {
  return {
    id: session.id,
    participant_id: session.participantId,
    event_id: session.eventId,
    guard_key_hash: session.guardKeyHash || null,
    created_at: session.createdAt,
    expires_at: session.expiresAt
  };
}

function walletFromRow(row: Row): Wallet {
  return {
    participantId: row.participant_id,
    balanceCredits: row.balance_credits,
    totalIssuedCredits: row.total_issued_credits,
    totalCommittedCredits: row.total_committed_credits
  };
}

function walletToRow(wallet: Wallet): Row {
  return {
    participant_id: wallet.participantId,
    balance_credits: wallet.balanceCredits,
    total_issued_credits: wallet.totalIssuedCredits,
    total_committed_credits: wallet.totalCommittedCredits
  };
}

function marketFromRow(row: Row): Market {
  return {
    id: row.id,
    eventId: row.event_id,
    title: row.title,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url || undefined,
    status: row.status,
    resolutionRule: row.resolution_rule,
    resolvedOutcomeId: row.resolved_outcome_id || undefined,
    resolutionNote: row.resolution_note || undefined,
    showOnStage: row.show_on_stage,
    fairLaunchOverride: row.fair_launch_override,
    fairLaunchPeopleThreshold: row.fair_launch_people_threshold || 25,
    fairLaunchSignalCreditsThreshold: row.fair_launch_signal_credits_threshold || 5000,
    maxActionStake: row.max_action_stake,
    allowSwitching: row.allow_switching,
    blindLaunchEnabled: row.blind_launch_enabled ?? true,
    blindLaunchPredictionThreshold: row.blind_launch_prediction_threshold || 20,
    blindLaunchSeconds: row.blind_launch_seconds || 120,
    blindLaunchEndedAt: row.blind_launch_ended_at || undefined,
    openedAt: row.opened_at || undefined,
    lockedAt: row.locked_at || undefined,
    resolvedAt: row.resolved_at || undefined,
    voidedAt: row.voided_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function marketToRow(market: Market): Row {
  return {
    id: market.id,
    event_id: market.eventId,
    title: market.title,
    description: market.description,
    category: market.category,
    image_url: market.imageUrl || null,
    status: market.status,
    resolution_rule: market.resolutionRule,
    resolved_outcome_id: market.resolvedOutcomeId || null,
    resolution_note: market.resolutionNote || null,
    show_on_stage: market.showOnStage,
    fair_launch_override: market.fairLaunchOverride,
    fair_launch_people_threshold: market.fairLaunchPeopleThreshold,
    fair_launch_signal_credits_threshold: market.fairLaunchSignalCreditsThreshold,
    max_action_stake: market.maxActionStake,
    allow_switching: market.allowSwitching,
    blind_launch_enabled: market.blindLaunchEnabled,
    blind_launch_prediction_threshold: market.blindLaunchPredictionThreshold,
    blind_launch_seconds: market.blindLaunchSeconds,
    blind_launch_ended_at: market.blindLaunchEndedAt || null,
    opened_at: market.openedAt || null,
    locked_at: market.lockedAt || null,
    resolved_at: market.resolvedAt || null,
    voided_at: market.voidedAt || null,
    created_at: market.createdAt,
    updated_at: market.updatedAt
  };
}

function marketMutableToRow(market: Market): Row {
  return {
    title: market.title,
    description: market.description,
    category: market.category,
    image_url: market.imageUrl || null,
    resolution_rule: market.resolutionRule,
    show_on_stage: market.showOnStage,
    fair_launch_override: market.fairLaunchOverride,
    fair_launch_people_threshold: market.fairLaunchPeopleThreshold,
    fair_launch_signal_credits_threshold: market.fairLaunchSignalCreditsThreshold,
    max_action_stake: market.maxActionStake,
    allow_switching: market.allowSwitching,
    blind_launch_enabled: market.blindLaunchEnabled,
    blind_launch_prediction_threshold: market.blindLaunchPredictionThreshold,
    blind_launch_seconds: market.blindLaunchSeconds,
    blind_launch_ended_at: market.blindLaunchEndedAt || null,
    updated_at: market.updatedAt
  };
}

function outcomeFromRow(row: Row): Outcome {
  return {
    id: row.id,
    marketId: row.market_id,
    label: row.label,
    imageUrl: row.image_url || undefined,
    icon: row.icon || undefined
  };
}

function outcomeToRow(outcome: Outcome): Row {
  return {
    id: outcome.id,
    market_id: outcome.marketId,
    label: outcome.label,
    image_url: outcome.imageUrl || null,
    icon: outcome.icon || null
  };
}

function positionFromRow(row: Row): Position {
  return {
    id: row.id,
    participantId: row.participant_id,
    marketId: row.market_id,
    outcomeId: row.outcome_id,
    rawCredits: row.raw_credits,
    signalCredits: row.signal_credits,
    feeCredits: row.fee_credits,
    lastActionAt: row.last_action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function positionToRow(position: Position): Row {
  return {
    id: position.id,
    participant_id: position.participantId,
    market_id: position.marketId,
    outcome_id: position.outcomeId,
    raw_credits: position.rawCredits,
    signal_credits: position.signalCredits,
    fee_credits: position.feeCredits,
    last_action_at: position.lastActionAt,
    created_at: position.createdAt,
    updated_at: position.updatedAt
  };
}

function predictionActionFromRow(row: Row): PredictionAction {
  return {
    id: row.id,
    participantId: row.participant_id,
    marketId: row.market_id,
    outcomeId: row.outcome_id,
    requestId: row.request_id || undefined,
    actionType: row.action_type,
    amountCredits: row.amount_credits,
    signalCredits: row.signal_credits,
    feeCredits: row.fee_credits,
    peopleSignalSnapshot: row.people_signal_snapshot || {},
    creditSignalSnapshot: row.credit_signal_snapshot || {},
    convictionSignalSnapshot: row.conviction_signal_snapshot || {},
    stageSignalSnapshot: row.stage_signal_snapshot || {},
    closingStageSignalSnapshot: row.closing_stage_signal_snapshot || undefined,
    createdAt: row.created_at
  };
}

function predictionActionToRow(action: PredictionAction): Row {
  return {
    id: action.id,
    participant_id: action.participantId,
    market_id: action.marketId,
    outcome_id: action.outcomeId,
    request_id: action.requestId || null,
    action_type: action.actionType,
    amount_credits: action.amountCredits,
    signal_credits: action.signalCredits,
    fee_credits: action.feeCredits,
    people_signal_snapshot: action.peopleSignalSnapshot,
    credit_signal_snapshot: action.creditSignalSnapshot,
    conviction_signal_snapshot: action.convictionSignalSnapshot,
    stage_signal_snapshot: action.stageSignalSnapshot,
    closing_stage_signal_snapshot: action.closingStageSignalSnapshot || null,
    created_at: action.createdAt
  };
}

function ledgerEntryFromRow(row: Row): LedgerEntry {
  return {
    id: row.id,
    participantId: row.participant_id,
    type: row.type,
    amountCredits: row.amount_credits,
    direction: row.direction || undefined,
    balanceAfter: row.balance_after ?? undefined,
    idempotencyKey: row.idempotency_key || undefined,
    reason: row.reason,
    marketId: row.market_id || undefined,
    purchaseId: row.purchase_id || undefined,
    metadata: row.metadata || undefined,
    createdAt: row.created_at
  };
}

function ledgerEntryToRow(entry: LedgerEntry): Row {
  return {
    id: entry.id,
    participant_id: entry.participantId,
    type: entry.type,
    amount_credits: entry.amountCredits,
    direction: entry.direction || (entry.amountCredits >= 0 ? "credit" : "debit"),
    balance_after: entry.balanceAfter ?? null,
    idempotency_key: entry.idempotencyKey || null,
    reason: entry.reason,
    market_id: entry.marketId || null,
    purchase_id: entry.purchaseId || null,
    metadata: entry.metadata || {},
    created_at: entry.createdAt
  };
}

function aggregateFromRow(row: Row): MarketAggregate {
  const roleBreakdown = {
    builder: {},
    sponsor: {},
    investor: {},
    other: {},
    ...(row.role_breakdown || {})
  };
  const agentBreakdown = {
    human: {},
    agent: {},
    ...(row.agent_breakdown || {})
  };
  return {
    marketId: row.market_id,
    totalPeople: row.total_people,
    totalSignalCredits: row.total_signal_credits,
    outcomePeopleCounts: row.outcome_people_counts || {},
    outcomeCreditTotals: row.outcome_credit_totals || {},
    roleBreakdown,
    agentBreakdown,
    updatedAt: row.updated_at
  };
}

function aggregateToRow(aggregate: MarketAggregate): Row {
  return {
    market_id: aggregate.marketId,
    total_people: aggregate.totalPeople,
    total_signal_credits: aggregate.totalSignalCredits,
    outcome_people_counts: aggregate.outcomePeopleCounts,
    outcome_credit_totals: aggregate.outcomeCreditTotals,
    role_breakdown: aggregate.roleBreakdown,
    agent_breakdown: aggregate.agentBreakdown,
    updated_at: aggregate.updatedAt
  };
}

function purchaseFromRow(row: Row): Purchase {
  return {
    id: row.id,
    participantId: row.participant_id,
    status: row.status,
    amountEur: Number(row.amount_eur),
    currency: row.currency,
    credits: row.credits,
    molliePaymentId: row.mollie_payment_id || undefined,
    checkoutUrl: row.checkout_url || undefined,
    createdAt: row.created_at,
    paidAt: row.paid_at || undefined,
    creditedAt: row.credited_at || undefined
  };
}

function purchaseToRow(purchase: Purchase): Row {
  return {
    id: purchase.id,
    participant_id: purchase.participantId,
    status: purchase.status,
    amount_eur: purchase.amountEur,
    currency: purchase.currency,
    credits: purchase.credits,
    mollie_payment_id: purchase.molliePaymentId || null,
    checkout_url: purchase.checkoutUrl || null,
    created_at: purchase.createdAt,
    paid_at: purchase.paidAt || null,
    credited_at: purchase.creditedAt || null
  };
}

function auditLogFromRow(row: Row): AdminAuditLog {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details || {},
    ip: row.ip || undefined,
    createdAt: row.created_at
  };
}

function auditLogToRow(log: AdminAuditLog): Row {
  return {
    id: log.id,
    action: log.action,
    entity_type: log.entityType,
    entity_id: log.entityId,
    details: log.details,
    ip: log.ip || null,
    created_at: log.createdAt
  };
}

function agentProfileFromRow(row: Row): AgentProfile {
  return {
    id: row.id,
    eventId: row.event_id,
    participantId: row.participant_id,
    name: row.name,
    strategy: row.strategy,
    createdAt: row.created_at
  };
}

function agentProfileToRow(agent: AgentProfile): Row {
  return {
    id: agent.id,
    event_id: agent.eventId,
    participant_id: agent.participantId,
    name: agent.name,
    strategy: agent.strategy,
    created_at: agent.createdAt
  };
}

function agentRunFromRow(row: Row): AgentRun {
  return {
    id: row.id,
    agentProfileId: row.agent_profile_id,
    marketId: row.market_id,
    outcomeId: row.outcome_id || undefined,
    status: row.status,
    note: row.note,
    createdAt: row.created_at
  };
}

function agentRunToRow(run: AgentRun): Row {
  return {
    id: run.id,
    agent_profile_id: run.agentProfileId,
    market_id: run.marketId,
    outcome_id: run.outcomeId || null,
    status: run.status,
    note: run.note,
    created_at: run.createdAt
  };
}

function mcpTokenFromRow(row: Row): McpToken {
  return {
    id: row.id,
    participantId: row.participant_id || undefined,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined
  };
}

function mcpTokenToRow(token: McpToken): Row {
  return {
    id: token.id,
    participant_id: token.participantId || null,
    token_hash: token.tokenHash,
    created_at: token.createdAt,
    expires_at: token.expiresAt || null
  };
}

let seedPromise: Promise<void> | undefined;

async function ensureSupabaseSeeded() {
  if (process.env.VOTA_DISABLE_AUTO_SEED === "1") return;
  if (process.env.NODE_ENV === "production" && process.env.VOTA_ENABLE_PRODUCTION_AUTO_SEED !== "1") return;
  seedPromise ||= (async () => {
    const seed = createSeedStore();
    await upsertRows("events", seed.events.map((event) => eventToRow(event, false)), "slug", true);
    await upsertRows("markets", seed.markets.map(marketToRow), "id", true);
    await upsertRows("outcomes", seed.outcomes.map(outcomeToRow), "id", true);
    await upsertRows("participants", seed.participants.map(participantToRow), "id", true);
    await upsertRows("wallets", seed.wallets.map(walletToRow), "participant_id", true);
    await upsertRows("positions", seed.positions.map(positionToRow), "id", true);
    await upsertRows("prediction_actions", seed.predictionActions.map(predictionActionToRow), "id", true);
    await upsertRows("ledger_entries", seed.ledgerEntries.map(ledgerEntryToRow), "id", true);
    await upsertRows("market_aggregates", seed.marketAggregates.map(aggregateToRow), "market_id", true);
    for (const event of seed.events) {
      if (event.featuredMarketId) {
        await patchRows("events", `id=eq.${event.id}&featured_market_id=is.null`, { featured_market_id: event.featuredMarketId });
      }
    }
  })();
  await seedPromise;
}

async function readSupabaseStore(): Promise<Store> {
  await ensureSupabaseSeeded();
  const [
    events,
    participants,
    participantSessions,
    wallets,
    markets,
    outcomes,
    positions,
    predictionActions,
    ledgerEntries,
    marketAggregates,
    purchases,
    adminAuditLogs,
    agentProfiles,
    agentRuns,
    mcpTokens
  ] = await Promise.all(TABLES.map((table) => selectRows(table)));
  return {
    events: events.map(eventFromRow),
    participants: participants.map(participantFromRow),
    participantSessions: participantSessions.map(sessionFromRow),
    wallets: wallets.map(walletFromRow),
    markets: markets.map(marketFromRow),
    outcomes: outcomes.map(outcomeFromRow),
    positions: positions.map(positionFromRow),
    predictionActions: predictionActions.map(predictionActionFromRow),
    ledgerEntries: ledgerEntries.map(ledgerEntryFromRow),
    marketAggregates: marketAggregates.map(aggregateFromRow),
    purchases: purchases.map(purchaseFromRow),
    adminAuditLogs: adminAuditLogs.map(auditLogFromRow),
    agentProfiles: agentProfiles.map(agentProfileFromRow),
    agentRuns: agentRuns.map(agentRunFromRow),
    mcpTokens: mcpTokens.map(mcpTokenFromRow)
  };
}

async function readSupabasePublicState(eventSlug: string): Promise<PublicEventState> {
  await ensureSupabaseSeeded();
  const eventRows = await selectRows("events", `select=*&slug=eq.${encodeURIComponent(eventSlug)}`);
  const event = eventRows[0] ? eventFromRow(eventRows[0]) : undefined;
  if (!event) return publicState(emptyDataStore(), eventSlug);

  const marketRows = await selectRows("markets", `select=*&event_id=eq.${encodeURIComponent(event.id)}&status=neq.draft`);
  const markets = marketRows.map(marketFromRow);
  const marketIds = markets.map((market) => market.id);
  const [outcomeRows, aggregateRows, participantRows, positionRows, actionRows] =
    marketIds.length > 0
      ? await Promise.all([
          selectRows("outcomes", `select=*&market_id=in.(${marketIds.join(",")})`),
          selectRows("market_aggregates", `select=*&market_id=in.(${marketIds.join(",")})`),
          selectRows("participants", `select=*&event_id=eq.${encodeURIComponent(event.id)}`),
          selectRows("positions", `select=*&market_id=in.(${marketIds.join(",")})`),
          selectRows("prediction_actions", `select=*&market_id=in.(${marketIds.join(",")})`)
        ])
      : [[], [], [], [], []];
  return publicState(
    {
      ...emptyDataStore(),
      events: [event],
      participants: participantRows.map(participantFromRow),
      markets,
      outcomes: outcomeRows.map(outcomeFromRow),
      positions: positionRows.map(positionFromRow),
      predictionActions: actionRows.map(predictionActionFromRow),
      marketAggregates: aggregateRows.map(aggregateFromRow)
    },
    eventSlug
  );
}

function emptyLeaderboardGroups(overall: LeaderboardRow[] = []): LeaderboardGroups {
  return {
    overall,
    byRole: { builder: [], sponsor: [], investor: [], other: [] },
    humans: [],
    agents: [],
    earlyCallers: [],
    contrarianCalls: []
  };
}

function leaderboardGroupsFromRows(overall: LeaderboardRow[]): LeaderboardGroups {
  const scored = overall.filter((row) => row.oracleScore > 0);
  const byRole = (["builder", "sponsor", "investor", "other"] as Role[]).reduce<LeaderboardGroups["byRole"]>(
    (acc, role) => {
      acc[role] = scored.filter((row) => row.role === role);
      return acc;
    },
    { builder: [], sponsor: [], investor: [], other: [] }
  );
  return {
    ...emptyLeaderboardGroups(overall),
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

function leaderboardRowFromRpcRow(row: Row): LeaderboardRow {
  return {
    id: String(row.id),
    nickname: String(row.nickname || "oracle"),
    role: normalizeRole(String(row.role || "other")),
    participantType: row.participant_type === "house_agent" || row.participant_type === "external_agent" ? row.participant_type : "human",
    avatarUrl: row.avatar_url || undefined,
    oracleScore: Number(row.oracle_score || 0),
    predictions: Number(row.predictions || 0),
    correctMarkets: Number(row.correct_markets || 0),
    efficiency: Number(row.efficiency || 0),
    earlyScore: Number(row.early_score || 0),
    contrarianScore: Number(row.contrarian_score || 0)
  };
}

async function readSupabaseLeaderboardGroups(eventSlug: string): Promise<LeaderboardGroups> {
  await ensureSupabaseSeeded();
  const eventRows = await selectRows("events", `select=id&slug=eq.${encodeURIComponent(eventSlug)}`);
  if (!eventRows[0]) throw new Error(`Unknown event: ${eventSlug}`);
  const rows = await rpc<Row[]>("public_leaderboard_tx", { p_event_slug: eventSlug });
  return leaderboardGroupsFromRows(rows.map(leaderboardRowFromRpcRow));
}

function scopedPublicEventStore(source: Store, eventSlug: string, sessionId?: string): Store {
  const event = source.events.find((item) => item.slug === eventSlug);
  if (!event) return emptyDataStore();
  const markets = source.markets.filter((market) => market.eventId === event.id && market.status !== "draft");
  const marketIds = new Set(markets.map((market) => market.id));
  const sessions = sessionId
    ? source.participantSessions.filter((session) => session.id === sessionId && session.eventId === event.id)
    : [];
  const sessionParticipantIds = new Set(sessions.map((session) => session.participantId));
  const participants = source.participants.filter((participant) => participant.eventId === event.id);
  const sessionParticipantIdSet = new Set(sessionParticipantIds);
  return {
    ...emptyDataStore(),
    events: [event],
    participants,
    participantSessions: sessions,
    wallets: source.wallets.filter((wallet) => sessionParticipantIdSet.has(wallet.participantId)),
    markets,
    outcomes: source.outcomes.filter((outcome) => marketIds.has(outcome.marketId)),
    positions: source.positions.filter((position) => marketIds.has(position.marketId)),
    predictionActions: source.predictionActions.filter((action) => marketIds.has(action.marketId)),
    marketAggregates: source.marketAggregates.filter((aggregate) => marketIds.has(aggregate.marketId))
  };
}

function scopedPublicMarketStore(source: Store, marketId: string, sessionId?: string): Store {
  const market = source.markets.find((item) => item.id === marketId && item.status !== "draft");
  const event = source.events.find((item) => item.id === market?.eventId);
  if (!market || !event) return emptyDataStore();
  const sessions = sessionId
    ? source.participantSessions.filter((session) => session.id === sessionId && session.eventId === event.id)
    : [];
  const sessionParticipantIds = new Set(sessions.map((session) => session.participantId));
  const participants = source.participants.filter((participant) => participant.eventId === event.id);
  const sessionParticipantIdSet = new Set(sessionParticipantIds);
  return {
    ...emptyDataStore(),
    events: [event],
    participants,
    participantSessions: sessions,
    wallets: source.wallets.filter((wallet) => sessionParticipantIdSet.has(wallet.participantId)),
    markets: [market],
    outcomes: source.outcomes.filter((outcome) => outcome.marketId === market.id),
    positions: source.positions.filter((position) => position.marketId === market.id),
    predictionActions: source.predictionActions.filter((action) => action.marketId === market.id),
    marketAggregates: source.marketAggregates.filter((aggregate) => aggregate.marketId === market.id)
  };
}

function scopedReceiptStore(source: Store, receiptId: string): Store {
  const directAction = source.predictionActions.find((item) => item.id === receiptId);
  if (!directAction) return emptyDataStore();
  const participant = source.participants.find((item) => item.id === directAction.participantId);
  if (!participant) return emptyDataStore();
  const marketIds = new Set([directAction.marketId]);
  const event = source.events.find((item) => item.id === participant.eventId);
  return {
    ...emptyDataStore(),
    events: event ? [event] : [],
    participants: [participant],
    markets: source.markets.filter((market) => marketIds.has(market.id)),
    outcomes: source.outcomes.filter((outcome) => marketIds.has(outcome.marketId)),
    positions: source.positions.filter((position) => position.participantId === participant.id && marketIds.has(position.marketId)),
    predictionActions: source.predictionActions.filter(
      (action) => action.participantId === participant.id && marketIds.has(action.marketId)
    )
  };
}

async function readSupabasePublicEventStore(eventSlug: string, sessionId?: string): Promise<Store> {
  await ensureSupabaseSeeded();
  const eventRows = await selectRows("events", `select=*&slug=eq.${encodeURIComponent(eventSlug)}`);
  const event = eventRows[0] ? eventFromRow(eventRows[0]) : undefined;
  if (!event) return emptyDataStore();

  const [marketRows, sessionRows] = await Promise.all([
    selectRows("markets", `select=*&event_id=eq.${encodeURIComponent(event.id)}&status=neq.draft`),
    sessionId
      ? selectRows(
          "participant_sessions",
          `select=*&id=eq.${encodeURIComponent(sessionId)}&event_id=eq.${encodeURIComponent(event.id)}&expires_at=gt.${encodeURIComponent(nowIso())}`
        )
      : Promise.resolve([])
  ]);
  const markets = marketRows.map(marketFromRow);
  const sessions = sessionRows.map(sessionFromRow);
  const marketIds = markets.map((market) => market.id);
  const sessionParticipantIds = sessions.map((session) => session.participantId);
  const [outcomeRows, aggregateRows, participantRows, walletRows, positionRows, actionRows] = await Promise.all([
    marketIds.length > 0 ? selectRows("outcomes", `select=*&market_id=in.(${marketIds.join(",")})`) : Promise.resolve([]),
    marketIds.length > 0 ? selectRows("market_aggregates", `select=*&market_id=in.(${marketIds.join(",")})`) : Promise.resolve([]),
    selectRows("participants", `select=*&event_id=eq.${encodeURIComponent(event.id)}`),
    sessionParticipantIds.length > 0
      ? selectRows("wallets", `select=*&participant_id=in.(${sessionParticipantIds.join(",")})`)
      : Promise.resolve([]),
    marketIds.length > 0
      ? selectRows("positions", `select=*&market_id=in.(${marketIds.join(",")})`)
      : Promise.resolve([]),
    marketIds.length > 0
      ? selectRows("prediction_actions", `select=*&market_id=in.(${marketIds.join(",")})`)
      : Promise.resolve([])
  ]);
  return {
    ...emptyDataStore(),
    events: [event],
    participants: participantRows.map(participantFromRow),
    participantSessions: sessions,
    wallets: walletRows.map(walletFromRow),
    markets,
    outcomes: outcomeRows.map(outcomeFromRow),
    positions: positionRows.map(positionFromRow),
    predictionActions: actionRows.map(predictionActionFromRow),
    marketAggregates: aggregateRows.map(aggregateFromRow)
  };
}

async function readSupabasePublicMarketStore(marketId: string, sessionId?: string): Promise<Store> {
  await ensureSupabaseSeeded();
  const marketRows = await selectRows("markets", `select=*&id=eq.${encodeURIComponent(marketId)}&status=neq.draft`);
  const market = marketRows[0] ? marketFromRow(marketRows[0]) : undefined;
  if (!market) return emptyDataStore();
  const eventRows = await selectRows("events", `select=*&id=eq.${encodeURIComponent(market.eventId)}`);
  const event = eventRows[0] ? eventFromRow(eventRows[0]) : undefined;
  if (!event) return emptyDataStore();
  const sessionRows = sessionId
    ? await selectRows(
        "participant_sessions",
        `select=*&id=eq.${encodeURIComponent(sessionId)}&event_id=eq.${encodeURIComponent(event.id)}&expires_at=gt.${encodeURIComponent(nowIso())}`
      )
    : [];
  const sessions = sessionRows.map(sessionFromRow);
  const sessionParticipantIds = sessions.map((session) => session.participantId);
  const [outcomeRows, aggregateRows, participantRows, walletRows, positionRows, actionRows] = await Promise.all([
    selectRows("outcomes", `select=*&market_id=eq.${encodeURIComponent(market.id)}`),
    selectRows("market_aggregates", `select=*&market_id=eq.${encodeURIComponent(market.id)}`),
    selectRows("participants", `select=*&event_id=eq.${encodeURIComponent(event.id)}`),
    sessionParticipantIds.length > 0
      ? selectRows("wallets", `select=*&participant_id=in.(${sessionParticipantIds.join(",")})`)
      : Promise.resolve([]),
    selectRows("positions", `select=*&market_id=eq.${encodeURIComponent(market.id)}`),
    selectRows("prediction_actions", `select=*&market_id=eq.${encodeURIComponent(market.id)}`)
  ]);
  return {
    ...emptyDataStore(),
    events: [event],
    participants: participantRows.map(participantFromRow),
    participantSessions: sessions,
    wallets: walletRows.map(walletFromRow),
    markets: [market],
    outcomes: outcomeRows.map(outcomeFromRow),
    positions: positionRows.map(positionFromRow),
    predictionActions: actionRows.map(predictionActionFromRow),
    marketAggregates: aggregateRows.map(aggregateFromRow)
  };
}

export async function readPublicEventStoreData(eventSlug = DEFAULT_EVENT_SLUG, sessionId?: string): Promise<Store> {
  if (!useSupabaseStore()) return scopedPublicEventStore(await readStore(), eventSlug, sessionId);
  return readSupabasePublicEventStore(eventSlug, sessionId);
}

export async function readPublicMarketStoreData(marketId: string, sessionId?: string): Promise<Store> {
  if (!useSupabaseStore()) return scopedPublicMarketStore(await readStore(), marketId, sessionId);
  return readSupabasePublicMarketStore(marketId, sessionId);
}

export async function readUserMarketStateData(marketId: string, sessionId?: string): Promise<UserMarketState> {
  const store = await readPublicMarketStoreData(marketId, sessionId);
  const session = getSessionParticipant(store, sessionId);
  return userMarketState(store, { participantId: session?.participant.id, marketId });
}

export async function readReceiptStoreData(receiptId: string): Promise<Store> {
  if (!receiptId) return emptyDataStore();
  if (!useSupabaseStore()) return scopedReceiptStore(await readStore(), receiptId);

  const directActionRows = await selectRows("prediction_actions", `select=*&id=eq.${encodeURIComponent(receiptId)}`);
  const directAction = directActionRows[0] ? predictionActionFromRow(directActionRows[0]) : undefined;
  if (!directAction) return emptyDataStore();
  const participantRows = await selectRows(
    "participants",
    `select=*&id=eq.${encodeURIComponent(directAction.participantId)}`
  );
  const participant = participantRows[0] ? participantFromRow(participantRows[0]) : undefined;
  if (!participant) return emptyDataStore();

  const seedPositionRows = await selectRows(
    "positions",
    `select=*&participant_id=eq.${encodeURIComponent(participant.id)}&market_id=eq.${encodeURIComponent(directAction.marketId)}`
  );
  const marketIds = [directAction.marketId];
  const [eventRows, marketRows, outcomeRows, actionRows] = await Promise.all([
    selectRows("events", `select=*&id=eq.${encodeURIComponent(participant.eventId)}`),
    marketIds.length > 0 ? selectRows("markets", `select=*&id=in.(${marketIds.join(",")})`) : Promise.resolve([]),
    marketIds.length > 0 ? selectRows("outcomes", `select=*&market_id=in.(${marketIds.join(",")})`) : Promise.resolve([]),
    marketIds.length > 0
      ? selectRows(
          "prediction_actions",
          `select=*&participant_id=eq.${encodeURIComponent(participant.id)}&market_id=in.(${marketIds.join(",")})`
        )
      : Promise.resolve([])
  ]);
  return {
    ...emptyDataStore(),
    events: eventRows.map(eventFromRow),
    participants: [participant],
    markets: marketRows.map(marketFromRow),
    outcomes: outcomeRows.map(outcomeFromRow),
    positions: seedPositionRows.map(positionFromRow),
    predictionActions: actionRows.map(predictionActionFromRow)
  };
}

export async function readParticipantLedgerEntriesData(participantId: string, limit = 12): Promise<LedgerEntry[]> {
  if (!participantId) return [];
  const safeLimit = Math.max(1, Math.min(Math.floor(limit || 12), 50));
  if (!useSupabaseStore()) {
    return (await readStore()).ledgerEntries
      .filter((entry) => entry.participantId === participantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit);
  }
  const rows = await selectRows(
    "ledger_entries",
    `select=*&participant_id=eq.${encodeURIComponent(participantId)}&order=created_at.desc`
  );
  return rows.map(ledgerEntryFromRow).slice(0, safeLimit);
}

export async function readLeaderboardGroupsData(eventSlug = DEFAULT_EVENT_SLUG): Promise<LeaderboardGroups> {
  if (!useSupabaseStore()) return leaderboardGroups(await readStore(), eventSlug);
  return readSupabaseLeaderboardGroups(eventSlug);
}

export async function findPurchaseData(purchaseId: string) {
  if (!purchaseId) return undefined;
  if (!useSupabaseStore()) {
    return (await readStore()).purchases.find((item) => item.id === purchaseId || item.molliePaymentId === purchaseId);
  }
  const [idRows, mollieRows] = await Promise.all([
    selectRows("purchases", `select=*&id=eq.${encodeURIComponent(purchaseId)}`),
    selectRows("purchases", `select=*&mollie_payment_id=eq.${encodeURIComponent(purchaseId)}`)
  ]);
  const row = idRows[0] || mollieRows[0];
  return row ? purchaseFromRow(row) : undefined;
}

export async function findParticipantPurchaseData(participantId: string, purchaseId: string) {
  if (!participantId || !purchaseId) return undefined;
  if (!useSupabaseStore()) {
    const purchase = await findPurchaseData(purchaseId);
    return purchase?.participantId === participantId ? purchase : undefined;
  }
  const [idRows, mollieRows] = await Promise.all([
    selectRows(
      "purchases",
      `select=*&participant_id=eq.${encodeURIComponent(participantId)}&id=eq.${encodeURIComponent(purchaseId)}`
    ),
    selectRows(
      "purchases",
      `select=*&participant_id=eq.${encodeURIComponent(participantId)}&mollie_payment_id=eq.${encodeURIComponent(purchaseId)}`
    )
  ]);
  const row = idRows[0] || mollieRows[0];
  return row ? purchaseFromRow(row) : undefined;
}

export async function getSessionParticipantData(sessionId?: string) {
  if (!sessionId) return null;
  if (!useSupabaseStore()) return getSessionParticipant(await readStore(), sessionId);
  const sessionRows = await selectRows(
    "participant_sessions",
    `select=*&id=eq.${encodeURIComponent(sessionId)}&expires_at=gt.${encodeURIComponent(nowIso())}`
  );
  const session = sessionRows[0] ? sessionFromRow(sessionRows[0]) : undefined;
  if (!session) return null;
  const [participantRows, walletRows] = await Promise.all([
    selectRows("participants", `select=*&id=eq.${encodeURIComponent(session.participantId)}`),
    selectRows("wallets", `select=*&participant_id=eq.${encodeURIComponent(session.participantId)}`)
  ]);
  const participant = participantRows[0] ? participantFromRow(participantRows[0]) : undefined;
  if (!participant) return null;
  return {
    session,
    participant,
    wallet: walletRows[0] ? walletFromRow(walletRows[0]) : undefined
  };
}

export async function findEventByIdData(eventId: string) {
  if (!eventId) return undefined;
  if (!useSupabaseStore()) return (await readStore()).events.find((item) => item.id === eventId);
  const rows = await selectRows("events", `select=*&id=eq.${encodeURIComponent(eventId)}`);
  return rows[0] ? eventFromRow(rows[0]) : undefined;
}

export async function findEventBySlugData(eventSlug: string) {
  if (!eventSlug) return undefined;
  if (!useSupabaseStore()) return (await readStore()).events.find((item) => item.slug === eventSlug);
  const rows = await selectRows("events", `select=*&slug=eq.${encodeURIComponent(eventSlug)}`);
  return rows[0] ? eventFromRow(rows[0]) : undefined;
}

export async function findNextOpenMarketData(eventId: string) {
  if (!eventId) return undefined;
  if (!useSupabaseStore()) {
    return (await readStore()).markets.find((market) => market.eventId === eventId && market.status === "open");
  }
  const rows = await selectRows(
    "markets",
    `select=*&event_id=eq.${encodeURIComponent(eventId)}&status=eq.open&order=created_at.asc`
  );
  return rows[0] ? marketFromRow(rows[0]) : undefined;
}

export async function findReusablePendingPurchaseData(participantId: string) {
  if (!participantId) return undefined;
  if (!useSupabaseStore()) {
    return [...(await readStore()).purchases]
      .reverse()
      .find((purchase) => purchase.participantId === participantId && purchase.status === "pending" && purchase.checkoutUrl);
  }
  const rows = await selectRows(
    "purchases",
    `select=*&participant_id=eq.${encodeURIComponent(participantId)}&status=eq.pending&checkout_url=not.is.null&order=created_at.desc`
  );
  return rows[0] ? purchaseFromRow(rows[0]) : undefined;
}

async function writeSupabaseSnapshot(before: Store, after: Store) {
  const removedOutcomes = before.outcomes
    .filter((outcome) => !after.outcomes.some((candidate) => candidate.id === outcome.id));
  const removedOutcomeIds = removedOutcomes.map((outcome) => outcome.id);
  const newMarketRows = newRows(before.markets, after.markets, (market) => market.id, marketToRow);
  const changedMarketPatches = changedExistingRows(
    before.markets,
    after.markets,
    (market) => market.id,
    marketMutableToRow,
    marketMutableToRow
  );
  const newParticipantRows = newRows(before.participants, after.participants, (participant) => participant.id, participantToRow);
  const changedParticipantPatches = changedExistingRows(
    before.participants,
    after.participants,
    (participant) => participant.id,
    participantMutableToRow,
    participantMutableToRow
  );
  const changedOutcomeRows = changedRows(before.outcomes, after.outcomes, (outcome) => outcome.id, outcomeToRow);
  const changedPositionRows = changedRows(before.positions, after.positions, (position) => position.id, positionToRow);
  await patchChangedMarketRows(changedMarketPatches);
  await upsertRows("events", newRows(before.events, after.events, (event) => event.id, (event) => eventToRow(event)), "id");
  await upsertRows("participants", newParticipantRows, "id");
  await patchChangedRows("participants", changedParticipantPatches);
  await upsertRows("markets", newMarketRows, "id");
  await deleteByIds("outcomes", removedOutcomeIds);
  await upsertRows("outcomes", changedOutcomeRows, "id");
  await upsertRows("wallets", changedRows(before.wallets, after.wallets, (wallet) => wallet.participantId, walletToRow), "participant_id");
  await upsertRows("participant_sessions", changedRows(before.participantSessions, after.participantSessions, (session) => session.id, sessionToRow), "id");
  await upsertRows("purchases", changedRows(before.purchases, after.purchases, (purchase) => purchase.id, purchaseToRow), "id");
  await upsertRows("positions", changedPositionRows, "id");
  await upsertRows(
    "prediction_actions",
    changedRows(before.predictionActions, after.predictionActions, (action) => action.id, predictionActionToRow),
    "id"
  );
  await upsertRows("ledger_entries", changedRows(before.ledgerEntries, after.ledgerEntries, (entry) => entry.id, ledgerEntryToRow), "id");
  const aggregateMarketIds = new Set<string>([
    ...newMarketRows.map((row) => String(row.id)),
    ...changedMarketPatches.map((item) => item.id),
    ...removedOutcomes.map((outcome) => outcome.marketId),
    ...changedOutcomeRows.map((row) => String(row.market_id)),
    ...changedPositionRows.map((row) => String(row.market_id)),
    ...after.positions
      .filter((position) => changedParticipantPatches.some((participant) => participant.id === position.participantId))
      .map((position) => position.marketId)
  ]);
  for (const marketId of aggregateMarketIds) {
    if (marketId && marketId !== "undefined") {
      await rpc("recompute_market_aggregate", { p_market_id: marketId });
    }
  }
  await upsertRows("agent_profiles", changedRows(before.agentProfiles, after.agentProfiles, (agent) => agent.id, agentProfileToRow), "id");
  await upsertRows("agent_runs", changedRows(before.agentRuns, after.agentRuns, (run) => run.id, agentRunToRow), "id");
  await upsertRows("mcp_tokens", changedRows(before.mcpTokens, after.mcpTokens, (token) => token.id, mcpTokenToRow), "id");
  await upsertRows("admin_audit_logs", changedRows(before.adminAuditLogs, after.adminAuditLogs, (log) => log.id, auditLogToRow), "id");
}

export async function readDataStore(): Promise<Store> {
  if (!useSupabaseStore()) return readStore();
  return readSupabaseStore();
}

export async function readPublicStateData(eventSlug = DEFAULT_EVENT_SLUG): Promise<PublicEventState> {
  if (!useSupabaseStore()) return publicState(scopedPublicEventStore(await readStore(), eventSlug), eventSlug);
  return readSupabasePublicState(eventSlug);
}

export async function mutateDataStore<T>(mutator: (store: Store) => T): Promise<T> {
  if (!useSupabaseStore()) return mutateStore(mutator);
  const before = await readSupabaseStore();
  const next = structuredClone(before) as Store;
  const result = mutator(next);
  await writeSupabaseSnapshot(before, next);
  return result;
}

export async function getSessionFromRequestData(request: NextRequest) {
  const store = await readDataStore();
  const sessionId = getParticipantSessionIdFromRequest(request);
  const session = getSessionParticipant(store, sessionId);
  return { store, session, sessionId };
}

export async function initParticipantSessionData(existingSessionId?: string, eventSlug = DEFAULT_EVENT_SLUG, guardKeyHash?: string) {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const event = getEventOrThrow(store, eventSlug);
      const existing = getSessionParticipant(store, existingSessionId);
      if (existing?.session.eventId === event.id) return existing;
      const guarded = getSessionParticipantByGuard(store, event.id, guardKeyHash);
      return guarded || createParticipantSession(store, eventSlug, guardKeyHash);
    });
  }
  await ensureSupabaseSeeded();
  const eventRows = await selectRows("events", `select=*&slug=eq.${encodeURIComponent(eventSlug)}`);
  const event = eventRows[0] ? eventFromRow(eventRows[0]) : undefined;
  if (!event) throw new Error(`Unknown event: ${eventSlug}`);
  const existing = await getSessionParticipantData(existingSessionId);
  if (existing?.session.eventId === event.id) return existing;
  const result = await rpc<Row>("init_participant_session_tx", {
    p_event_slug: eventSlug,
    p_guard_key_hash: guardKeyHash || null
  });
  const participant = participantFromRow(result.participant);
  const wallet = walletFromRow(result.wallet);
  const session = sessionFromRow(result.session);
  return { session, participant, wallet };
}

export async function updateParticipantProfileData(
  participantId: string,
  input: { nickname: string; role: string; avatarUrl?: string }
) {
  if (!useSupabaseStore()) {
    return mutateDataStore((store) =>
      updateParticipantProfile(store, participantId, {
        nickname: input.nickname,
        role: normalizeRole(input.role),
        avatarUrl: input.avatarUrl
      })
    );
  }
  const currentRows = await selectRows("participants", `select=*&id=eq.${encodeURIComponent(participantId)}`);
  const current = currentRows[0] ? participantFromRow(currentRows[0]) : undefined;
  if (!current) throw new Error("Participant not found");
  const patch: Row = {
    nickname: normalizeNickname(input.nickname),
    role: normalizeRole(input.role)
  };
  if (input.avatarUrl) patch.avatar_url = input.avatarUrl;
  const updatedRows = await patchRowsReturning("participants", `id=eq.${encodeURIComponent(participantId)}`, patch);
  const updated = updatedRows[0] ? participantFromRow(updatedRows[0]) : undefined;
  if (!updated) throw new Error("Participant not found");
  if (current.role !== updated.role) {
    const positionRows = await selectRows("positions", `select=market_id&participant_id=eq.${encodeURIComponent(participantId)}`);
    const marketIds = new Set(positionRows.map((row) => String(row.market_id)).filter(Boolean));
    for (const marketId of marketIds) await rpc("recompute_market_aggregate", { p_market_id: marketId });
  }
  return updated;
}

export async function createMarketData(input: MarketWriteInput) {
  if (!useSupabaseStore()) {
    return mutateStore((store) =>
      createMarket(store, {
        eventSlug: input.eventSlug,
        title: input.title,
        description: input.description,
        category: input.category,
        imageUrl: input.imageUrl,
        resolutionRule: input.resolutionRule,
        outcomes: input.outcomes || [],
        showOnStage: input.showOnStage,
        fairLaunchOverride: input.fairLaunchOverride,
        fairLaunchPeopleThreshold: input.fairLaunchPeopleThreshold,
        fairLaunchSignalCreditsThreshold: input.fairLaunchSignalCreditsThreshold,
        maxActionStake: input.maxActionStake,
        allowSwitching: input.allowSwitching,
        blindLaunchEnabled: input.blindLaunchEnabled,
        blindLaunchPredictionThreshold: input.blindLaunchPredictionThreshold,
        blindLaunchSeconds: input.blindLaunchSeconds,
        blindLaunchEndedAt: input.blindLaunchEndedAt,
        auditIp: input.auditIp
      })
    );
  }
  const result = await rpc<Row>("create_market_tx", {
    p_event_slug: input.eventSlug,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_image_url: input.imageUrl || "",
    p_resolution_rule: input.resolutionRule,
    p_outcomes: input.outcomes || [],
    p_show_on_stage: input.showOnStage,
    p_fair_launch_override: input.fairLaunchOverride,
    p_fair_launch_people_threshold: input.fairLaunchPeopleThreshold,
    p_fair_launch_signal_credits_threshold: input.fairLaunchSignalCreditsThreshold,
    p_max_action_stake: input.maxActionStake,
    p_allow_switching: input.allowSwitching,
    p_blind_launch_enabled: input.blindLaunchEnabled,
    p_blind_launch_prediction_threshold: input.blindLaunchPredictionThreshold,
    p_blind_launch_seconds: input.blindLaunchSeconds,
    p_blind_launch_ended_at: input.blindLaunchEndedAt || null,
    p_ip: input.auditIp || null
  });
  return marketFromRow(result.market);
}

export async function updateMarketData(
  marketId: string,
  expectedUpdatedAt: string | undefined,
  input: Omit<MarketWriteInput, "eventSlug">
) {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const freshMarket = store.markets.find((item) => item.id === marketId);
      if (!freshMarket) throw new Error("Market not found.");
      if (expectedUpdatedAt && freshMarket.updatedAt !== expectedUpdatedAt) {
        throw new Error("Market changed since this form loaded. Refresh and try again.");
      }
      return updateMarket(store, marketId, {
        title: input.title,
        description: input.description,
        category: input.category,
        imageUrl: input.imageUrl,
        resolutionRule: input.resolutionRule,
        outcomes: input.outcomes,
        showOnStage: input.showOnStage,
        allowSwitching: input.allowSwitching,
        fairLaunchOverride: input.fairLaunchOverride,
        fairLaunchPeopleThreshold: input.fairLaunchPeopleThreshold,
        fairLaunchSignalCreditsThreshold: input.fairLaunchSignalCreditsThreshold,
        maxActionStake: input.maxActionStake,
        blindLaunchEnabled: input.blindLaunchEnabled,
        blindLaunchPredictionThreshold: input.blindLaunchPredictionThreshold,
        blindLaunchSeconds: input.blindLaunchSeconds,
        blindLaunchEndedAt: input.blindLaunchEndedAt,
        clearBlindLaunchEndedAt: input.clearBlindLaunchEndedAt,
        auditIp: input.auditIp
      });
    });
  }
  const result = await rpc<Row>("update_market_tx", {
    p_market_id: marketId,
    p_expected_updated_at: expectedUpdatedAt || null,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_image_url: input.imageUrl || "",
    p_resolution_rule: input.resolutionRule,
    p_outcomes: input.outcomes ?? null,
    p_show_on_stage: input.showOnStage,
    p_fair_launch_override: input.fairLaunchOverride,
    p_fair_launch_people_threshold: input.fairLaunchPeopleThreshold,
    p_fair_launch_signal_credits_threshold: input.fairLaunchSignalCreditsThreshold,
    p_max_action_stake: input.maxActionStake,
    p_allow_switching: input.allowSwitching,
    p_blind_launch_enabled: input.blindLaunchEnabled,
    p_blind_launch_prediction_threshold: input.blindLaunchPredictionThreshold,
    p_blind_launch_seconds: input.blindLaunchSeconds,
    p_blind_launch_ended_at: input.blindLaunchEndedAt || null,
    p_clear_blind_launch_ended_at: input.clearBlindLaunchEndedAt || false,
    p_ip: input.auditIp || null
  });
  return marketFromRow(result.market);
}

export async function moderateParticipantData(input: {
  participantId: string;
  action: ParticipantModerationAction;
  nickname?: string;
  auditIp?: string;
}) {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const participant = store.participants.find((item) => item.id === input.participantId);
      if (!participant) throw new Error("Participant not found.");
      if (input.action === "rename") participant.nickname = normalizeNickname(input.nickname || participant.nickname);
      if (input.action === "hide_avatar") participant.isAvatarHidden = true;
      if (input.action === "show_avatar") participant.isAvatarHidden = false;
      if (input.action === "ban") participant.isBanned = true;
      if (input.action === "unban") participant.isBanned = false;
      const marketIds = new Set(
        store.positions.filter((position) => position.participantId === participant.id).map((position) => position.marketId)
      );
      for (const marketId of marketIds) recomputeMarketAggregate(store, marketId);
      createAuditLog(store, {
        action: `participant_${input.action}`,
        entityType: "participant",
        entityId: participant.id,
        details: { nickname: participant.nickname },
        ip: input.auditIp
      });
      return participant;
    });
  }

  const store = await readSupabaseStore();
  const participant = store.participants.find((item) => item.id === input.participantId);
  if (!participant) throw new Error("Participant not found.");
  const patch: Row = {};
  if (input.action === "rename") patch.nickname = normalizeNickname(input.nickname || participant.nickname);
  if (input.action === "hide_avatar") patch.is_avatar_hidden = true;
  if (input.action === "show_avatar") patch.is_avatar_hidden = false;
  if (input.action === "ban") patch.is_banned = true;
  if (input.action === "unban") patch.is_banned = false;
  const updated = await patchRowsReturning("participants", `id=eq.${encodeURIComponent(input.participantId)}`, patch);
  const marketIds = new Set(
    store.positions.filter((position) => position.participantId === participant.id).map((position) => position.marketId)
  );
  for (const marketId of marketIds) await rpc("recompute_market_aggregate", { p_market_id: marketId });
  await upsertRows(
    "admin_audit_logs",
    [
      auditLogToRow({
        id: makeId("aud"),
        action: `participant_${input.action}`,
        entityType: "participant",
        entityId: participant.id,
        details: { nickname: patch.nickname || participant.nickname },
        ip: input.auditIp,
        createdAt: nowIso()
      })
    ],
    "id"
  );
  return participantFromRow(updated[0]);
}

export async function placePredictionData(
  sessionId: string,
  input: { participantId: string; marketId: string; outcomeId: string; amountCredits: number; requestId?: string }
): Promise<ReturnType<typeof placePrediction> & { user: UserMarketState }> {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const session = getSessionParticipant(store, sessionId);
      if (!session) throw new Error("Join the event before predicting.");
      const prediction = placePrediction(store, {
        ...input,
        participantId: session.participant.id,
        requestId: input.requestId
      });
      return {
        ...prediction,
        user: userMarketState(store, {
          participantId: session.participant.id,
          marketId: input.marketId
        })
      };
    });
  }
  const result = await rpc<Row>("place_prediction_tx", {
    p_session_id: sessionId,
    p_market_id: input.marketId,
    p_outcome_id: input.outcomeId,
    p_amount_credits: Math.floor(Number(input.amountCredits)),
    p_request_id: input.requestId?.trim().slice(0, 128) || null
  });
  const store = await readPublicMarketStoreData(input.marketId, sessionId);
  const position = positionFromRow(result.position);
  const user = userMarketState(store, {
    participantId: position.participantId,
    marketId: input.marketId
  });
  return {
    position,
    action: predictionActionFromRow(result.action),
    aggregate: aggregateFromRow(result.aggregate),
    wallet: walletFromRow(result.wallet),
    allowed: calculateAllowedStake(store, {
      participantId: position.participantId,
      marketId: input.marketId,
      outcomeId: input.outcomeId
    }),
    user
  };
}

export async function predictionPreviewData(
  sessionId: string | undefined,
  input: { marketId: string; outcomeId: string; amountCredits: number }
): Promise<PredictionPreview | undefined> {
  const store = await readPublicMarketStoreData(input.marketId, sessionId);
  const session = getSessionParticipant(store, sessionId);
  return predictionPreview(store, {
    participantId: session?.participant.id,
    marketId: input.marketId,
    outcomeId: input.outcomeId,
    amountCredits: input.amountCredits
  });
}

export async function runHouseAgentData(input: { eventSlug: string; agentId?: string; marketId: string }) {
  if (!useSupabaseStore()) return mutateStore((store) => runHouseAgent(store, input));

  await ensureHouseAgentsData(input.eventSlug);
  const store = await readSupabaseStore();
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
    await rpc<Row>("place_agent_prediction_tx", {
      p_participant_id: agent.participantId,
      p_market_id: market.id,
      p_outcome_id: outcome.id,
      p_amount_credits: amount
    });
    run.status = "placed";
    run.note = `${agent.name} committed ${amount} MegaBucks to ${outcome.label}.`;
  } catch (error) {
    run.status = "skipped";
    run.note = error instanceof Error ? error.message : "Agent skipped.";
  }

  await upsertRows("agent_runs", [agentRunToRow(run)], "id");
  return run;
}

export async function ensureHouseAgentsData(eventSlug = DEFAULT_EVENT_SLUG) {
  if (!useSupabaseStore()) return mutateStore((store) => upsertHouseAgents(store, eventSlug));
  await rpc("ensure_house_agents_tx", {
    p_event_slug: eventSlug
  });
  const store = await readSupabaseStore();
  const event = getEventOrThrow(store, eventSlug);
  return store.agentProfiles.filter((agent) => agent.eventId === event.id);
}

export async function transitionMarketData(marketId: string, action: "open" | "lock", auditIp?: string) {
  if (!useSupabaseStore()) return mutateStore((store) => transitionMarket(store, marketId, action, auditIp));
  return rpc("transition_market_tx", {
    p_market_id: marketId,
    p_action: action,
    p_ip: auditIp || null
  });
}

export async function resolveMarketData(
  marketId: string,
  input: { outcomeId: string; note: string; auditIp?: string }
) {
  if (!useSupabaseStore()) {
    return mutateStore((store) =>
      resolveMarket(store, marketId, {
        outcomeId: input.outcomeId,
        note: input.note,
        auditIp: input.auditIp
      })
    );
  }
  return rpc("resolve_market_tx", {
    p_market_id: marketId,
    p_outcome_id: input.outcomeId,
    p_note: input.note,
    p_ip: input.auditIp || null
  });
}

export async function featureMarketData(marketId: string, auditIp?: string) {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const market = store.markets.find((item) => item.id === marketId);
      if (!market) throw new Error("Market not found.");
      if (market.status === "draft" || market.status === "voided") {
        throw new Error("Only non-voided public markets can be featured on stage.");
      }
      const event = store.events.find((item) => item.id === market.eventId);
      if (!event) throw new Error("Event not found.");
      market.showOnStage = true;
      market.updatedAt = nowIso();
      event.featuredMarketId = market.id;
      createAuditLog(store, {
        action: "feature_market",
        entityType: "market",
        entityId: market.id,
        details: { title: market.title, eventSlug: event.slug },
        ip: auditIp
      });
      return { event, market };
    });
  }
  return rpc("feature_market_tx", {
    p_market_id: marketId,
    p_ip: auditIp || null
  });
}

export async function updateStageControlsData(input: {
  eventSlug: string;
  stageMode: StageMode;
  featuredMarketId?: string;
  emergencyPaused?: boolean;
}, auditIp?: string) {
  if (!useSupabaseStore()) {
    return mutateStore((store) => {
      const item = getEventOrThrow(store, input.eventSlug);
      const stageMarkets = store.markets.filter((candidate) =>
        candidate.eventId === item.id && candidate.status !== "draft" && candidate.status !== "voided" && candidate.showOnStage
      );
      const explicitMarket = input.featuredMarketId
        ? stageMarkets.find((candidate) => candidate.id === input.featuredMarketId)
        : undefined;
      const selectedMarket =
        input.stageMode === "resolution"
          ? (explicitMarket?.status === "resolved" ? explicitMarket : undefined) ||
            stageMarkets.find((candidate) => candidate.id === item.featuredMarketId && candidate.status === "resolved") ||
            stageMarkets.find((candidate) => candidate.status === "resolved")
          : explicitMarket || stageMarkets.find((candidate) => candidate.id === item.featuredMarketId) || stageMarkets[0];
      if (input.featuredMarketId && !explicitMarket) {
        throw new Error("Featured market is not available on stage.");
      }
      if (["live", "role_battle", "humans_vs_agents"].includes(input.stageMode) && !selectedMarket) {
        throw new Error("This stage mode needs a stage-visible market.");
      }
      if (input.stageMode === "resolution") {
        if (!selectedMarket) throw new Error("Resolution reveal needs a resolved stage-visible market.");
        if (selectedMarket.status !== "resolved") throw new Error("Resolution reveal needs a resolved market.");
      }
      item.stageMode = input.stageMode;
      if (selectedMarket) item.featuredMarketId = selectedMarket.id;
      if (input.emergencyPaused !== undefined) item.emergencyPaused = input.emergencyPaused;
      createAuditLog(store, {
        action: "stage_control",
        entityType: "event",
        entityId: item.id,
        details: { mode: input.stageMode, featuredMarketId: item.featuredMarketId, emergencyPaused: item.emergencyPaused },
        ip: auditIp
      });
      return item;
    });
  }
  const result = await rpc<Row>("update_stage_controls_tx", {
    p_event_slug: input.eventSlug,
    p_stage_mode: input.stageMode,
    p_featured_market_id: input.featuredMarketId || null,
    p_emergency_paused: input.emergencyPaused ?? null,
    p_ip: auditIp || null
  });
  return eventFromRow(result.event);
}

export async function voidMarketData(marketId: string, auditIp?: string) {
  if (!useSupabaseStore()) return mutateStore((store) => transitionMarket(store, marketId, "void", auditIp));
  return rpc("void_market_tx", {
    p_market_id: marketId,
    p_ip: auditIp || null
  });
}

export async function createPurchaseData(participantId: string) {
  if (!useSupabaseStore()) return mutateDataStore((store) => createPurchase(store, participantId));
  const purchase: Purchase = {
    id: makeId("pur"),
    participantId,
    status: "pending",
    amountEur: TEST_CHECKOUT_EUR,
    currency: "EUR",
    credits: TEST_CHECKOUT_CREDITS,
    createdAt: nowIso()
  };
  await upsertRows("purchases", [purchaseToRow(purchase)], "id");
  return purchase;
}

export async function attachPaymentToPurchaseData(
  purchaseId: string,
  payment: { molliePaymentId: string; checkoutUrl: string }
) {
  if (useSupabaseStore()) {
    const rows = await patchRowsReturning("purchases", `id=eq.${encodeURIComponent(purchaseId)}`, {
      mollie_payment_id: payment.molliePaymentId,
      checkout_url: payment.checkoutUrl
    });
    const updated = rows[0];
    if (!updated) throw new Error("Purchase disappeared.");
    return purchaseFromRow(updated);
  }
  return mutateDataStore((store) => {
    const item = store.purchases.find((candidate) => candidate.id === purchaseId);
    if (!item) throw new Error("Purchase disappeared.");
    item.molliePaymentId = payment.molliePaymentId;
    item.checkoutUrl = payment.checkoutUrl;
    return item;
  });
}

export async function creditPaidPurchaseData(purchaseId: string, status: PaymentStatus, auditIp?: string) {
  if (!useSupabaseStore()) return mutateStore((store) => creditPaidPurchase(store, purchaseId, status, auditIp));
  const result = await rpc<Row>("credit_purchase_tx", {
    p_purchase_id: purchaseId,
    p_status: status,
    p_ip: auditIp || null
  });
  return {
    purchase: purchaseFromRow(result.purchase),
    wallet: result.wallet ? walletFromRow(result.wallet) : undefined,
    credited: Boolean(result.credited)
  };
}

export async function verifyMcpWriteTokenData(request: NextRequest, participantId?: string) {
  if (process.env.NODE_ENV !== "production" && verifyBearerToken(request, process.env.MCP_WRITE_TOKEN)) return true;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token.length < 16) return false;
  const tokenHash = mcpTokenHash(token);
  const rows = useSupabaseStore()
    ? await selectRows("mcp_tokens", `select=participant_id,expires_at&token_hash=eq.${tokenHash}`)
    : readStore().mcpTokens.filter((item) => item.tokenHash === tokenHash).map((item) => ({
        participant_id: item.participantId || null,
        expires_at: item.expiresAt || null
      }));
  const now = Date.now();
  return rows.some((row) => {
    const tokenParticipant = row.participant_id as string | null;
    const expiresAt = row.expires_at as string | null;
    return (!tokenParticipant || tokenParticipant === participantId) && (!expiresAt || new Date(expiresAt).getTime() > now);
  });
}

export async function getMcpSessionParticipantData(request: NextRequest) {
  const cookieSession = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (cookieSession) return cookieSession;

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (token.length < 16) return null;
  const tokenHash = mcpTokenHash(token);
  const now = Date.now();

  if (!useSupabaseStore()) {
    const store = readStore();
    const scopedToken = store.mcpTokens.find((item) => {
      return item.tokenHash === tokenHash
        && Boolean(item.participantId)
        && (!item.expiresAt || new Date(item.expiresAt).getTime() > now);
    });
    if (!scopedToken?.participantId) return null;
    const session = store.participantSessions
      .filter((item) => item.participantId === scopedToken.participantId && new Date(item.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return getSessionParticipant(store, session?.id);
  }

  const tokenRows = await selectRows(
    "mcp_tokens",
    `select=participant_id,expires_at&token_hash=eq.${tokenHash}&participant_id=not.is.null`
  );
  const scopedToken = tokenRows.find((row) => {
    const expiresAt = row.expires_at as string | null;
    return !expiresAt || new Date(expiresAt).getTime() > now;
  });
  const participantId = scopedToken?.participant_id as string | undefined;
  if (!participantId) return null;
  const sessionRows = await selectRows(
    "participant_sessions",
    `select=*&participant_id=eq.${encodeURIComponent(participantId)}&expires_at=gt.${encodeURIComponent(nowIso())}&order=created_at.desc`
  );
  const session = sessionRows[0] ? sessionFromRow(sessionRows[0]) : undefined;
  return getSessionParticipantData(session?.id);
}

export async function createMcpWriteTokenData(input: {
  participantId?: string;
  expiresInHours?: number;
  auditIp?: string;
}) {
  const token = `mcp_${randomBytes(24).toString("base64url")}`;
  const now = nowIso();
  const expiresAt = new Date(Date.now() + Math.max(1, input.expiresInHours || 72) * 60 * 60 * 1000).toISOString();
  const record: McpToken = {
    id: makeId("mcp"),
    participantId: input.participantId || undefined,
    tokenHash: mcpTokenHash(token),
    createdAt: now,
    expiresAt
  };
  if (!useSupabaseStore()) {
    mutateStore((store) => {
      if (record.participantId && !store.participants.some((participant) => participant.id === record.participantId)) {
        throw new Error("Participant not found.");
      }
      store.mcpTokens.push(record);
      createAuditLog(store, {
        action: "create_mcp_token",
        entityType: "mcp_token",
        entityId: record.id,
        details: { participantId: record.participantId || "any", expiresAt },
        ip: input.auditIp
      });
    });
  } else {
    await upsertRows("mcp_tokens", [mcpTokenToRow(record)], "id");
    await upsertRows("admin_audit_logs", [
      auditLogToRow({
        id: makeId("aud"),
        action: "create_mcp_token",
        entityType: "mcp_token",
        entityId: record.id,
        details: { participantId: record.participantId || "any", expiresAt },
        ip: input.auditIp,
        createdAt: now
      })
    ], "id");
  }
  return {
    token,
    tokenId: record.id,
    participantId: record.participantId,
    expiresAt: record.expiresAt
  };
}
