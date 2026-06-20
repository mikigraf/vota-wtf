import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE = "vota_admin_session";
const ADMIN_API_COOKIE = "vota_admin_api_session";
const PARTICIPANT_COOKIE = "vota_participant_session";
const JOIN_GUARD_COOKIE = "vota_join_guard";
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 18;
const PARTICIPANT_MAX_AGE_SECONDS = 60 * 60 * 48;
const JOIN_GUARD_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET must be set to at least 32 characters in production.");
  }
  return "dev-admin-session-secret-change-me-only";
}

export function adminPassword() {
  const value = process.env.ADMIN_PASSWORD;
  if (value && value.length >= 12) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD must be set to at least 12 characters in production.");
  }
  return "admin-dev-password";
}

export function verifyBearerToken(request: NextRequest, expected?: string) {
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const max = Math.max(token.length, expected.length);
  let diff = token.length ^ expected.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (token.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64url(input: ArrayBuffer | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signAdminToken() {
  const payload = base64url(JSON.stringify({ kind: "admin", exp: Date.now() + ADMIN_MAX_AGE_SECONDS * 1000 }));
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifyAdminToken(token?: string) {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  let expected = "";
  try {
    expected = await hmac(payload);
  } catch {
    return false;
  }
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(decodeBase64url(payload));
    return data.kind === "admin" && typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function verifyAdminPassword(input: string) {
  const expected = adminPassword();
  const max = Math.max(input.length, expected.length);
  let diff = input.length ^ expected.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (input.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function setAdminCookies(token: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, adminCookieOptions("/admin"));
  jar.set(ADMIN_API_COOKIE, token, adminCookieOptions("/api/admin"));
}

export async function clearAdminCookies() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { path: "/admin", maxAge: 0 });
  jar.set(ADMIN_API_COOKIE, "", { path: "/api/admin", maxAge: 0 });
}

export async function isAdminFromCookies() {
  const jar = await cookies();
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value || jar.get(ADMIN_API_COOKIE)?.value);
}

export async function isAdminFromRequest(request: NextRequest) {
  return verifyAdminToken(
    request.cookies.get(ADMIN_COOKIE)?.value || request.cookies.get(ADMIN_API_COOKIE)?.value
  );
}

export async function setParticipantCookie(sessionId: string) {
  const jar = await cookies();
  jar.set(PARTICIPANT_COOKIE, sessionId, participantCookieOptions());
}

export function participantCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: PARTICIPANT_MAX_AGE_SECONDS,
    path: "/"
  };
}

export function joinGuardCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: JOIN_GUARD_MAX_AGE_SECONDS,
    path: "/"
  };
}

export function adminCookieOptions(path: "/admin" | "/api/admin") {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ADMIN_MAX_AGE_SECONDS,
    path
  };
}

export function newJoinGuardValue() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getJoinGuardFromRequest(request: NextRequest) {
  return request.cookies.get(JOIN_GUARD_COOKIE)?.value;
}

export async function joinGuardHash(value: string, ip?: string, userAgent?: string) {
  void ip;
  void userAgent;
  return base64url(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    )
  );
}

export async function setJoinGuardCookie(value: string) {
  const jar = await cookies();
  jar.set(JOIN_GUARD_COOKIE, value, joinGuardCookieOptions());
}

export async function getParticipantSessionId() {
  const jar = await cookies();
  return jar.get(PARTICIPANT_COOKIE)?.value;
}

export function getParticipantSessionIdFromRequest(request: NextRequest) {
  return request.cookies.get(PARTICIPANT_COOKIE)?.value;
}

export function adminCookieName() {
  return ADMIN_COOKIE;
}

export function adminApiCookieName() {
  return ADMIN_API_COOKIE;
}

export function participantCookieName() {
  return PARTICIPANT_COOKIE;
}

export function joinGuardCookieName() {
  return JOIN_GUARD_COOKIE;
}
