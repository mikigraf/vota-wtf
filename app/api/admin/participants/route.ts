import { NextRequest } from "next/server";
import { moderateParticipantData, readDataStore } from "@/lib/data";
import { badRequest, clientIpFromRequest, csvResponse, json, requireAdminRequest } from "@/lib/http";
import { listParticipants } from "@/lib/participants";

const participantCsvColumns = [
  "id",
  "eventId",
  "nickname",
  "role",
  "participantType",
  "walletBalanceCredits",
  "totalIssuedCredits",
  "totalCommittedCredits",
  "isBanned",
  "isAvatarHidden",
  "avatarUrl",
  "oracleScore",
  "createdAt"
];
const moderationActions = new Set(["rename", "hide_avatar", "show_avatar", "ban", "unban"]);

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const store = await readDataStore();
  const participants = listParticipants(store, {
    eventSlug: request.nextUrl.searchParams.get("eventSlug") || undefined,
    q: request.nextUrl.searchParams.get("q") || undefined,
    role: request.nextUrl.searchParams.get("role") || undefined
  });
  const participantIds = new Set(participants.map((participant) => participant.id));
  const wallets = store.wallets.filter((wallet) => participantIds.has(wallet.participantId));
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return csvResponse(
      "vota-participants.csv",
      participants.map((participant) => {
        const wallet = wallets.find((item) => item.participantId === participant.id);
        return {
          id: participant.id,
          eventId: participant.eventId,
          nickname: participant.nickname,
          role: participant.role,
          participantType: participant.participantType,
          walletBalanceCredits: wallet?.balanceCredits || 0,
          totalIssuedCredits: wallet?.totalIssuedCredits || 0,
          totalCommittedCredits: wallet?.totalCommittedCredits || 0,
          isBanned: participant.isBanned,
          isAvatarHidden: participant.isAvatarHidden,
          avatarUrl: participant.isAvatarHidden ? "" : participant.avatarUrl || "",
          oracleScore: participant.oracleScore,
          createdAt: participant.createdAt
        };
      }),
      participantCsvColumns
    );
  }
  return json({ participants, wallets });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const participantId = String(form.get("participantId") || "");
  const action = String(form.get("action") || "");
  const redirectParams = new URLSearchParams();
  const eventSlug = String(form.get("eventSlug") || "");
  const query = String(form.get("q") || "");
  const role = String(form.get("role") || "");
  const auditIp = clientIpFromRequest(request);
  if (eventSlug) redirectParams.set("eventSlug", eventSlug);
  if (query) redirectParams.set("q", query);
  if (role && role !== "all") redirectParams.set("role", role);
  try {
    if (!moderationActions.has(action)) throw new Error("Unknown participant action.");
    await moderateParticipantData({
      participantId,
      action: action as "rename" | "hide_avatar" | "show_avatar" | "ban" | "unban",
      nickname: String(form.get("nickname") || ""),
      auditIp
    });
    const redirectTo = new URL("/admin/participants", request.url);
    redirectTo.search = redirectParams.toString();
    return Response.redirect(redirectTo, 303);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Could not update participant.");
  }
}
