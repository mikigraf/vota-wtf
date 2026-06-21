import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function run(command, args, env) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32"
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function nextBin() {
  const executable = process.platform === "win32" ? "next.cmd" : "next";
  return path.join(process.cwd(), "node_modules", ".bin", executable);
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 90000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next production server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/readiness`, { cache: "no-store" });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for Next production server at ${origin}: ${lastError}`);
}

async function readText(response, label) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}\n${text.slice(0, 500)}`);
  return text;
}

async function readJson(response, label) {
  const text = await readText(response, label);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON:\n${text.slice(0, 500)}`);
  }
}

function assertIncludes(value, pattern, label) {
  if (!value.includes(pattern)) throw new Error(`${label} did not include ${JSON.stringify(pattern)}`);
}

function cookieHeader(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return [...setCookie.matchAll(/(vota_[^=]+)=([^;,\s]+)/g)]
    .map((match) => `${match[1]}=${match[2]}`)
    .join("; ");
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vota-wtf-smoke-"));
  const storeFile = path.join(tempDir, "store.json");
  let port;
  try {
    port = Number(process.env.SMOKE_PORT || await freePort());
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.REQUIRE_SMOKE_SERVER === "1") throw error;
    console.log(`Local server smoke skipped: this environment cannot open a 127.0.0.1 port (${message}).`);
    console.log("Set REQUIRE_SMOKE_SERVER=1 to make this condition fail the command.");
    return;
  }
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    ...readEnvFile(path.join(process.cwd(), ".env.local")),
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_EVENT_SLUG: "megathon",
    VOTA_DATA_BACKEND: "local",
    VOTA_DISABLE_AUTO_SEED: "1",
    VOTA_STORE_FILE: storeFile,
    PLAYWRIGHT_BASE_URL: origin,
    NEXT_PUBLIC_BASE_URL: origin,
    NEXT_PUBLIC_QR_BASE_URL: origin,
    MOLLIE_API_KEY: "",
    MOLLIE_READINESS_PAYMENT_ID: ""
  };
  let server;
  try {
    console.log(`Using isolated smoke store: ${storeFile}`);
    run("node", ["-r", "./tests/register-ts.cjs", "scripts/seed-e2e.ts"], env);
    server = spawn(nextBin(), ["start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    await waitForServer(origin, server);

    const readiness = await readJson(await fetch(`${origin}/api/readiness`, { cache: "no-store" }), "public readiness");
    if (!readiness.counts || typeof readiness.ready !== "boolean") throw new Error("Public readiness shape is invalid.");

    const megathonState = await readJson(await fetch(`${origin}/api/events/megathon/public-state`, { cache: "no-store" }), "megathon public state");
    const testingState = await readJson(await fetch(`${origin}/api/events/testingmiki/public-state`, { cache: "no-store" }), "testingmiki public state");
    if (megathonState.event?.slug !== "megathon") throw new Error("Megathon public state returned the wrong event.");
    if (testingState.event?.slug !== "testingmiki") throw new Error("testingmiki public state returned the wrong event.");
    if (!Array.isArray(megathonState.markets) || megathonState.markets.length < 1) throw new Error("Megathon has no smoke markets.");
    if (!Array.isArray(testingState.markets) || testingState.markets.length < 1) throw new Error("testingmiki has no smoke markets.");

    const joinHtml = await readText(await fetch(`${origin}/join/megathon`, { cache: "no-store" }), "join page");
    assertIncludes(joinHtml, "vota.wtf", "join page");
    const adminHtml = await readText(await fetch(`${origin}/admin/login`, { cache: "no-store" }), "admin login page");
    assertIncludes(adminHtml, "Admin", "admin login page");

    const initResponse = await fetch(`${origin}/api/session/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventSlug: "megathon" })
    });
    const participantCookie = cookieHeader(initResponse);
    const init = await readJson(initResponse, "session init");
    if (!participantCookie || init.profileComplete !== false) throw new Error("Session init did not issue an incomplete participant session.");

    const profile = await readJson(
      await fetch(`${origin}/api/session/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: participantCookie
        },
        body: JSON.stringify({
          nickname: `Smoke ${Date.now()}`,
          email: `smoke.${Date.now()}@example.test`
        })
      }),
      "profile completion"
    );
    if (!profile.nextMarketId) throw new Error("Profile completion did not return the next open market.");

    const refreshedState = await readJson(await fetch(`${origin}/api/events/megathon/public-state`, { cache: "no-store" }), "refreshed public state");
    const market = refreshedState.markets.find((item) => item.id === profile.nextMarketId) || refreshedState.markets[0];
    const outcome = market?.outcomes?.[0];
    if (!market?.id || !outcome?.id) throw new Error("Smoke market/outcome is missing.");

    const roomHtml = await readText(
      await fetch(`${origin}/e/megathon`, { headers: { cookie: participantCookie }, cache: "no-store" }),
      "event room page"
    );
    assertIncludes(roomHtml, "Live room", "event room page");
    const marketHtml = await readText(
      await fetch(`${origin}/m/${market.id}`, { headers: { cookie: participantCookie }, cache: "no-store" }),
      "market page"
    );
    assertIncludes(marketHtml, market.title, "market page");

    const preview = await readJson(
      await fetch(`${origin}/api/markets/${market.id}/predict?${new URLSearchParams({ outcomeId: outcome.id, amountCredits: "100" })}`, {
        headers: { cookie: participantCookie },
        cache: "no-store"
      }),
      "prediction preview"
    );
    if (!preview.preview || !preview.user) throw new Error("Prediction preview did not include user and preview state.");

    const requestId = crypto.randomUUID();
    const prediction = await readJson(
      await fetch(`${origin}/api/markets/${market.id}/predict`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId,
          cookie: participantCookie
        },
        body: JSON.stringify({ outcomeId: outcome.id, amountCredits: 100, requestId })
      }),
      "prediction submit"
    );
    if (!prediction.user?.position) throw new Error("Prediction submit did not create a position.");

    const checkout = await readJson(
      await fetch(`${origin}/api/payments/mollie/create-test-checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: participantCookie
        },
        body: JSON.stringify({ returnTo: `/m/${market.id}` })
      }),
      "local checkout create"
    );
    if (!String(checkout.checkoutUrl || "").startsWith(`${origin}/checkout/test/`)) {
      throw new Error(`Local checkout URL is invalid: ${checkout.checkoutUrl}`);
    }
    const checkoutHtml = await readText(
      await fetch(checkout.checkoutUrl, { headers: { cookie: participantCookie }, cache: "no-store" }),
      "local checkout page"
    );
    assertIncludes(checkoutHtml, "Complete test checkout", "local checkout page");
    assertIncludes(checkoutHtml, "TEST·CHECKOUT", "local checkout page");

    const stageHtml = await readText(await fetch(`${origin}/stage/megathon`, { cache: "no-store" }), "stage page");
    assertIncludes(stageHtml, "Join vota.wtf QR code", "stage page");

    console.log("JSON-store smoke passed: join, profile, market, prediction, checkout, stage, admin, readiness.");
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
