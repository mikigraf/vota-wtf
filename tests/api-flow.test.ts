import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { POST as adminLoginPost } from "../app/api/admin/login/route";
import { POST as initSessionPost } from "../app/api/session/init/route";
import { PATCH as profilePatch } from "../app/api/session/profile/route";
import { GET as predictionGet, POST as predictionPost } from "../app/api/markets/[id]/predict/route";
import { POST as createCheckoutPost } from "../app/api/payments/mollie/create-test-checkout/route";
import { GET as checkoutStatusGet } from "../app/api/payments/mollie/status/route";
import { POST as webhookPost } from "../app/api/payments/mollie/webhook/route";
import { GET as reportGet } from "../app/api/admin/report/route";
import { GET as readinessGet } from "../app/api/admin/readiness/route";
import { GET as auditGet } from "../app/api/admin/audit/route";
import { GET as adminMarketsGet } from "../app/api/admin/markets/route";
import { POST as createEventPost } from "../app/api/admin/events/route";
import { POST as reconcilePaymentPost } from "../app/api/admin/payments/reconcile/route";
import { GET as adminPaymentsGet } from "../app/api/admin/payments/route";
import { POST as createMcpTokenPost } from "../app/api/admin/mcp-tokens/route";
import { POST as participantsPost } from "../app/api/admin/participants/route";
import { POST as stagePost } from "../app/api/admin/stage/route";
import { POST as resolveMarketPost } from "../app/api/admin/markets/[id]/resolve/route";
import { POST as voidMarketPost } from "../app/api/admin/markets/[id]/void/route";
import { POST as deleteMarketPost } from "../app/api/admin/markets/[id]/delete/route";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "../app/mcp/route";
import { GET as publicReadinessGet } from "../app/api/readiness/route";
import { adminApiCookieName, signAdminToken } from "../src/lib/auth";
import { safeAdminNextPath, safeAdminReturnPath, safeCheckoutReturnPath, safeParticipantNextPath } from "../src/lib/safe-paths";
import {
  createMarket,
  createParticipantSession,
  createPurchase,
  createSeedStore,
  readStore,
  resolveMarket,
  SEED_IDS,
  transitionMarket,
  writeStore
} from "../src/lib/store";
import { verifyAndCreditPurchase } from "../src/lib/payments";

function request(
  url: string,
  init: { method?: string; headers?: HeadersInit; body?: BodyInit | null; cookie?: string } = {}
) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers
  });
}

function cookieHeader(response: Response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return [...setCookie.matchAll(/(vota_[^=]+)=([^;,\s]+)/g)]
    .map((match) => `${match[1]}=${match[2]}`)
    .join("; ");
}

async function adminCookieHeader() {
  return `${adminApiCookieName()}=${await signAdminToken()}`;
}

async function completeParticipantProfile(cookie: string, nickname = "route_builder") {
  const response = await profilePatch(
    request("http://localhost/api/session/profile", {
      method: "PATCH",
      cookie,
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ nickname, email: `${nickname}@example.test` })
    })
  );
  assert.equal(response.status, 200);
  return response.json();
}

test("actual route handlers support the Sunday participant checkout loop", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-api-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    assert.equal(init.status, 200);
    const initJson = await init.clone().json();
    assert.equal("role" in initJson.participant, false);
    const participantCookie = cookieHeader(init);
    assert.match(participantCookie, /vota_participant_session=/);

    const profile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "demo_druid", email: "demo.druid@example.test" })
      })
    );
    assert.equal(profile.status, 200);
    const profileJson = await profile.json();
    assert.equal(profileJson.participant.nickname, "demo_druid");
    assert.equal("email" in profileJson.participant, false);
    assert.equal("role" in profileJson.participant, false);
    assert.equal("nextMarketId" in profileJson, false);

    const recoveredInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    assert.equal(recoveredInit.status, 200);
    const recoveredJson = await recoveredInit.json();
    assert.equal(recoveredJson.profileComplete, true);
    assert.equal("nextMarketId" in recoveredJson, false);
    assert.equal(recoveredJson.participant.nickname, "demo_druid");

    const editedGeneratedAvatarProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          nickname: "demo_druid",
          email: "demo.druid@example.test",
          avatarDataUrl: profileJson.participant.avatarUrl
        })
      })
    );
    assert.equal(editedGeneratedAvatarProfile.status, 409);
    assert.match((await editedGeneratedAvatarProfile.json()).error, /locked after entering/);

    const avatarStore = readStore();
    const avatarParticipant = avatarStore.participants.find((item) => item.id === profileJson.participant.id);
    assert.ok(avatarParticipant);
    avatarParticipant.avatarUrl = "/uploads/avatars/demo-druid.webp";
    writeStore(avatarStore);
    const editedUploadedAvatarProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          nickname: "demo_druid",
          email: "demo.druid@example.test",
          avatarDataUrl: "/uploads/avatars/demo-druid.webp"
        })
      })
    );
    assert.equal(editedUploadedAvatarProfile.status, 409);
    assert.match((await editedUploadedAvatarProfile.json()).error, /locked after entering/);
    assert.equal(readStore().participants.find((item) => item.id === profileJson.participant.id)?.email, "demo.druid@example.test");

    for (const amountCredits of [undefined, "abc", 1.5]) {
      const invalidPrediction = await predictionPost(
        request(`http://localhost/api/markets/${SEED_IDS.markets.winner}/predict`, {
          method: "POST",
          cookie: participantCookie,
          headers: { "content-type": "application/json", origin: "http://localhost" },
          body: JSON.stringify({ outcomeId: SEED_IDS.outcomes.orbit, amountCredits })
        }),
        { params: Promise.resolve({ id: SEED_IDS.markets.winner }) }
      );
      assert.equal(invalidPrediction.status, 400);
      assert.match((await invalidPrediction.json()).error, /valid MegaBuck amount/);
    }

    const predictionRequestId = "route-double-submit-1";
    const prediction = await predictionPost(
      request(`http://localhost/api/markets/${SEED_IDS.markets.winner}/predict`, {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost", "idempotency-key": predictionRequestId },
        body: JSON.stringify({ outcomeId: SEED_IDS.outcomes.orbit, amountCredits: 100, requestId: predictionRequestId })
      }),
      { params: Promise.resolve({ id: SEED_IDS.markets.winner }) }
    );
    assert.equal(prediction.status, 200);
    const predictionJson = await prediction.json();
    assert.equal(predictionJson.position.outcomeId, SEED_IDS.outcomes.orbit);
    assert.equal(predictionJson.wallet.balanceCredits, 900);
    assert.equal("role" in predictionJson.user.participant, false);

    const duplicatePrediction = await predictionPost(
      request(`http://localhost/api/markets/${SEED_IDS.markets.winner}/predict`, {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost", "idempotency-key": predictionRequestId },
        body: JSON.stringify({ outcomeId: SEED_IDS.outcomes.orbit, amountCredits: 100, requestId: predictionRequestId })
      }),
      { params: Promise.resolve({ id: SEED_IDS.markets.winner }) }
    );
    assert.equal(duplicatePrediction.status, 200);
    const duplicatePredictionJson = await duplicatePrediction.json();
    assert.equal(duplicatePredictionJson.action.id, predictionJson.action.id);
    assert.equal(duplicatePredictionJson.wallet.balanceCredits, 900);
    assert.equal(readStore().predictionActions.filter((action) => action.marketId === SEED_IDS.markets.winner).length, 1);

    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(checkout.status, 200);
    const checkoutJson = await checkout.json();
    assert.match(checkoutJson.checkoutUrl, /\/checkout\/test\//);
    assert.match(checkoutJson.copy, /MegaBucks stay inside vota\.wtf\./);
    assert.equal(checkoutJson.purchase.status, "pending");

    const repeatedCheckout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(repeatedCheckout.status, 200);
    const repeatedCheckoutJson = await repeatedCheckout.json();
    assert.notEqual(repeatedCheckoutJson.purchase.id, checkoutJson.purchase.id);
    const checkoutStore = readStore();
    assert.equal(checkoutStore.purchases.find((item) => item.id === checkoutJson.purchase.id)?.status, "credited");
    assert.equal(checkoutStore.purchases.length, 2);
    assert.equal(checkoutStore.checkoutIntents.length, 1);
    assert.equal(checkoutStore.checkoutIntents[0]?.clickCount, 2);
    assert.equal(checkoutStore.checkoutIntents[0]?.purchaseId, repeatedCheckoutJson.purchase.id);

    const webhook = await webhookPost(
      request("http://localhost/api/payments/mollie/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ purchaseId: checkoutJson.purchase.id })
      })
    );
    assert.equal(webhook.status, 200);
    const webhookJson = await webhook.json();
    assert.equal(webhookJson.purchase.status, "credited");
    const wallet = readStore().wallets.find((item) => item.participantId === predictionJson.position.participantId);
    assert.equal(wallet?.balanceCredits, 1000);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("profile route rejects duplicate emails inside the same event", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-api-duplicate-email-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());
    const firstInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const firstCookie = cookieHeader(firstInit);
    const firstProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: firstCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "email_owner", email: "shared@example.test" })
      })
    );
    assert.equal(firstProfile.status, 200);

    const secondInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", "x-vota-guard-key": "second-email-device" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const duplicateProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: cookieHeader(secondInit),
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "email_second", email: "shared@example.test" })
      })
    );
    assert.equal(duplicateProfile.status, 400);
    assert.match((await duplicateProfile.json()).error, /email is already in the arena/);

    const unsupportedInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", "x-vota-guard-key": "unsupported-name-device" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const unsupportedProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: cookieHeader(unsupportedInit),
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "🔥🔥🔥", email: "unsupported@example.test" })
      })
    );
    assert.equal(unsupportedProfile.status, 400);
    assert.match((await unsupportedProfile.json()).error, /letters, numbers, spaces, dots, dashes, or underscores/);

    const testingInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", "x-vota-guard-key": "testing-email-device" },
        body: JSON.stringify({ eventSlug: "testingmiki" })
      })
    );
    const testingProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: cookieHeader(testingInit),
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "testing_email", email: "shared@example.test" })
      })
    );
    assert.equal(testingProfile.status, 200);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin participant moderation updates live market signal atomically", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-moderation-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const market = createMarket(store, {
      eventSlug: "megathon",
      title: "Moderation integrity check",
      description: "Disposable market for aggregate moderation coverage.",
      category: "Test",
      resolutionRule: "Resolved by test.",
      outcomes: [{ label: "Alpha" }, { label: "Beta" }],
      fairLaunchOverride: false,
      fairLaunchPeopleThreshold: 10,
      fairLaunchSignalCreditsThreshold: 1000,
      maxActionStake: 250,
      blindLaunchEnabled: false
    });
    transitionMarket(store, market.id, "open");
    writeStore(store);

    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    assert.equal(init.status, 200);
    const participantCookie = cookieHeader(init);
    const profile = await completeParticipantProfile(participantCookie, "moderated_one");
    const participantId = profile.participant.id;
    const outcomeId = readStore().outcomes.find((item) => item.marketId === market.id)?.id;
    assert.ok(outcomeId);

    const prediction = await predictionPost(
      request(`http://localhost/api/markets/${market.id}/predict`, {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost", "idempotency-key": "moderation-1" },
        body: JSON.stringify({ outcomeId, amountCredits: 100, requestId: "moderation-1" })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(prediction.status, 200);
    assert.equal(readStore().marketAggregates.find((item) => item.marketId === market.id)?.totalPeople, 1);

    const adminCookie = await adminCookieHeader();
    const ban = await participantsPost(
      request("http://localhost/api/admin/participants", {
        method: "POST",
        cookie: adminCookie,
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: new URLSearchParams({ participantId, action: "ban", eventSlug: "megathon" })
      })
    );
    assert.equal(ban.status, 303);
    const bannedStore = readStore();
    const bannedParticipant = bannedStore.participants.find((item) => item.id === participantId);
    const bannedAggregate = bannedStore.marketAggregates.find((item) => item.marketId === market.id);
    assert.equal(bannedParticipant?.isBanned, true);
    assert.equal(bannedAggregate?.totalPeople, 0);
    assert.equal(bannedAggregate?.totalSignalCredits, 0);
    assert.ok(bannedStore.adminAuditLogs.some((item) => item.action === "participant_ban" && item.entityId === participantId));

    const blockedPrediction = await predictionGet(
      request(`http://localhost/api/markets/${market.id}/predict?outcomeId=${outcomeId}&amountCredits=100`, {
        method: "GET",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(blockedPrediction.status, 403);

    const unban = await participantsPost(
      request("http://localhost/api/admin/participants", {
        method: "POST",
        cookie: adminCookie,
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: new URLSearchParams({ participantId, action: "unban", eventSlug: "megathon" })
      })
    );
    assert.equal(unban.status, 303);
    const unbannedAggregate = readStore().marketAggregates.find((item) => item.marketId === market.id);
    assert.equal(unbannedAggregate?.totalPeople, 1);
    assert.equal(unbannedAggregate?.totalSignalCredits, 98);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin mutation middleware rejects cross-origin posts", async () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = "a".repeat(48);
  try {
    const login = await adminLoginPost(
      request("http://localhost/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ password: process.env.ADMIN_PASSWORD })
      })
    );
    assert.equal(login.status, 200);
    const adminCookie = cookieHeader(login);
    assert.match(adminCookie, /vota_admin_api_session=/);

    const blocked = await middleware(
      request("http://localhost/api/admin/stage", {
        method: "POST",
        cookie: adminCookie,
        headers: { origin: "http://evil.test" }
      })
    );
    assert.equal(blocked.status, 403);

    const allowed = await middleware(
      request("http://localhost/api/admin/stage", {
        method: "POST",
        cookie: adminCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(allowed.status, 200);
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("admin login form failures redirect back with inline error state", async () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = "b".repeat(48);
  try {
    const response = await adminLoginPost(
      request("http://localhost/api/admin/login", {
        method: "POST",
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          password: "wrong password",
          next: "/admin/stage"
        })
      })
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") || "");
    assert.equal(location.pathname, "/admin/login");
    assert.equal(location.searchParams.get("next"), "/admin/stage");
    assert.match(location.searchParams.get("error") || "", /Invalid admin password/);
    assert.match(cookieHeader(response), /vota_admin_login_attempt=/);
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("admin middleware preserves scoped query params through login", async () => {
  const response = await middleware(request("http://localhost/admin/payments?eventSlug=testingmiki"));
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location") || "");
  assert.equal(location.pathname, "/admin/login");
  assert.equal(location.searchParams.get("next"), "/admin/payments?eventSlug=testingmiki");
});

test("local redirect helpers reject malformed or privileged paths", () => {
  assert.equal(safeParticipantNextPath("/m/market-1?from=qr"), "/m/market-1?from=qr");
  assert.equal(safeParticipantNextPath("/e/megathon?checkout=abc"), "/e/megathon?checkout=abc");
  assert.equal(safeParticipantNextPath("/admin/stage"), "");
  assert.equal(safeParticipantNextPath("/api/session/init"), "");
  assert.equal(safeParticipantNextPath("//evil.test/admin"), "");
  assert.equal(safeParticipantNextPath("/m\\evil"), "");
  assert.equal(safeParticipantNextPath("/m/%5cevil"), "");
  assert.equal(safeAdminNextPath("/admin/payments?eventSlug=testingmiki"), "/admin/payments?eventSlug=testingmiki");
  assert.equal(safeAdminNextPath("/admin/login?next=/admin"), "/admin");
  assert.equal(safeAdminNextPath("/administrator"), "/admin");
  assert.equal(safeAdminNextPath("//evil.test/admin"), "/admin");
  assert.equal(safeAdminReturnPath("/admin/events/megathon", "/admin/stage"), "/admin/events/megathon");
  assert.equal(safeAdminReturnPath("/e/megathon", "/admin/stage"), "/admin/stage");
  assert.equal(safeCheckoutReturnPath("/m/abc?checkout=old&tab=odds", "megathon"), "/m/abc?tab=odds");
  assert.equal(safeCheckoutReturnPath("/admin/stage", "megathon"), "/e/megathon");
  assert.equal(safeCheckoutReturnPath("/api/readiness", "megathon"), "/e/megathon");
  assert.equal(safeCheckoutReturnPath("//evil.test/pay", "megathon"), "/e/megathon");
});

test("admin participant moderation form failures redirect back with context", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-participant-error-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());
    const participant = readStore().participants[0];
    assert.ok(participant);
    const response = await participantsPost(
      request("http://localhost/api/admin/participants", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          eventSlug: "megathon-2026",
          q: "oracle",
          participantId: participant.id,
          action: "teleport"
        })
      })
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") || "");
    assert.equal(location.pathname, "/admin/participants");
    assert.equal(location.searchParams.get("eventSlug"), "megathon-2026");
    assert.equal(location.searchParams.get("q"), "oracle");
    assert.equal(location.searchParams.get("role"), null);
    assert.match(location.searchParams.get("error") || "", /Unknown participant action/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin participant moderation rejects cross-event participant ids", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-participant-event-scope-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const sideParticipant = createParticipantSession(store, "testingmiki").participant;
    writeStore(store);
    const response = await participantsPost(
      request("http://localhost/api/admin/participants", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          eventSlug: "megathon",
          participantId: sideParticipant.id,
          action: "ban"
        })
      })
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") || "");
    assert.equal(location.pathname, "/admin/participants");
    assert.equal(location.searchParams.get("eventSlug"), "megathon");
    assert.match(location.searchParams.get("error") || "", /Participant does not belong to this event/);
    assert.equal(readStore().participants.find((participant) => participant.id === sideParticipant.id)?.isBanned, false);

    const missingEventContext = await participantsPost(
      request("http://localhost/api/admin/participants", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          participantId: sideParticipant.id,
          action: "ban"
        })
      })
    );
    assert.equal(missingEventContext.status, 303);
    const missingEventLocation = new URL(missingEventContext.headers.get("location") || "");
    assert.equal(missingEventLocation.pathname, "/admin/participants");
    assert.equal(missingEventLocation.searchParams.get("eventSlug"), "megathon");
    assert.match(missingEventLocation.searchParams.get("error") || "", /Event context is required/);
    assert.equal(readStore().participants.find((participant) => participant.id === sideParticipant.id)?.isBanned, false);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin markets API is scoped to the selected event", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-admin-market-scope-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    writeStore(store);
    const testingEvent = store.events.find((event) => event.slug === "testingmiki");
    const megathonEvent = store.events.find((event) => event.slug === "megathon");
    assert.ok(testingEvent);
    assert.ok(megathonEvent);

    const testingResponse = await adminMarketsGet(
      request("http://localhost/api/admin/markets?eventSlug=testingmiki", {
        cookie: await adminCookieHeader()
      })
    );
    assert.equal(testingResponse.status, 200);
    const testingPayload = await testingResponse.json();
    assert.equal(testingPayload.event.slug, "testingmiki");
    assert.equal(testingPayload.markets.length > 0, true);
    assert.equal(testingPayload.markets.every((market: { eventId: string }) => market.eventId === testingEvent.id), true);
    assert.equal(testingPayload.markets.some((market: { eventId: string }) => market.eventId === megathonEvent.id), false);
    const testingMarketIds = new Set(testingPayload.markets.map((market: { id: string }) => market.id));
    assert.equal(testingPayload.outcomes.every((outcome: { marketId: string }) => testingMarketIds.has(outcome.marketId)), true);
    assert.equal(testingPayload.aggregates.every((aggregate: { marketId: string }) => testingMarketIds.has(aggregate.marketId)), true);

    const defaultResponse = await adminMarketsGet(
      request("http://localhost/api/admin/markets", {
        cookie: await adminCookieHeader()
      })
    );
    assert.equal(defaultResponse.status, 200);
    const defaultPayload = await defaultResponse.json();
    assert.equal(defaultPayload.event.slug, "megathon");
    assert.equal(defaultPayload.markets.every((market: { eventId: string }) => market.eventId === megathonEvent.id), true);
    assert.equal(defaultPayload.markets.some((market: { eventId: string }) => market.eventId === testingEvent.id), false);

    const missingResponse = await adminMarketsGet(
      request("http://localhost/api/admin/markets?eventSlug=missing-room", {
        cookie: await adminCookieHeader()
      })
    );
    assert.equal(missingResponse.status, 404);
    assert.match((await missingResponse.json()).error, /Event not found/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin events API creates new rooms and rejects duplicate slugs", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-admin-create-event-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());
    const form = new FormData();
    form.set("name", "Demo Night Finals");
    form.set("slug", "Demo Night Finals!");
    form.set("status", "live");
    form.set("starterCredits", "1500");
    form.set("returnTo", "/admin/events");

    const response = await createEventPost(
      request("http://localhost/api/admin/events", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { origin: "http://localhost" },
        body: form
      })
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") || "");
    assert.equal(location.pathname, "/admin/events/demo-night-finals");

    const store = readStore();
    const event = store.events.find((item) => item.slug === "demo-night-finals");
    assert.ok(event);
    assert.equal(event.name, "Demo Night Finals");
    assert.equal(event.status, "live");
    assert.equal(event.starterCredits, 1500);
    assert.equal(event.stageMode, "join");
    assert.equal(store.adminAuditLogs.some((log) => log.action === "create_event" && log.entityId === event.id), true);

    const duplicate = await createEventPost(
      request("http://localhost/api/admin/events", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", accept: "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          name: "Duplicate Demo Night",
          slug: "demo-night-finals",
          returnTo: "/admin/events"
        })
      })
    );
    assert.equal(duplicate.status, 400);
    assert.match((await duplicate.json()).error, /already in use/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin audit API defaults to the selected room instead of leaking all rooms", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-admin-audit-scope-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const megathonMarket = createMarket(store, {
      eventSlug: "megathon",
      title: "Megathon audit scoped market",
      description: "Visible only in Megathon audit logs.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    const testingMarket = createMarket(store, {
      eventSlug: "testingmiki",
      title: "Testingmiki audit scoped market",
      description: "Visible only in testingmiki audit logs.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    writeStore(store);

    const defaultResponse = await auditGet(
      request("http://localhost/api/admin/audit?action=create_market&q=audit%20scoped", {
        cookie: await adminCookieHeader()
      })
    );
    assert.equal(defaultResponse.status, 200);
    const defaultPayload = await defaultResponse.json();
    assert.equal(defaultPayload.auditLogs.some((log: { entityId: string }) => log.entityId === megathonMarket.id), true);
    assert.equal(defaultPayload.auditLogs.some((log: { entityId: string }) => log.entityId === testingMarket.id), false);

    const testingResponse = await auditGet(
      request("http://localhost/api/admin/audit?eventSlug=testingmiki&action=create_market&q=audit%20scoped", {
        cookie: await adminCookieHeader()
      })
    );
    assert.equal(testingResponse.status, 200);
    const testingPayload = await testingResponse.json();
    assert.equal(testingPayload.auditLogs.some((log: { entityId: string }) => log.entityId === testingMarket.id), true);
    assert.equal(testingPayload.auditLogs.some((log: { entityId: string }) => log.entityId === megathonMarket.id), false);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("event admin stage controls return to the selected event control room", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-stage-return-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());
    const body = new URLSearchParams({
      eventSlug: "megathon-2026",
      stageMode: "join",
      returnTo: "/admin/events/megathon-2026"
    });
    const response = await stagePost(
      request("http://localhost/api/admin/stage", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body
      })
    );
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get("location") || "").pathname, "/admin/events/megathon-2026");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("event admin stage controls honor a selected resolved market", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-stage-resolution-select-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const first = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "First resolved",
      description: "Resolved but not selected.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      showOnStage: true,
      outcomes: [{ label: "A" }, { label: "B" }]
    });
    const second = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Second resolved",
      description: "Operator selected this market.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    for (const market of [first, second]) {
      const [winningOutcome] = store.outcomes.filter((outcome) => outcome.marketId === market.id);
      assert.ok(winningOutcome);
      transitionMarket(store, market.id, "open");
      transitionMarket(store, market.id, "lock");
      resolveMarket(store, market.id, { outcomeId: winningOutcome.id, note: "Resolved for route test." });
    }
    writeStore(store);

    const body = new URLSearchParams({
      eventSlug: "megathon-2026",
      stageMode: "resolution",
      featuredMarketId: second.id,
      returnTo: "/admin/stage"
    });
    const response = await stagePost(
      request("http://localhost/api/admin/stage", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body
      })
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.event.stageMode, "resolution");
    assert.equal(payload.event.featuredMarketId, second.id);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("event admin stage controls recover from stale resolved live selection", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-stage-stale-live-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const resolved = createMarket(store, {
      eventSlug: "megathon-2026",
      title: "Resolved stale selection",
      description: "Should not block returning to live stage mode.",
      category: "Ops",
      resolutionRule: "Admin resolves.",
      showOnStage: true,
      outcomes: [{ label: "Yes" }, { label: "No" }]
    });
    const [winningOutcome] = store.outcomes.filter((outcome) => outcome.marketId === resolved.id);
    assert.ok(winningOutcome);
    transitionMarket(store, resolved.id, "open");
    transitionMarket(store, resolved.id, "lock");
    resolveMarket(store, resolved.id, { outcomeId: winningOutcome.id, note: "Resolved for stale live route test." });
    store.events[0].stageMode = "resolution";
    store.events[0].featuredMarketId = resolved.id;
    writeStore(store);

    const response = await stagePost(
      request("http://localhost/api/admin/stage", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          eventSlug: "megathon-2026",
          stageMode: "live",
          featuredMarketId: resolved.id,
          returnTo: "/admin/stage"
        })
      })
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.event.stageMode, "live");
    assert.notEqual(payload.event.featuredMarketId, resolved.id);
    const featured = readStore().markets.find((market) => market.id === payload.event.featuredMarketId);
    assert.ok(featured);
    assert.notEqual(featured.status, "resolved");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin resolve form requires official-result confirmation before mutating market", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-resolve-confirm-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const market = store.markets.find((item) => item.id === SEED_IDS.markets.winner);
    assert.ok(market);
    transitionMarket(store, market.id, "lock");
    writeStore(store);

    const response = await resolveMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/resolve`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          outcomeId: SEED_IDS.outcomes.orbit,
          note: "Official stage result."
        })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location") || "");
    assert.equal(location.pathname, `/admin/markets/${market.id}`);
    assert.match(location.searchParams.get("error") || "", /Confirm the official result/);
    const after = readStore().markets.find((item) => item.id === market.id);
    assert.equal(after?.status, "locked");
    assert.equal(after?.resolvedOutcomeId, undefined);

    const emptyWinner = await resolveMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/resolve`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          confirmResolution: "on",
          note: "Official stage result."
        })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(emptyWinner.status, 303);
    const emptyLocation = new URL(emptyWinner.headers.get("location") || "");
    assert.match(emptyLocation.searchParams.get("error") || "", /Choose the official winning outcome/);

    const wrongTypedLabel = await resolveMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/resolve`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({
          confirmResolution: "on",
          outcomeId: SEED_IDS.outcomes.orbit,
          confirmOutcomeLabel: "Team Nova",
          note: "Official stage result."
        })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(wrongTypedLabel.status, 303);
    const wrongLabelLocation = new URL(wrongTypedLabel.headers.get("location") || "");
    assert.match(wrongLabelLocation.searchParams.get("error") || "", /Type "Team Orbit"/);
    const stillLocked = readStore().markets.find((item) => item.id === market.id);
    assert.equal(stillLocked?.status, "locked");
    assert.equal(stillLocked?.resolvedOutcomeId, undefined);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin void route requires typed confirmation before mutating market", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-void-confirm-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const market = store.markets.find((item) => item.id === SEED_IDS.markets.winner);
    assert.ok(market);
    writeStore(store);

    const missing = await voidMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/void`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams()
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(missing.status, 303);
    const missingLocation = new URL(missing.headers.get("location") || "");
    assert.equal(missingLocation.pathname, `/admin/markets/${market.id}`);
    assert.match(missingLocation.searchParams.get("error") || "", /Type VOID/);
    assert.equal(readStore().markets.find((item) => item.id === market.id)?.status, "open");

    const confirmed = await voidMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/void`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({ confirmVoid: "VOID" })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(confirmed.status, 303);
    assert.equal(readStore().markets.find((item) => item.id === market.id)?.status, "voided");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin delete route requires typed confirmation and removes market-scoped data", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-delete-market-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const market = store.markets.find((item) => item.id === SEED_IDS.markets.winner);
    assert.ok(market);
    writeStore(store);

    const missing = await deleteMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/delete`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams()
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(missing.status, 303);
    const missingLocation = new URL(missing.headers.get("location") || "");
    assert.equal(missingLocation.pathname, `/admin/markets/${market.id}`);
    assert.match(missingLocation.searchParams.get("error") || "", /Type DELETE/);
    assert.ok(readStore().markets.find((item) => item.id === market.id));

    const confirmed = await deleteMarketPost(
      request(`http://localhost/api/admin/markets/${market.id}/delete`, {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost"
        },
        body: new URLSearchParams({ confirmDelete: "DELETE" })
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    assert.equal(confirmed.status, 303);
    const confirmedLocation = new URL(confirmed.headers.get("location") || "");
    assert.equal(confirmedLocation.pathname, "/admin/events/megathon-2026");
    const updated = readStore();
    assert.equal(updated.markets.some((item) => item.id === market.id), false);
    assert.equal(updated.outcomes.some((item) => item.marketId === market.id), false);
    assert.equal(updated.marketAggregates.some((item) => item.marketId === market.id), false);
    assert.notEqual(updated.events.find((item) => item.slug === "megathon-2026")?.featuredMarketId, market.id);
    assert.ok(updated.adminAuditLogs.some((item) => item.action === "delete_market" && item.entityId === market.id));
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("session init returns a controlled error for unknown event links", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-unknown-event-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());
    const response = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "missing-live-event" })
      })
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Unknown event/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin route handlers reject direct calls without an admin session cookie", async () => {
  const response = await reconcilePaymentPost(
    request("http://localhost/api/admin/payments/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ purchaseId: "pur_missing" })
    })
  );
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("admin login throttling uses the server-issued attempt cookie across spoofed IP headers", async () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.ADMIN_SESSION_SECRET = "c".repeat(48);
  try {
    let attemptCookie = "";
    for (let index = 0; index < 8; index += 1) {
      const response = await adminLoginPost(
        request("http://localhost/api/admin/login", {
          method: "POST",
          cookie: attemptCookie,
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
            "x-vercel-forwarded-for": `198.51.100.${index}`
          },
          body: JSON.stringify({ password: "wrong password" })
        })
      );
      if (!attemptCookie) attemptCookie = cookieHeader(response);
      assert.equal(response.status, 401);
    }

    const blocked = await adminLoginPost(
      request("http://localhost/api/admin/login", {
        method: "POST",
        cookie: attemptCookie,
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          "x-vercel-forwarded-for": "203.0.113.99"
        },
        body: JSON.stringify({ password: process.env.ADMIN_PASSWORD })
      })
    );
    assert.equal(blocked.status, 429);
  } finally {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("admin payment reconciliation credits a pending local checkout", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-reconcile-flow-"));
  const mutableEnv = process.env as Record<string, string | undefined>;
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  mutableEnv.NODE_ENV = "development";
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "reconcile_builder");
    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    const checkoutJson = await checkout.json();
    assert.equal(checkoutJson.purchase.status, "pending");
    const beforeBalance = readStore().wallets.find((item) => item.participantId === checkoutJson.purchase.participantId)?.balanceCredits;

    const reconcile = await reconcilePaymentPost(
      request("http://localhost/api/admin/payments/reconcile", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ purchaseId: checkoutJson.purchase.id })
      })
    );
    assert.equal(reconcile.status, 200);
    const reconcileJson = await reconcile.json();
    assert.equal(reconcileJson.purchase.status, "credited");
    assert.equal(reconcileJson.credited, true);
    const wallet = readStore().wallets.find((item) => item.participantId === reconcileJson.purchase.participantId);
    assert.equal(wallet?.balanceCredits, (beforeBalance || 0) + checkoutJson.purchase.credits);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("participant checkout reuse is scoped to the current return path", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-checkout-return-"));
  const mutableEnv = process.env as Record<string, string | undefined>;
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  process.env.MOLLIE_API_KEY = "test_123456789012345678901234567890";
  mutableEnv.NODE_ENV = "development";
  try {
    writeStore(createSeedStore());
    globalThis.fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v2/payments/")) {
        const paymentId = decodeURIComponent(url.split("/").pop() || "");
        const purchase = readStore().purchases.find((item) => item.molliePaymentId === paymentId);
        return new Response(JSON.stringify({
          id: paymentId,
          status: "pending",
          amount: { currency: "EUR", value: "1.00" },
          metadata: { purchaseId: purchase?.id, testOnly: true },
          _links: { checkout: { href: purchase?.checkoutUrl || `https://mollie.test/checkout/${paymentId}` } }
        }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body || "{}"));
      const purchaseId = String(body.metadata?.purchaseId || "missing");
      return new Response(JSON.stringify({
        id: `tr_${purchaseId}`,
        _links: { checkout: { href: `https://mollie.test/checkout/${purchaseId}` } }
      }), { status: 200 });
    };

    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "return_path_builder");
    const megathonMarketId = "00000000-0000-4000-8000-000000001001";
    const testingMarketId = "00000000-0000-4000-8000-000000001101";

    const first = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ returnTo: `/m/${megathonMarketId}?tab=odds` })
      })
    );
    assert.equal(first.status, 200);
    const firstJson = await first.json();
    assert.equal(firstJson.purchase.returnTo, `/m/${megathonMarketId}?tab=odds`);

    const samePath = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ returnTo: `/m/${megathonMarketId}?tab=odds` })
      })
    );
    assert.equal(samePath.status, 200);
    const samePathJson = await samePath.json();
    assert.equal(samePathJson.purchase.id, firstJson.purchase.id);
    assert.equal(samePathJson.checkoutUrl, firstJson.checkoutUrl);

    const differentPath = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ returnTo: "/e/megathon" })
      })
    );
    assert.equal(differentPath.status, 200);
    const differentPathJson = await differentPath.json();
    assert.notEqual(differentPathJson.purchase.id, firstJson.purchase.id);
    const store = readStore();
    assert.equal(store.purchases.find((item) => item.id === firstJson.purchase.id)?.status, "canceled");
    assert.equal(store.purchases.find((item) => item.id === differentPathJson.purchase.id)?.returnTo, "/e/megathon");

    const wrongEventHome = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ returnTo: "/e/testingmiki" })
      })
    );
    assert.equal(wrongEventHome.status, 200);
    const wrongEventHomeJson = await wrongEventHome.json();
    assert.equal(wrongEventHomeJson.purchase.returnTo, "/e/megathon");

    const wrongEventMarket = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ returnTo: `/m/${testingMarketId}` })
      })
    );
    assert.equal(wrongEventMarket.status, 200);
    const wrongEventMarketJson = await wrongEventMarket.json();
    assert.equal(wrongEventMarketJson.purchase.returnTo, "/e/megathon");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    mutableEnv.NODE_ENV = previousNodeEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin payments API exports checkout intent rows with repeat click value", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-payment-intent-export-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "intent_exporter");

    for (let index = 0; index < 2; index += 1) {
      const response = await createCheckoutPost(
        request("http://localhost/api/payments/mollie/create-test-checkout", {
          method: "POST",
          cookie: participantCookie,
          headers: { origin: "http://localhost" }
        })
      );
      assert.equal(response.status, 200);
    }

    const jsonResponse = await adminPaymentsGet(
      request("http://localhost/api/admin/payments?eventSlug=megathon", {
        cookie: await adminCookieHeader(),
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(jsonResponse.status, 200);
    const payload = await jsonResponse.json();
    assert.equal(payload.metrics.intentCount, 1);
    assert.equal(payload.metrics.intentClicks, 2);
    assert.equal(payload.metrics.intentProjectedEur, 1);
    assert.equal(payload.metrics.intentClickProjectedEur, 2);
    assert.equal(payload.checkoutIntents[0].participantName, "intent_exporter");
    assert.equal(payload.checkoutIntents[0].totalClickValueEur, 2);

    const csvResponse = await adminPaymentsGet(
      request("http://localhost/api/admin/payments?eventSlug=megathon&format=csv&type=intents", {
        cookie: await adminCookieHeader(),
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get("content-disposition") || "", /vota-checkout-intents\.csv/);
    const csv = await csvResponse.text();
    assert.match(csv, /participantName/);
    assert.match(csv, /intent_exporter/);
    assert.match(csv, /totalClickValueEur/);
    assert.match(csv, /"2","1","2","100","200"/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("participant checkout status endpoint verifies and credits an owned pending checkout", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-checkout-status-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "status_builder");
    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    const checkoutJson = await checkout.json();
    const beforeBalance = readStore().wallets.find((item) => item.participantId === checkoutJson.purchase.participantId)?.balanceCredits;

    const status = await checkoutStatusGet(
      request(`http://localhost/api/payments/mollie/status?purchaseId=${checkoutJson.purchase.id}`, {
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(status.status, 200);
    const statusJson = await status.json();
    assert.equal(statusJson.purchase.status, "credited");
    assert.equal(statusJson.credited, true);
    assert.equal(statusJson.wallet.balanceCredits, (beforeBalance || 0) + checkoutJson.purchase.credits);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("participant checkout status rejects another profile's purchase without crediting", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-checkout-wrong-profile-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const firstInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const firstCookie = cookieHeader(firstInit);
    await completeParticipantProfile(firstCookie, "checkout_owner");
    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: firstCookie,
        headers: { origin: "http://localhost" }
      })
    );
    const checkoutJson = await checkout.json();

    const secondInit = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost", "x-vota-guard-key": "wrong-profile-device" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const secondCookie = cookieHeader(secondInit);
    await completeParticipantProfile(secondCookie, "checkout_intruder");
    const before = readStore();
    const ownerWallet = before.wallets.find((item) => item.participantId === checkoutJson.purchase.participantId);

    const status = await checkoutStatusGet(
      request(`http://localhost/api/payments/mollie/status?purchaseId=${checkoutJson.purchase.id}`, {
        cookie: secondCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(status.status, 404);
    const statusJson = await status.json();
    assert.equal(statusJson.error, "Purchase not found.");
    const after = readStore();
    assert.equal(after.purchases.find((item) => item.id === checkoutJson.purchase.id)?.status, "pending");
    assert.equal(after.wallets.find((item) => item.participantId === checkoutJson.purchase.participantId)?.balanceCredits, ownerWallet?.balanceCredits);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("participant checkout status records canceled Mollie checkout without issuing MegaBucks", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const previousFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-canceled-checkout-status-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  process.env.MOLLIE_API_KEY = "test_123456789012345678901234567890";
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    assert.equal(init.status, 200);
    const participantCookie = cookieHeader(init);
    const profileJson = await completeParticipantProfile(participantCookie, "canceled_status_builder");

    const store = readStore();
    const participant = store.participants.find((item) => item.id === profileJson.participant.id);
    if (!participant) throw new Error("Expected participant.");
    const purchase = createPurchase(store, participant.id);
    purchase.molliePaymentId = "tr_canceledcheckout";
    purchase.checkoutUrl = "https://www.mollie.com/checkout/canceledcheckout";
    const beforeBalance = store.wallets.find((item) => item.participantId === participant.id)?.balanceCredits;
    writeStore(store);

    globalThis.fetch = async () => new Response(JSON.stringify({
      id: purchase.molliePaymentId,
      status: "canceled",
      amount: { currency: "EUR", value: "1.00" },
      metadata: { purchaseId: purchase.id, testOnly: true }
    }), { status: 200, headers: { "content-type": "application/json" } });

    const status = await checkoutStatusGet(
      request(`http://localhost/api/payments/mollie/status?purchaseId=${purchase.id}`, {
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(status.status, 200);
    const statusJson = await status.json();
    assert.equal(statusJson.status, "canceled");
    assert.equal(statusJson.credited, false);
    assert.equal(statusJson.wallet.balanceCredits, beforeBalance);

    const after = readStore();
    assert.equal(after.purchases.find((item) => item.id === purchase.id)?.status, "canceled");
    assert.equal(after.ledgerEntries.filter((entry) => entry.purchaseId === purchase.id).length, 0);
    const audit = after.adminAuditLogs.find((log) => log.action === "payment_status" && log.entityId === purchase.id);
    assert.equal(audit?.details.previousStatus, "pending");
    assert.equal(audit?.details.status, "canceled");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Mollie form webhook acknowledges provider callbacks without redirect", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-mollie-form-webhook-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "webhook_builder");
    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    const checkoutJson = await checkout.json();
    const form = new URLSearchParams({ id: checkoutJson.purchase.molliePaymentId });
    const webhook = await webhookPost(
      request("http://localhost/api/payments/mollie/webhook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: form
      })
    );
    assert.equal(webhook.status, 200);
    assert.equal(webhook.headers.get("location"), null);
    const webhookJson = await webhook.json();
    assert.equal(webhookJson.ok, true);
    assert.equal(webhookJson.purchase.status, "credited");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("local checkout redirect falls back to the owning event on unsafe return paths", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-local-checkout-safe-return-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const participantCookie = cookieHeader(init);
    await completeParticipantProfile(participantCookie, "unsafe_checkout_builder");
    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" },
        body: JSON.stringify({ returnTo: "/m/safe-market?checkout=old" })
      })
    );
    const checkoutJson = await checkout.json();
    const form = new URLSearchParams({
      purchaseId: checkoutJson.purchase.id,
      redirectToEvent: "1",
      returnTo: "//evil.test/pay"
    });
    const webhook = await webhookPost(
      request("http://localhost/api/payments/mollie/webhook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost" },
        body: form
      })
    );
    assert.equal(webhook.status, 303);
    const location = new URL(webhook.headers.get("location") || "");
    assert.equal(location.pathname, "/e/megathon-2026");
    assert.equal(location.searchParams.get("checkout"), checkoutJson.purchase.id);
    assert.equal(location.hostname, "localhost");
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("moderation ban blocks public profile edits and supporter checkout", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-ban-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  delete process.env.MOLLIE_API_KEY;
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const participantCookie = cookieHeader(init);
    const participantId = (await init.json()).participant.id;
    const store = readStore();
    const participant = store.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("Expected participant.");
    participant.isBanned = true;
    writeStore(store);

    const profile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "ban_escape", email: "ban.escape@example.test" })
      })
    );
    assert.equal(profile.status, 403);
    assert.match((await profile.json()).error, /paused by moderation/);

    const checkout = await createCheckoutPost(
      request("http://localhost/api/payments/mollie/create-test-checkout", {
        method: "POST",
        cookie: participantCookie,
        headers: { origin: "http://localhost" }
      })
    );
    assert.equal(checkout.status, 403);
    assert.match((await checkout.json()).error, /paused by moderation/);
    assert.equal(readStore().purchases.length, 0);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("public prediction preview API hides draft and voided markets", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-draft-api-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    const store = createSeedStore();
    const market = store.markets.find((item) => item.id === SEED_IDS.markets.winner);
    if (!market) throw new Error("Expected seed market.");
    market.status = "draft";
    writeStore(store);

    const response = await predictionGet(
      request(`http://localhost/api/markets/${SEED_IDS.markets.winner}/predict`),
      { params: Promise.resolve({ id: SEED_IDS.markets.winner }) }
    );
    assert.equal(response.status, 404);

    market.status = "voided";
    writeStore(store);
    const voidedResponse = await predictionGet(
      request(`http://localhost/api/markets/${SEED_IDS.markets.winner}/predict`),
      { params: Promise.resolve({ id: SEED_IDS.markets.winner }) }
    );
    assert.equal(voidedResponse.status, 404);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Mollie verification rejects mismatched metadata before crediting", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const previousFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-mollie-verify-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  process.env.MOLLIE_API_KEY = "test_123456789012345678901234567890";
  try {
    const store = createSeedStore();
    const session = createParticipantSession(store, "megathon-2026");
    const purchase = createPurchase(store, session.participant.id);
    purchase.molliePaymentId = "tr_testpayment";
    purchase.checkoutUrl = "https://www.mollie.com/checkout/test";
    writeStore(store);

    globalThis.fetch = async () => new Response(JSON.stringify({
      id: purchase.molliePaymentId,
      status: "paid",
      amount: { currency: "EUR", value: "9.99" },
      metadata: { purchaseId: purchase.id, testOnly: true }
    }), { status: 200, headers: { "content-type": "application/json" } });
    await assert.rejects(() => verifyAndCreditPurchase(purchase.id), /amount mismatch/);
    assert.equal(readStore().purchases.find((item) => item.id === purchase.id)?.status, "pending");

    globalThis.fetch = async () => new Response(JSON.stringify({
      id: purchase.molliePaymentId,
      status: "paid",
      amount: { currency: "EUR", value: "1.00" },
      metadata: { purchaseId: purchase.id, testOnly: true }
    }), { status: 200, headers: { "content-type": "application/json" } });
    const result = await verifyAndCreditPurchase(purchase.id);
    assert.equal(result.purchase.status, "credited");
    assert.equal(result.credited, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Mollie verification recovers a paid checkout whose payment id was not attached", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousMollie = process.env.MOLLIE_API_KEY;
  const previousFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-mollie-orphan-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  process.env.MOLLIE_API_KEY = "test_123456789012345678901234567890";
  try {
    const store = createSeedStore();
    const session = createParticipantSession(store, "megathon-2026");
    const purchase = createPurchase(store, session.participant.id);
    writeStore(store);

    globalThis.fetch = async () => new Response(JSON.stringify({
      id: "tr_orphanedpayment",
      status: "paid",
      amount: { currency: "EUR", value: "1.00" },
      metadata: { purchaseId: purchase.id, testOnly: true },
      _links: { checkout: { href: "https://www.mollie.com/checkout/orphanedpayment" } }
    }), { status: 200, headers: { "content-type": "application/json" } });

    const result = await verifyAndCreditPurchase("tr_orphanedpayment");
    const updated = readStore().purchases.find((item) => item.id === purchase.id);
    assert.equal(result.purchase.status, "credited");
    assert.equal(result.credited, true);
    assert.equal(updated?.molliePaymentId, "tr_orphanedpayment");
    assert.equal(updated?.checkoutUrl, "https://www.mollie.com/checkout/orphanedpayment");
    assert.equal(readStore().ledgerEntries.filter((entry) => entry.purchaseId === purchase.id && entry.type === "test_checkout_credit").length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousMollie === undefined) delete process.env.MOLLIE_API_KEY;
    else process.env.MOLLIE_API_KEY = previousMollie;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin can provision a scoped MCP token for external prediction tools", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousEventSlug = process.env.NEXT_PUBLIC_EVENT_SLUG;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-mcp-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  process.env.NEXT_PUBLIC_EVENT_SLUG = "megathon-2026";
  try {
    writeStore(createSeedStore());
    const init = await initSessionPost(
      request("http://localhost/api/session/init", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026" })
      })
    );
    const participantCookie = cookieHeader(init);
    const profile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "mcp_builder", email: "mcp.builder@example.test" })
      })
    );
    const profileJson = await profile.json();
    const unscopedTokenResponse = await createMcpTokenPost(
      request("http://localhost/api/admin/mcp-tokens", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", accept: "application/json", origin: "http://localhost" },
        body: JSON.stringify({ expiresInHours: 24 })
      })
    );
    assert.equal(unscopedTokenResponse.status, 400);
    assert.match((await unscopedTokenResponse.json()).error, /Choose a participant/);

    const tokenRequestedAt = Date.now();
    const crossEventTokenResponse = await createMcpTokenPost(
      request("http://localhost/api/admin/mcp-tokens", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", accept: "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "testingmiki", participantId: profileJson.participant.id, expiresInHours: 24 })
      })
    );
    assert.equal(crossEventTokenResponse.status, 400);
    assert.match((await crossEventTokenResponse.json()).error, /Participant does not belong to this event/);

    const tokenResponse = await createMcpTokenPost(
      request("http://localhost/api/admin/mcp-tokens", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", accept: "application/json", origin: "http://localhost" },
        body: JSON.stringify({ eventSlug: "megathon-2026", participantId: profileJson.participant.id, expiresInHours: 999999 })
      })
    );
    assert.equal(tokenResponse.status, 200);
    const tokenJson = await tokenResponse.json();
    assert.match(tokenJson.token, /^mcp_/);
    assert.equal(tokenJson.participantId, profileJson.participant.id);
    assert.ok(new Date(tokenJson.expiresAt).getTime() - tokenRequestedAt <= 721 * 60 * 60 * 1000);

    const initialize = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-1",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "node-test", version: "1.0.0" }
          }
        })
      })
    );
    assert.equal(initialize.status, 200);
    const initializeJson = await initialize.json();
    assert.equal(initializeJson.result.protocolVersion, "2025-06-18");
    assert.ok(initializeJson.result.capabilities.tools);
    const mcpSessionId = initialize.headers.get("mcp-session-id");
    assert.match(mcpSessionId || "", /^vota_/);
    assert.match(initialize.headers.get("access-control-expose-headers") || "", /Mcp-Session-Id/);

    const initialized = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": mcpSessionId || ""
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
      })
    );
    assert.equal(initialized.status, 202);
    assert.equal(await initialized.text(), "");

    const batch = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-session-id": mcpSessionId || ""
        },
        body: JSON.stringify([
          { jsonrpc: "2.0", id: "batch-ping", method: "ping" },
          { jsonrpc: "2.0", id: "batch-tools", method: "tools/list" },
          { jsonrpc: "2.0", method: "notifications/initialized" }
        ])
      })
    );
    assert.equal(batch.status, 200);
    const batchJson = await batch.json();
    assert.equal(batchJson.length, 2);
    assert.equal(batchJson[0].id, "batch-ping");
    assert.equal(batchJson[1].id, "batch-tools");

    const sse = await mcpGet(
      request("http://localhost/mcp", {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "mcp-protocol-version": "2025-06-18",
          "mcp-session-id": mcpSessionId || ""
        }
      })
    );
    assert.equal(sse.status, 200);
    assert.match(sse.headers.get("content-type") || "", /text\/event-stream/);
    const reader = sse.body?.getReader();
    assert.ok(reader);
    const firstChunk = await reader.read();
    assert.match(new TextDecoder().decode(firstChunk.value), /MCP stream ready/);
    await reader.cancel();

    const badAccept = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "bad-accept", method: "ping" })
      })
    );
    assert.equal(badAccept.status, 406);

    const closed = await mcpDelete(
      request("http://localhost/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": mcpSessionId || "" }
      })
    );
    assert.equal(closed.status, 202);

    const tools = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "tools-1", method: "tools/list" })
      })
    );
    assert.equal(tools.status, 200);
    const toolsJson = await tools.json();
    assert.deepEqual(
      toolsJson.result.tools.map((tool: { name: string }) => tool.name).sort(),
      [
        "calculate_allowed_stake",
        "get_market",
        "get_wallet",
        "list_markets",
        "place_prediction",
        "request_more_budget"
      ]
    );

    const wallet = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenJson.token}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "wallet-1",
          method: "tools/call",
          params: { name: "get_wallet", arguments: {} }
        })
      })
    );
    assert.equal(wallet.status, 200);
    const walletJson = await wallet.json();
    assert.equal(walletJson.result.structuredContent.wallet.balanceCredits, 1000);

    const scopedMarkets = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenJson.token}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "markets-1",
          method: "tools/call",
          params: { name: "list_markets", arguments: {} }
        })
      })
    );
    assert.equal(scopedMarkets.status, 200);
    const scopedMarketsJson = await scopedMarkets.json();
    const scopedMarketIds = scopedMarketsJson.result.structuredContent.markets.map((market: { id: string }) => market.id);
    assert.ok(scopedMarketIds.includes(SEED_IDS.markets.winner));
    assert.equal(scopedMarketIds.includes(SEED_IDS.markets.livestream), false);

    const unauthDefaultMarkets = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "markets-default-event-1",
          method: "tools/call",
          params: { name: "list_markets", arguments: {} }
        })
      })
    );
    assert.equal(unauthDefaultMarkets.status, 200);
    const unauthDefaultJson = await unauthDefaultMarkets.json();
    const unauthDefaultIds = unauthDefaultJson.result.structuredContent.markets.map((market: { id: string }) => market.id);
    assert.ok(unauthDefaultIds.includes(SEED_IDS.markets.winner));
    assert.equal(unauthDefaultIds.includes(SEED_IDS.markets.livestream), false);

    const unauthSideEventMarkets = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "markets-side-event-1",
          method: "tools/call",
          params: { name: "list_markets", arguments: { eventSlug: "livestream-demo" } }
        })
      })
    );
    assert.equal(unauthSideEventMarkets.status, 200);
    const unauthSideEventJson = await unauthSideEventMarkets.json();
    const unauthSideEventIds = unauthSideEventJson.result.structuredContent.markets.map((market: { id: string }) => market.id);
    assert.ok(unauthSideEventIds.includes(SEED_IDS.markets.livestream));
    assert.equal(unauthSideEventIds.includes(SEED_IDS.markets.winner), false);

    const sideEventBudget = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "budget-side-event-1",
          method: "tools/call",
          params: { name: "request_more_budget", arguments: { eventSlug: "testingmiki" } }
        })
      })
    );
    assert.equal(sideEventBudget.status, 200);
    const sideEventBudgetJson = await sideEventBudget.json();
    assert.match(sideEventBudgetJson.result.structuredContent.message, /testingmiki test checkout/);
    assert.doesNotMatch(sideEventBudgetJson.result.structuredContent.message, /MEGATHON/);

    const crossEventMarket = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenJson.token}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "market-cross-event-1",
          method: "tools/call",
          params: { name: "get_market", arguments: { marketId: SEED_IDS.markets.livestream } }
        })
      })
    );
    assert.equal(crossEventMarket.status, 200);
    const crossEventMarketJson = await crossEventMarket.json();
    assert.equal(crossEventMarketJson.result.isError, true);
    assert.match(crossEventMarketJson.result.content[0].text, /Market not found/);

    const denied = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        cookie: participantCookie,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "place_prediction",
          marketId: SEED_IDS.markets.winner,
          outcomeId: SEED_IDS.outcomes.orbit,
          amountCredits: 100
        })
      })
    );
    assert.equal(denied.status, 401);

    const legacyBroadToken = "mcp_legacy_unscoped_token_123456";
    const legacyStore = readStore();
    legacyStore.mcpTokens.push({
      id: "legacy-unscoped-token",
      tokenHash: createHash("sha256").update(legacyBroadToken).digest("hex"),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    writeStore(legacyStore);

    const deniedLegacyBroadToken = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        cookie: participantCookie,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${legacyBroadToken}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "legacy-broad-place-1",
          method: "tools/call",
          params: {
            name: "place_prediction",
            arguments: {
              marketId: SEED_IDS.markets.winner,
              outcomeId: SEED_IDS.outcomes.orbit,
              amountCredits: 100,
              requestId: "mcp-legacy-broad-place-1"
            }
          }
        })
      })
    );
    assert.equal(deniedLegacyBroadToken.status, 200);
    const deniedLegacyBroadTokenJson = await deniedLegacyBroadToken.json();
    assert.equal(deniedLegacyBroadTokenJson.result.isError, true);
    assert.match(deniedLegacyBroadTokenJson.result.content[0].text, /MCP write token required/);

    const placed = await mcpPost(
      request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenJson.token}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "place-1",
          method: "tools/call",
          params: {
            name: "place_prediction",
            arguments: {
              marketId: SEED_IDS.markets.winner,
              outcomeId: SEED_IDS.outcomes.orbit,
              amountCredits: 100,
              requestId: "mcp-json-rpc-place-1"
            }
          }
        })
      })
    );
    assert.equal(placed.status, 200);
    const placedJson = await placed.json();
    assert.equal(placedJson.result.structuredContent.result.position.outcomeId, SEED_IDS.outcomes.orbit);
    assert.equal(readStore().mcpTokens.length, 2);
    assert.equal(readStore().adminAuditLogs.some((log) => log.action === "create_mcp_token"), true);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    if (previousEventSlug === undefined) delete process.env.NEXT_PUBLIC_EVENT_SLUG;
    else process.env.NEXT_PUBLIC_EVENT_SLUG = previousEventSlug;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin report API exports CSV, Cala JSON, and PixVerse JSON", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-report-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
  try {
    writeStore(createSeedStore());

    const adminCookie = await adminCookieHeader();
    const csv = await reportGet(request("http://localhost/api/admin/report?format=csv", { cookie: adminCookie }));
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") || "", /text\/csv/);
    assert.match(await csv.text(), /"overview","Participants","count"/);

    const cala = await reportGet(request("http://localhost/api/admin/report?format=cala", { cookie: adminCookie }));
    assert.equal(cala.status, 200, await cala.clone().text());
    const calaJson = await cala.json();
    assert.equal(calaJson.event.slug, "megathon");
    assert.ok(Array.isArray(calaJson.contextPacks));
    assert.match(calaJson.contextPacks[0].operatorPrompt, /Cala context/);

    const pixverse = await reportGet(request("http://localhost/api/admin/report?format=pixverse", { cookie: adminCookie }));
    assert.equal(pixverse.status, 200);
    const pixverseJson = await pixverse.json();
    assert.equal(pixverseJson.event.slug, "megathon");
    assert.ok(Array.isArray(pixverseJson.promoBriefs));
    assert.match(pixverseJson.promoBriefs[0].prompt, /vota\.wtf/);

    const missing = await reportGet(request("http://localhost/api/admin/report?eventSlug=missing-room", { cookie: adminCookie }));
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /Event not found/);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("admin readiness API reports deploy proof status without secret values", async () => {
  const previousBackend = process.env.VOTA_DATA_BACKEND;
  const previousStoreFile = process.env.VOTA_STORE_FILE;
  const previousValues = new Map<string, string | undefined>();
  const previousFetch = globalThis.fetch;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-readiness-flow-"));
  const envValues: Record<string, string> = {
    NODE_ENV: "development",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "b".repeat(48),
    VOTA_DATA_BACKEND: "local",
    VOTA_STORE_FILE: path.join(tempDir, "store.json"),
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
    MOLLIE_API_KEY: "test_123456789012345678901234567890",
    MOLLIE_READINESS_PAYMENT_ID: "tr_1234567890",
    NEXT_PUBLIC_BASE_URL: "https://vota.example",
    NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
    NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
    NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
    NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
    NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
    NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
  };
  for (const [key, value] of Object.entries(envValues)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ status: "paid" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
    writeStore(createSeedStore());
    const response = await readinessGet(request("http://localhost/api/admin/readiness", { cookie: await adminCookieHeader() }));
    assert.equal(response.status, 200, await response.clone().text());
    const report = await response.json();
    assert.equal(report.ready, true);
    assert.equal(report.counts.fail, 0);
    assert.match(JSON.stringify(report), /Mollie accepted the test key/);
    assert.match(JSON.stringify(report), /Stage screenshot/);
    assert.doesNotMatch(JSON.stringify(report), /service-role-key|correct horse battery staple/);

    const publicResponse = await publicReadinessGet(request("http://localhost/api/readiness"));
    assert.equal(publicResponse.status, 200);
    const publicJson = await publicResponse.json();
    assert.equal(publicJson.ready, true);
    assert.equal(publicJson.groups, undefined);
    assert.doesNotMatch(JSON.stringify(publicJson), /Admin password|service-role-key|Stage screenshot/);

    process.env.NEXT_PUBLIC_PROOF_STAGE_URL = "";
    const failedResponse = await publicReadinessGet(request("http://localhost/api/readiness"));
    assert.equal(failedResponse.status, 503);
    const failedReport = await failedResponse.json();
    assert.equal(failedReport.ready, false);
    assert.ok(failedReport.counts.fail > 0);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
