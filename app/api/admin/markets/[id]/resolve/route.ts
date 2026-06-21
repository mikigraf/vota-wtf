import { NextRequest } from "next/server";
import { resolveMarketData } from "@/lib/data";
import { adminActionError, clientIpFromRequest, requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const form = await request.formData();
  const returnTo = `/admin/markets/${id}`;
  try {
    if (form.get("confirmResolution") !== "on") throw new Error("Confirm the official result before resolving this market.");
    await resolveMarketData(id, {
      outcomeId: String(form.get("outcomeId") || ""),
      note: String(form.get("note") || "Resolved by organizer/admin."),
      auditIp: clientIpFromRequest(request)
    });
    return Response.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not resolve market.");
  }
}
