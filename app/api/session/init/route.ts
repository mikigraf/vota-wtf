import { NextRequest } from "next/server";
import {
  getJoinGuardFromRequest,
  joinGuardCookieName,
  joinGuardCookieOptions,
  joinGuardHash,
  newJoinGuardValue,
  participantCookieName,
  participantCookieOptions
} from "@/lib/auth";
import { DEFAULT_EVENT_SLUG } from "@/lib/constants";
import { initParticipantSessionData } from "@/lib/data";
import { badRequest, clientIpFromRequest, json, readJsonObject } from "@/lib/http";

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  const eventSlug = String(body.eventSlug || DEFAULT_EVENT_SLUG);
  const existingId = request.cookies.get("vota_participant_session")?.value;
  const guard = getJoinGuardFromRequest(request) || newJoinGuardValue();
  const guardKeyHash = await joinGuardHash(guard, clientIpFromRequest(request), request.headers.get("user-agent") || undefined);
  try {
    const result = await initParticipantSessionData(existingId, eventSlug, guardKeyHash);
    const response = json({
      sessionId: result.session.id,
      participant: result.participant,
      wallet: result.wallet
    });
    response.cookies.set(joinGuardCookieName(), guard, joinGuardCookieOptions());
    response.cookies.set(participantCookieName(), result.session.id, participantCookieOptions());
    return response;
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not start this event session.");
  }
}
