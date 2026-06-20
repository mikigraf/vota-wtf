import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readDataStore } from "@/lib/data";
import { csvResponse, json, requireAdminRequest } from "@/lib/http";
import { analyticsReportRows, buildAdvancedAnalyticsReport } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const eventSlug = request.nextUrl.searchParams.get("eventSlug") || DEFAULT_EVENT_SLUG;
  const report = buildAdvancedAnalyticsReport(await readDataStore(), eventSlug);
  const format = request.nextUrl.searchParams.get("format");

  if (format === "csv") {
    return csvResponse("vota-advanced-analytics.csv", analyticsReportRows(report), ["section", "name", "metric", "value", "detail"]);
  }

  if (format === "cala") {
    return json({
      event: report.event,
      generatedAt: report.generatedAt,
      contextPacks: report.calaContextPacks
    });
  }

  if (format === "pixverse") {
    return json({
      event: report.event,
      generatedAt: report.generatedAt,
      promoBriefs: report.pixVersePromoBriefs
    });
  }

  return json(report);
}
