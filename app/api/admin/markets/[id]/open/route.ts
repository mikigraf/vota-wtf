import { NextRequest } from "next/server";
import { transitionMarketData } from "@/lib/data";
import { badRequest, clientIpFromRequest, requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  try {
    await transitionMarketData(id, "open", clientIpFromRequest(request));
    return Response.redirect(new URL(`/admin/markets/${id}`, request.url), 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not open market.");
  }
}
