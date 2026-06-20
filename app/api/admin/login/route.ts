import { NextRequest, NextResponse } from "next/server";
import { adminApiCookieName, adminCookieName, adminCookieOptions, signAdminToken, verifyAdminPassword } from "@/lib/auth";
import { adminLoginThrottleStatusData, clearAdminLoginFailuresData, recordAdminLoginFailureData } from "@/lib/data";
import { badRequest, json, readJsonObject } from "@/lib/http";

const attempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_ATTEMPT_COOKIE = "vota_admin_login_attempt";
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function loginAttemptCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: Math.ceil(WINDOW_MS / 1000),
    path: "/"
  };
}

function randomAttemptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function platformIpKey(request: NextRequest) {
  const requestIp = (request as NextRequest & { ip?: string }).ip;
  const platformIp =
    requestIp ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return `ip:${platformIp}`;
}

function attemptCookieKey(value: string) {
  return `cookie:${value}`;
}

function localThrottleStatus(key: string) {
  const current = attempts.get(key);
  const now = Date.now();
  if (!current || current.resetAt < now) {
    attempts.delete(key);
    return { allowed: true, failureCount: 0 };
  }
  return { allowed: current.count < MAX_ATTEMPTS, failureCount: current.count };
}

function recordLocalFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

async function throttleStatus(key: string) {
  const shared = await adminLoginThrottleStatusData(key);
  return shared || localThrottleStatus(key);
}

async function recordFailure(key: string) {
  const shared = await recordAdminLoginFailureData(key);
  if (!shared) recordLocalFailure(key);
}

async function clearFailures(key: string) {
  await clearAdminLoginFailuresData(key);
  attempts.delete(key);
}

async function throttleStatuses(keys: string[]) {
  return Promise.all(keys.map((key) => throttleStatus(key)));
}

async function recordFailures(keys: string[]) {
  await Promise.all(keys.map((key) => recordFailure(key)));
}

async function clearFailureBuckets(keys: string[]) {
  await Promise.all(keys.map((key) => clearFailures(key)));
}

function withAttemptCookie(response: NextResponse, attemptId: string) {
  response.cookies.set(LOGIN_ATTEMPT_COOKIE, attemptId, loginAttemptCookieOptions());
  return response;
}

async function readLoginBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const parsed = contentType.includes("application/json")
    ? await readJsonObject(request)
    : await request.formData().then((form) => Object.fromEntries(form.entries())).catch(() => ({}));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export async function POST(request: NextRequest) {
  const attemptId = request.cookies.get(LOGIN_ATTEMPT_COOKIE)?.value || randomAttemptId();
  const keys = [platformIpKey(request), attemptCookieKey(attemptId)];
  let throttles;
  try {
    throttles = await throttleStatuses(keys);
  } catch {
    return withAttemptCookie(badRequest("Admin login throttle is unavailable.", 503), attemptId);
  }
  if (throttles.some((throttle) => !throttle.allowed)) {
    return withAttemptCookie(badRequest("Too many attempts. Try again later.", 429), attemptId);
  }
  const contentType = request.headers.get("content-type") || "";
  const body = await readLoginBody(request);
  const password = String(body.password || "");
  let ok = false;
  try {
    ok = verifyAdminPassword(password);
  } catch (error) {
    return withAttemptCookie(badRequest(error instanceof Error ? error.message : "Admin auth is not configured.", 500), attemptId);
  }
  if (!ok) {
    try {
      await recordFailures(keys);
    } catch {
      return withAttemptCookie(badRequest("Admin login throttle is unavailable.", 503), attemptId);
    }
    return withAttemptCookie(badRequest("Invalid admin password.", 401), attemptId);
  }
  await clearFailureBuckets(keys);
  const token = await signAdminToken();
  if (contentType.includes("application/json")) {
    const response = json({ ok: true });
    response.cookies.set(adminCookieName(), token, adminCookieOptions("/admin"));
    response.cookies.set(adminApiCookieName(), token, adminCookieOptions("/api/admin"));
    return withAttemptCookie(response, attemptId);
  }
  const next = typeof body.next === "string" && body.next.startsWith("/admin") ? body.next : "/admin";
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set(adminCookieName(), token, adminCookieOptions("/admin"));
  response.cookies.set(adminApiCookieName(), token, adminCookieOptions("/api/admin"));
  return withAttemptCookie(response, attemptId);
}
