import type { AdminAuditLog, Store } from "./types";
import type { SearchParamValue } from "./search-params";
import { firstSearchParam } from "./search-params";

export interface AuditLogFilters {
  action?: SearchParamValue;
  entityType?: SearchParamValue;
  eventSlug?: SearchParamValue;
  limit?: number;
  q?: SearchParamValue;
}

export function stringifyAuditDetails(details: Record<string, unknown>, space = 0) {
  try {
    return JSON.stringify(details, null, space) || "{}";
  } catch {
    return "{}";
  }
}

export function listAuditLogs(store: Store, filters: AuditLogFilters = {}) {
  const rawAction = firstSearchParam(filters.action);
  const rawEntityType = firstSearchParam(filters.entityType);
  const rawEventSlug = firstSearchParam(filters.eventSlug);
  const rawQuery = firstSearchParam(filters.q);
  const action = rawAction && rawAction !== "all" ? rawAction.toLowerCase() : "";
  const entityType = rawEntityType && rawEntityType !== "all" ? rawEntityType.toLowerCase() : "";
  const eventSlug = rawEventSlug && rawEventSlug !== "all" ? rawEventSlug : "";
  const event = eventSlug ? store.events.find((item) => item.slug === eventSlug) : undefined;
  const q = rawQuery?.trim().toLowerCase() || "";
  const requestedLimit = Number.isFinite(filters.limit) ? Number(filters.limit) : 250;
  const limit = Math.max(1, Math.min(Math.floor(requestedLimit || 250), 1000));
  if (eventSlug && !event) return [];

  return [...store.adminAuditLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((log) => matchesAuditLog(store, log, { action, entityType, eventId: event?.id || "", q }))
    .slice(0, limit);
}

function matchesAuditLog(
  store: Store,
  log: AdminAuditLog,
  filters: { action: string; entityType: string; eventId: string; q: string }
) {
  if (filters.action && log.action.toLowerCase() !== filters.action) return false;
  if (filters.entityType && log.entityType.toLowerCase() !== filters.entityType) return false;
  if (filters.eventId && eventIdForAuditLog(store, log) !== filters.eventId) return false;
  if (!filters.q) return true;
  const haystack = [
    log.action,
    log.entityType,
    log.entityId,
    log.ip || "",
    log.createdAt,
    stringifyAuditDetails(log.details)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.q);
}

function eventIdForAuditLog(store: Store, log: AdminAuditLog) {
  const detailsEventId = stringDetail(log.details, "eventId");
  if (detailsEventId && store.events.some((event) => event.id === detailsEventId)) return detailsEventId;
  const detailsEventSlug = stringDetail(log.details, "eventSlug");
  if (detailsEventSlug) return store.events.find((event) => event.slug === detailsEventSlug)?.id;

  const participantId = stringDetail(log.details, "participantId");
  const marketId = stringDetail(log.details, "marketId");
  const purchaseId = stringDetail(log.details, "purchaseId");
  const entityType = log.entityType.toLowerCase();

  if (entityType === "event") {
    return store.events.find((event) => event.id === log.entityId || event.slug === log.entityId)?.id;
  }
  if (entityType === "market") return eventIdForMarket(store, log.entityId);
  if (entityType === "outcome") {
    const outcome = store.outcomes.find((item) => item.id === log.entityId);
    return outcome ? eventIdForMarket(store, outcome.marketId) : undefined;
  }
  if (entityType === "participant") return eventIdForParticipant(store, log.entityId);
  if (entityType === "purchase") return eventIdForPurchase(store, log.entityId);
  if (entityType === "ledger_entry") return eventIdForLedgerEntry(store, log.entityId);
  if (entityType === "agent_profile") return store.agentProfiles.find((agent) => agent.id === log.entityId)?.eventId;
  if (entityType === "agent_run") {
    const run = store.agentRuns.find((item) => item.id === log.entityId);
    return run ? store.agentProfiles.find((agent) => agent.id === run.agentProfileId)?.eventId : undefined;
  }
  if (entityType === "mcp_token") {
    const token = store.mcpTokens.find((item) => item.id === log.entityId);
    if (token?.participantId) return eventIdForParticipant(store, token.participantId);
  }

  if (marketId) return eventIdForMarket(store, marketId);
  if (participantId) return eventIdForParticipant(store, participantId);
  if (purchaseId) return eventIdForPurchase(store, purchaseId);
  return undefined;
}

function stringDetail(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function eventIdForMarket(store: Store, marketId: string) {
  return store.markets.find((market) => market.id === marketId)?.eventId;
}

function eventIdForParticipant(store: Store, participantId: string) {
  return store.participants.find((participant) => participant.id === participantId)?.eventId;
}

function eventIdForPurchase(store: Store, purchaseId: string) {
  const purchase = store.purchases.find((item) => item.id === purchaseId || item.molliePaymentId === purchaseId);
  return purchase ? eventIdForParticipant(store, purchase.participantId) : undefined;
}

function eventIdForLedgerEntry(store: Store, ledgerEntryId: string) {
  const entry = store.ledgerEntries.find((item) => item.id === ledgerEntryId);
  if (!entry) return undefined;
  if (entry.marketId) return eventIdForMarket(store, entry.marketId);
  if (entry.purchaseId) return eventIdForPurchase(store, entry.purchaseId);
  return eventIdForParticipant(store, entry.participantId);
}
