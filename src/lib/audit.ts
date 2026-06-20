import type { AdminAuditLog, Store } from "./types";
import type { SearchParamValue } from "./search-params";
import { firstSearchParam } from "./search-params";

export interface AuditLogFilters {
  action?: SearchParamValue;
  entityType?: SearchParamValue;
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
  const rawQuery = firstSearchParam(filters.q);
  const action = rawAction && rawAction !== "all" ? rawAction.toLowerCase() : "";
  const entityType = rawEntityType && rawEntityType !== "all" ? rawEntityType.toLowerCase() : "";
  const q = rawQuery?.trim().toLowerCase() || "";
  const requestedLimit = Number.isFinite(filters.limit) ? Number(filters.limit) : 250;
  const limit = Math.max(1, Math.min(Math.floor(requestedLimit || 250), 1000));

  return [...store.adminAuditLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((log) => matchesAuditLog(log, { action, entityType, q }))
    .slice(0, limit);
}

function matchesAuditLog(
  log: AdminAuditLog,
  filters: { action: string; entityType: string; q: string }
) {
  if (filters.action && log.action.toLowerCase() !== filters.action) return false;
  if (filters.entityType && log.entityType.toLowerCase() !== filters.entityType) return false;
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
