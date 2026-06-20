import { NextRequest } from "next/server";
import { listAuditLogs, stringifyAuditDetails } from "@/lib/audit";
import { readDataStore } from "@/lib/data";
import { csvResponse, json, requireAdminRequest } from "@/lib/http";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const store = await readDataStore();
  const logs = listAuditLogs(store, {
    action: request.nextUrl.searchParams.get("action") || undefined,
    entityType: request.nextUrl.searchParams.get("entityType") || undefined,
    limit: Number(request.nextUrl.searchParams.get("limit") || 250),
    q: request.nextUrl.searchParams.get("q") || undefined
  });

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return csvResponse(
      "vota-admin-audit.csv",
      logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        ip: log.ip || "",
        details: stringifyAuditDetails(log.details),
        createdAt: log.createdAt
      }))
    );
  }

  return json({ auditLogs: logs, total: store.adminAuditLogs.length });
}
