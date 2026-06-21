import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";
import {
  adminApiCookieName,
  getJoinGuardFromRequest,
  getParticipantSessionIdFromRequest,
  isAdminFromRequest,
  signAdminToken
} from "../src/lib/auth";

function requestWithRawCookie(cookie: string) {
  return {
    cookies: { get: () => undefined },
    headers: new Headers({ cookie })
  } as unknown as NextRequest;
}

function requestWithHeaders(headers: Record<string, string>) {
  return {
    cookies: { get: () => undefined },
    headers: new Headers(headers)
  } as unknown as NextRequest;
}

test("request cookie helpers fall back to the raw Cookie header", async () => {
  const token = await signAdminToken();
  const request = requestWithRawCookie(
    [
      "vota_join_guard=guard-123",
      "vota_participant_session=session-456",
      `${adminApiCookieName()}=${token}`
    ].join("; ")
  );

  assert.equal(getJoinGuardFromRequest(request), "guard-123");
  assert.equal(getParticipantSessionIdFromRequest(request), "session-456");
  assert.equal(await isAdminFromRequest(request), true);
});

test("participant session helper accepts the explicit session header", () => {
  assert.equal(
    getParticipantSessionIdFromRequest(requestWithHeaders({ "x-vota-participant-session": "session-789" })),
    "session-789"
  );
});

test("join guard helper accepts the explicit load-test guard header", () => {
  assert.equal(
    getJoinGuardFromRequest(requestWithHeaders({ "x-vota-guard-key": "load-guard-001" })),
    "load-guard-001"
  );
});
