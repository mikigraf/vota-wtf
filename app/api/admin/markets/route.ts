import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { createMarketData, readDataStore } from "@/lib/data";
import { adminActionError, clientIpFromRequest, json, requireAdminRequest } from "@/lib/http";
import { assertRequestSize, MAX_MARKET_FORM_BYTES, saveMarketImageFile } from "@/lib/uploads";

async function uploadedImageUrl(form: FormData, name: string, prefix: string) {
  const file = form.get(name);
  if (file instanceof File && file.size > 0) return saveMarketImageFile(prefix, file);
  return undefined;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const store = await readDataStore();
  return json({
    markets: store.markets,
    outcomes: store.outcomes,
    aggregates: store.marketAggregates
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  let returnTo = "/admin/markets/new";
  try {
    assertRequestSize(request, MAX_MARKET_FORM_BYTES);
    const form = await request.formData();
    const auditIp = clientIpFromRequest(request);
    const eventSlug = String(form.get("eventSlug") || DEFAULT_EVENT_SLUG);
    returnTo = `/admin/markets/new?eventSlug=${encodeURIComponent(eventSlug)}`;
    const title = String(form.get("title") || "");
    const heroImageUrl = (await uploadedImageUrl(form, "imageFile", "market-hero")) || String(form.get("imageUrl") || "");
    const outcomes = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (index) => ({
      label: String(form.get(`outcome_${index}_label`) || ""),
      imageUrl:
        (await uploadedImageUrl(form, `outcome_${index}_imageFile`, `outcome-${index}`)) ||
        String(form.get(`outcome_${index}_imageUrl`) || ""),
      icon: String(form.get(`outcome_${index}_icon`) || "")
    })));
    const market = await createMarketData({
      eventSlug,
      title,
      description: String(form.get("description") || ""),
      category: String(form.get("category") || "General"),
      imageUrl: heroImageUrl,
      resolutionRule: String(form.get("resolutionRule") || ""),
      outcomes,
      showOnStage: form.get("showOnStage") === "on",
      fairLaunchOverride: form.get("fairLaunchOverride") === "on",
      fairLaunchPeopleThreshold: Number(form.get("fairLaunchPeopleThreshold") || 25),
      fairLaunchSignalCreditsThreshold: Number(form.get("fairLaunchSignalCreditsThreshold") || 5000),
      maxActionStake: Number(form.get("maxActionStake") || 250),
      allowSwitching: form.get("allowSwitching") !== null,
      blindLaunchEnabled: form.get("blindLaunchEnabled") === "on",
      blindLaunchPredictionThreshold: Number(form.get("blindLaunchPredictionThreshold") || 20),
      blindLaunchSeconds: Number(form.get("blindLaunchSeconds") || 120),
      auditIp
    });
    return Response.redirect(new URL(`/admin/markets/${market.id}`, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not create market.");
  }
}
