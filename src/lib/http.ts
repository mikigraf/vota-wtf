import { NextResponse, type NextRequest } from "next/server";
import { getParticipantSessionIdFromRequest, isAdminFromRequest } from "./auth";
import { recordsToCsv } from "./csv";
import { readDataStore } from "./data";
import { getSessionParticipant } from "./store";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}

export function adminActionError(request: Request, returnPath: string, message: string) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) return badRequest(message);
  const url = new URL(returnPath || "/admin", request.url);
  url.searchParams.set("error", message.slice(0, 280));
  return Response.redirect(url, 303);
}

export async function readJsonObject(request: Request) {
  const parsed = await request.json().catch(() => ({}));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export async function requireAdminRequest(request: NextRequest) {
  const ok = await isAdminFromRequest(request);
  return ok ? null : json({ error: "Unauthorized" }, { status: 401 });
}

export async function getSessionFromRequest(request: NextRequest) {
  const store = await readDataStore();
  const sessionId = getParticipantSessionIdFromRequest(request);
  const session = getSessionParticipant(store, sessionId);
  return { store, session };
}

export function parseFormBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export function clientIpFromRequest(request: NextRequest | Request) {
  const headers = request.headers;
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined
  );
}

export function csvResponse(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]) {
  const body = recordsToCsv(rows, columns);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
