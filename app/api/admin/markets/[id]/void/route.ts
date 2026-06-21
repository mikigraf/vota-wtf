import { NextRequest } from "next/server";
import { voidMarketData } from "@/lib/data";
import { adminActionError, clientIpFromRequest, requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const returnTo = `/admin/markets/${id}`;
  try {
    const form = await request.formData();
    if (String(form.get("confirmVoid") || "").trim() !== "VOID") {
      throw new Error("Type VOID before voiding this market.");
    }
    await voidMarketData(id, clientIpFromRequest(request));
    return Response.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not void market.");
  }
}
