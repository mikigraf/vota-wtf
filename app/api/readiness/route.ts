import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { readPublicStateData } from "@/lib/data";
import { json } from "@/lib/http";
import { buildPublicReadinessReport, readinessHttpStatus } from "@/lib/readiness";

export async function GET(request: NextRequest) {
  const eventSlug = request.nextUrl.searchParams.get("eventSlug") || DEFAULT_EVENT_SLUG;
  let report;
  try {
    report = buildPublicReadinessReport(await readPublicStateData(eventSlug), process.env, eventSlug);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown event:")) {
      return json({
        ready: false,
        generatedAt: new Date().toISOString(),
        counts: { pass: 0, warn: 0, fail: 1 }
      }, {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      });
    }
    throw error;
  }
  return json({
    ready: report.ready,
    generatedAt: report.generatedAt,
    counts: report.counts
  }, {
    status: readinessHttpStatus(report),
    headers: { "Cache-Control": "no-store" }
  });
}
