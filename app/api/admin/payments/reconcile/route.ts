import { NextRequest } from "next/server";
import { badRequest, clientIpFromRequest, json, readJsonObject, requireAdminRequest } from "@/lib/http";
import { verifyAndCreditPurchase } from "@/lib/payments";

function paymentsRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/payments", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url, 303);
}

async function purchaseIdFromRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await readJsonObject(request);
    return String(payload.purchaseId || payload.id || "");
  }
  const form = await request.formData();
  return String(form.get("purchaseId") || form.get("id") || "");
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const contentType = request.headers.get("content-type") || "";
  const wantsJson = contentType.includes("application/json");
  const purchaseId = await purchaseIdFromRequest(request);
  if (!purchaseId) {
    return wantsJson
      ? badRequest("Missing purchase id.")
      : paymentsRedirect(request, { error: "missing-purchase-id" });
  }

  try {
    const result = await verifyAndCreditPurchase(purchaseId, clientIpFromRequest(request));
    if (!wantsJson) {
      return paymentsRedirect(request, {
        reconciled: result.purchase.id,
        status: result.status,
        credited: result.credited ? "1" : "0"
      });
    }
    return json({ ok: true, purchase: result.purchase, credited: result.credited, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reconcile payment.";
    return wantsJson ? badRequest(message) : paymentsRedirect(request, { error: message.slice(0, 120) });
  }
}
