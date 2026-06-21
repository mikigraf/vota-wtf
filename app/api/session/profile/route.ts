import { NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest } from "@/lib/auth";
import { generatedAvatarDataUrl, isGeneratedAvatarUrl } from "@/lib/avatar";
import { findNextOpenMarketData, getSessionParticipantData, updateParticipantProfileData } from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";
import { hasCompletedProfile, isValidRole } from "@/lib/participants";
import { saveAvatarDataUrl } from "@/lib/uploads";
import { normalizeNickname, normalizeRole } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (!session) return badRequest("No participant session.", 401);
  return json({ participant: session.participant, wallet: session.wallet });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionParticipantData(getParticipantSessionIdFromRequest(request));
  if (!session) return badRequest("No participant session.", 401);
  if (session.participant.isBanned) return badRequest("This profile is paused by moderation.", 403);
  if (hasCompletedProfile(session.participant)) return badRequest("Profile is locked after entering the arena.", 409);
  const body = await readJsonObject(request);
  const rawNickname = String(body.nickname || "").trim();
  const rawRole = String(body.role || "");
  if (!rawNickname) return badRequest("Enter a stage name before joining.");
  if (!isValidRole(rawRole)) return badRequest("Choose your role before joining.");
  const nickname = normalizeNickname(rawNickname);
  const role = normalizeRole(rawRole);
  let avatarUrl: string | undefined;
  const submittedAvatar = typeof body.avatarDataUrl === "string" ? body.avatarDataUrl.trim() : "";
  if (submittedAvatar.startsWith("data:image/") && !isGeneratedAvatarUrl(submittedAvatar)) {
    try {
      avatarUrl = await saveAvatarDataUrl(session.participant.id, submittedAvatar);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Avatar upload failed.");
    }
  } else if (!session.participant.avatarUrl || isGeneratedAvatarUrl(session.participant.avatarUrl)) {
    avatarUrl = generatedAvatarDataUrl(nickname, role);
  }
  const participant = await updateParticipantProfileData(session.participant.id, {
    nickname,
    role,
    avatarUrl
  });
  const nextMarket = await findNextOpenMarketData(session.participant.eventId);
  return json({ participant, nextMarketId: nextMarket?.id });
}
