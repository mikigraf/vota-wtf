import { NextRequest } from "next/server";
import { readDataStore, updateMarketData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, requireAdminRequest } from "@/lib/http";
import { assertRequestSize, MAX_MARKET_FORM_BYTES, saveMarketImageFile } from "@/lib/uploads";
import { nowIso } from "@/lib/utils";

async function uploadedImageUrl(form: FormData, name: string, prefix: string) {
  const file = form.get(name);
  if (file instanceof File && file.size > 0) return saveMarketImageFile(prefix, file);
  return undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const store = await readDataStore();
  return json({
    market: store.markets.find((market) => market.id === id),
    outcomes: store.outcomes.filter((outcome) => outcome.marketId === id),
    aggregate: store.marketAggregates.find((aggregate) => aggregate.marketId === id)
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  try {
    assertRequestSize(request, MAX_MARKET_FORM_BYTES);
    const form = await request.formData();
    const auditIp = clientIpFromRequest(request);
    const current = await readDataStore();
    const existing = current.markets.find((item) => item.id === id);
    if (!existing) throw new Error("Market not found.");
    const expectedUpdatedAt = String(form.get("updatedAt") || "");
    if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
      throw new Error("Market changed since this form loaded. Refresh and try again.");
    }
    const canEditOutcomes = existing.status === "draft";
    const heroImageUrl = (await uploadedImageUrl(form, "imageFile", `${id}-hero`)) || String(form.get("imageUrl") || "");
    const outcomes = canEditOutcomes
      ? await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(async (index) => {
          const outcomeId = String(form.get(`outcome_${index}_id`) || "") || undefined;
          return {
            id: outcomeId,
            label: String(form.get(`outcome_${index}_label`) || ""),
            imageUrl:
              (await uploadedImageUrl(form, `outcome_${index}_imageFile`, outcomeId || `${id}-outcome-${index}`)) ||
              String(form.get(`outcome_${index}_imageUrl`) || ""),
            icon: String(form.get(`outcome_${index}_icon`) || "")
          };
        }))
      : undefined;
    await updateMarketData(id, expectedUpdatedAt || undefined, {
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      category: String(form.get("category") || "General"),
      imageUrl: heroImageUrl,
      resolutionRule: String(form.get("resolutionRule") || ""),
      outcomes,
      showOnStage: existing.status !== "voided" && form.get("showOnStage") === "on",
      allowSwitching: form.get("allowSwitching") === "on",
      fairLaunchOverride: form.get("fairLaunchOverride") === "on",
      fairLaunchPeopleThreshold: Number(form.get("fairLaunchPeopleThreshold") || 25),
      fairLaunchSignalCreditsThreshold: Number(form.get("fairLaunchSignalCreditsThreshold") || 5000),
      maxActionStake: Number(form.get("maxActionStake") || 250),
      blindLaunchEnabled: form.get("blindLaunchEnabled") === "on",
      blindLaunchPredictionThreshold: Number(form.get("blindLaunchPredictionThreshold") || 20),
      blindLaunchSeconds: Number(form.get("blindLaunchSeconds") || 120),
      blindLaunchEndedAt: form.get("endBlindLaunch") === "on" ? existing.blindLaunchEndedAt || nowIso() : undefined,
      clearBlindLaunchEndedAt: form.get("endBlindLaunch") !== "on",
      auditIp
    });
    return Response.redirect(new URL(`/admin/markets/${id}`, request.url), 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not update market.");
  }
}
