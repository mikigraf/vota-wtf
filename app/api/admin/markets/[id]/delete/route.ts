import { NextRequest } from "next/server";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { deleteMarketData, readDataStore } from "@/lib/data";
import { adminActionError, clientIpFromRequest, requireAdminRequest } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const store = await readDataStore();
  const market = store.markets.find((item) => item.id === id);
  const event = market ? store.events.find((item) => item.id === market.eventId) : undefined;
  const eventSlug = event?.slug || DEFAULT_EVENT_SLUG;
  const returnTo = market ? `/admin/markets/${id}` : `/admin/events/${eventSlug}`;
  try {
    const form = await request.formData();
    if (String(form.get("confirmDelete") || "").trim() !== "DELETE") {
      throw new Error("Type DELETE before permanently deleting this market.");
    }
    await deleteMarketData(id, clientIpFromRequest(request));
    return Response.redirect(new URL(`/admin/events/${eventSlug}`, request.url), 303);
  } catch (error) {
    return adminActionError(request, returnTo, error instanceof Error ? error.message : "Could not delete market.");
  }
}
