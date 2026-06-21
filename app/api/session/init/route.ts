import { NextRequest } from "next/server";
import {
  getJoinGuardFromRequest,
  getParticipantSessionIdFromRequest,
  joinGuardCookieName,
  joinGuardCookieOptions,
  joinGuardHash,
  newJoinGuardValue,
  participantCookieName,
  participantCookieOptions
} from "@/lib/auth";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { findNextOpenMarketData, initParticipantSessionData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, readJsonObject } from "@/lib/http";
import { hasCompletedProfile } from "@/lib/participants";
import { publicParticipant } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  const eventSlug = String(body.eventSlug || DEFAULT_EVENT_SLUG);
  const existingId = getParticipantSessionIdFromRequest(request);
  const guard = getJoinGuardFromRequest(request) || newJoinGuardValue();
  const guardKeyHash = await joinGuardHash(guard, clientIpFromRequest(request), request.headers.get("user-agent") || undefined);
  try {
    const result = await initParticipantSessionData(existingId, eventSlug, guardKeyHash);
    const profileComplete = hasCompletedProfile(result.participant);
    const nextMarket = profileComplete ? await findNextOpenMarketData(result.participant.eventId) : undefined;
    const response = json({
      sessionId: result.session.id,
      participant: publicParticipant(result.participant),
      wallet: result.wallet,
      profileComplete,
      nextMarketId: nextMarket?.id
    });
    response.cookies.set(joinGuardCookieName(), guard, joinGuardCookieOptions());
    response.cookies.set(participantCookieName(), result.session.id, participantCookieOptions());
    return response;
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not start this event session.");
  }
}
