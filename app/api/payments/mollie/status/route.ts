import { NextRequest } from "next/server";
import { findParticipantPurchaseData, getSessionParticipantData } from "@/lib/data";
import { getParticipantSessionIdFromRequest } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { verifyAndCreditPurchase } from "@/lib/payments";

export async function GET(request: NextRequest) {
  const purchaseId = request.nextUrl.searchParams.get("purchaseId") || "";
  if (!purchaseId) return badRequest("Missing purchase id.");
  const session = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (!session) return badRequest("Join the event before checking test checkout status.", 401);
  if (session.participant.isBanned) return badRequest("This profile is paused by moderation.", 403);
  if (!hasCompletedProfile(session.participant)) return badRequest("Finish your profile before checking test checkout status.", 401);
  const purchase = await findParticipantPurchaseData(session.participant.id, purchaseId);
  if (!purchase) return badRequest("Purchase not found.", 404);

  try {
    const result = purchase.status === "credited"
      ? { purchase, credited: false, status: purchase.status }
      : await verifyAndCreditPurchase(purchase);
    const nextSession = await getSessionParticipantData(session.session.id);
    const updatedPurchase = await findParticipantPurchaseData(session.participant.id, purchase.id) || result.purchase;
    return json({
      purchase: updatedPurchase,
      wallet: nextSession?.wallet,
      credited: result.credited,
      status: result.status
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not check test checkout status.");
  }
}
