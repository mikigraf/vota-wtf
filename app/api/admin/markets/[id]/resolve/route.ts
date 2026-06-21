import { NextRequest } from "next/server";
import { readDataStore, resolveMarketData } from "@/lib/data";
import { adminActionError, clientIpFromRequest, requireAdminRequest } from "@/lib/http";

function normalizeConfirmation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const form = await request.formData();
  const returnTo = `/admin/markets/${id}`;
  try {
    if (form.get("confirmResolution") !== "on") throw new Error("Confirm the official result before resolving this market.");
    const outcomeId = String(form.get("outcomeId") || "");
    if (!outcomeId) throw new Error("Choose the official winning outcome before resolving this market.");
    const typedOutcomeLabel = String(form.get("confirmOutcomeLabel") || "");
    if (!typedOutcomeLabel.trim()) throw new Error("Type the winning outcome label before resolving this market.");
    const store = await readDataStore();
    const outcome = store.outcomes.find((item) => item.id === outcomeId && item.marketId === id);
    if (!outcome) throw new Error("Choose a valid winning outcome before resolving this market.");
    if (normalizeConfirmation(typedOutcomeLabel) !== normalizeConfirmation(outcome.label)) {
      throw new Error(`Type "${outcome.label}" to confirm this winner.`);
    }
    await resolveMarketData(id, {
      outcomeId,
      note: String(form.get("note") || "Resolved by organizer/admin."),
      auditIp: clientIpFromRequest(request)
    });
    return Response.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not resolve market.");
  }
}
