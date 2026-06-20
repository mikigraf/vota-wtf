import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { json, requireAdminRequest } from "@/lib/http";
import { buildReadinessReportWithLiveChecks, readinessHttpStatus } from "@/lib/readiness";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const eventSlug = request.nextUrl.searchParams.get("eventSlug") || DEFAULT_EVENT_SLUG;
  const report = await buildReadinessReportWithLiveChecks(await readDataStore(), process.env, eventSlug);
  return json(report, {
    status: readinessHttpStatus(report),
    headers: { "Cache-Control": "no-store" }
  });
}
