import { NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest } from "@/lib/auth";
import { getSessionParticipantData, placePredictionData, predictionPreviewData, readPublicMarketStoreData } from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { getSessionParticipant, userMarketState } from "@/lib/store";

function predictionRequestId(request: NextRequest, body: Record<string, unknown>) {
  const header = request.headers.get("idempotency-key") || request.headers.get("x-idempotency-key") || "";
  const bodyValue = typeof body.requestId === "string"
    ? body.requestId
    : typeof body.idempotencyKey === "string"
      ? body.idempotencyKey
      : "";
  return (header || bodyValue).trim().slice(0, 128) || undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = getParticipantSessionIdFromRequest(request);
  const store = await readPublicMarketStoreData(id, sessionId);
  const session = getSessionParticipant(store, sessionId);
  const market = store.markets.find((item) => item.id === id && item.status !== "draft" && item.status !== "voided");
  if (!market) return badRequest("Market not found.", 404);
  if (session?.participant.isBanned) return badRequest("This profile is paused by moderation.", 403);
  if (!hasCompletedProfile(session?.participant)) return badRequest("Finish your profile before predicting.", 401);
  const outcomeId = request.nextUrl.searchParams.get("outcomeId") || "";
  const amountCredits = Number(request.nextUrl.searchParams.get("amountCredits") || 0);
  const preview = outcomeId
    ? await predictionPreviewData(sessionId, {
        marketId: id,
        outcomeId,
        amountCredits
      })
    : undefined;
  return json({
    user: userMarketState(store, {
      participantId: session?.participant.id,
      marketId: id
    }),
    preview
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (!session) return badRequest("Join the event before predicting.", 401);
  if (session.participant.isBanned) return badRequest("This profile is paused by moderation.", 403);
  if (!hasCompletedProfile(session.participant)) return badRequest("Finish your profile before predicting.", 401);
  const body = await readJsonObject(request);
  try {
    const result = await placePredictionData(session.session.id, {
      participantId: session.participant.id,
      marketId: id,
      outcomeId: String(body.outcomeId || ""),
      amountCredits: Number(body.amountCredits || 0),
      requestId: predictionRequestId(request, body)
    });
    return json({
      position: result.position,
      action: result.action,
      aggregate: result.aggregate,
      wallet: result.wallet,
      user: result.user
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Prediction failed.");
  }
}
