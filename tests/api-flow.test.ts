import assert from "node:assert/strict";
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
import { POST as reconcilePaymentPost } from "../app/api/admin/payments/reconcile/route";
import { POST as createMcpTokenPost } from "../app/api/admin/mcp-tokens/route";
import { POST as stagePost } from "../app/api/admin/stage/route";
import { POST as mcpPost } from "../app/mcp/route";
import { GET as publicReadinessGet } from "../app/api/readiness/route";
import { adminApiCookieName, signAdminToken } from "../src/lib/auth";
import { createParticipantSession, createPurchase, createSeedStore, readStore, SEED_IDS, writeStore } from "../src/lib/store";
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
      body: JSON.stringify({ nickname, role: "builder" })
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
    const participantCookie = cookieHeader(init);
    assert.match(participantCookie, /vota_participant_session=/);

    const profile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ nickname: "demo_druid", role: "builder" })
      })
    );
    assert.equal(profile.status, 200);
    const profileJson = await profile.json();
    assert.equal(profileJson.participant.nickname, "demo_druid");
    assert.equal(profileJson.participant.role, "builder");
    assert.equal(profileJson.nextMarketId, SEED_IDS.markets.winner);

    const editedGeneratedAvatarProfile = await profilePatch(
      request("http://localhost/api/session/profile", {
        method: "PATCH",
        cookie: participantCookie,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({
          nickname: "demo_druid",
          role: "sponsor",
          avatarDataUrl: profileJson.participant.avatarUrl
        })
      })
    );
    assert.equal(editedGeneratedAvatarProfile.status, 200);
    const editedGeneratedAvatarJson = await editedGeneratedAvatarProfile.json();
    assert.equal(editedGeneratedAvatarJson.participant.role, "sponsor");

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
          role: "builder",
          avatarDataUrl: "/uploads/avatars/demo-druid.webp"
        })
      })
    );
    assert.equal(editedUploadedAvatarProfile.status, 200);
    const editedUploadedAvatarJson = await editedUploadedAvatarProfile.json();
    assert.equal(editedUploadedAvatarJson.participant.avatarUrl, "/uploads/avatars/demo-druid.webp");

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
    assert.equal(repeatedCheckoutJson.purchase.id, checkoutJson.purchase.id);
    assert.equal(readStore().purchases.length, 1);

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
        body: JSON.stringify({ eventSlug: "megathon-2026" })
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
        body: JSON.stringify({ nickname: "ban_escape", role: "builder" })
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-mcp-flow-"));
  process.env.VOTA_DATA_BACKEND = "local";
  process.env.VOTA_STORE_FILE = path.join(tempDir, "store.json");
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
        body: JSON.stringify({ nickname: "mcp_builder", role: "builder" })
      })
    );
    const profileJson = await profile.json();
    const tokenResponse = await createMcpTokenPost(
      request("http://localhost/api/admin/mcp-tokens", {
        method: "POST",
        cookie: await adminCookieHeader(),
        headers: { "content-type": "application/json", accept: "application/json", origin: "http://localhost" },
        body: JSON.stringify({ participantId: profileJson.participant.id, expiresInHours: 24 })
      })
    );
    assert.equal(tokenResponse.status, 200);
    const tokenJson = await tokenResponse.json();
    assert.match(tokenJson.token, /^mcp_/);
    assert.equal(tokenJson.participantId, profileJson.participant.id);

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
    assert.equal(readStore().mcpTokens.length, 1);
    assert.equal(readStore().adminAuditLogs.some((log) => log.action === "create_mcp_token"), true);
  } finally {
    if (previousBackend === undefined) delete process.env.VOTA_DATA_BACKEND;
    else process.env.VOTA_DATA_BACKEND = previousBackend;
    if (previousStoreFile === undefined) delete process.env.VOTA_STORE_FILE;
    else process.env.VOTA_STORE_FILE = previousStoreFile;
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
    assert.equal(cala.status, 200);
    const calaJson = await cala.json();
    assert.equal(calaJson.event.slug, "megathon-2026");
    assert.ok(Array.isArray(calaJson.contextPacks));
    assert.match(calaJson.contextPacks[0].operatorPrompt, /Cala context/);

    const pixverse = await reportGet(request("http://localhost/api/admin/report?format=pixverse", { cookie: adminCookie }));
    assert.equal(pixverse.status, 200);
    const pixverseJson = await pixverse.json();
    assert.equal(pixverseJson.event.slug, "megathon-2026");
    assert.ok(Array.isArray(pixverseJson.promoBriefs));
    assert.match(pixverseJson.promoBriefs[0].prompt, /vota\.wtf/);
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
    assert.equal(response.status, 200);
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
