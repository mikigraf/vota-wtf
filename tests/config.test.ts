import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildReadinessReport, buildReadinessReportWithLiveChecks } from "../src/lib/readiness";
import { createSeedStore } from "../src/lib/store";
import { useSupabaseStore } from "../src/lib/data";
import { baseUrl, stageJoinUrl } from "../src/lib/utils";

test("production config does not silently force the local JSON backend", () => {
  const envExample = fs.readFileSync(".env.example", "utf8");
  assert.match(envExample, /^NEXT_PUBLIC_EVENT_SLUG=megathon$/m);
  assert.match(envExample, /^VOTA_DATA_BACKEND=supabase$/m);
  assert.doesNotMatch(envExample, /^VOTA_DATA_BACKEND=local$/m);
});

test("local Supabase runbook and scripts are wired", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    engines?: Record<string, string>;
    packageManager?: string;
    scripts: Record<string, string>;
  };
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  const seed = fs.readFileSync("supabase/seed.sql", "utf8");
  const envScript = fs.readFileSync("scripts/write-local-supabase-env.mjs", "utf8");
  const loadScript = fs.readFileSync("scripts/load-500.ts", "utf8");
  const loadHttpScript = fs.readFileSync("scripts/load-500-http.ts", "utf8");
  const smokeJsonScript = fs.readFileSync("scripts/smoke-json-server.mjs", "utf8");
  const e2eRunner = fs.readFileSync("scripts/run-local-playwright.mjs", "utf8");
  const e2eJsonRunner = fs.readFileSync("scripts/run-json-playwright.mjs", "utf8");
  const e2eSeed = fs.readFileSync("scripts/seed-e2e.ts", "utf8");
  const playwrightConfig = fs.readFileSync("playwright.config.ts", "utf8");
  const readme = fs.readFileSync("README.md", "utf8");
  const workflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as Record<string, string>;

  assert.equal(pkg.engines?.node, ">=22 <23");
  assert.equal(pkg.packageManager, "npm@10.9.2");
  assert.equal(pkg.scripts["supabase:start"], "supabase start");
  assert.equal(pkg.scripts["supabase:reset"], "supabase db reset");
  assert.equal(pkg.scripts["supabase:push"], "supabase db push");
  assert.equal(pkg.scripts["env:local:supabase"], "node scripts/write-local-supabase-env.mjs");
  assert.equal(pkg.scripts["load:500"], "node -r ./tests/register-ts.cjs scripts/load-500.ts");
  assert.equal(pkg.scripts["load:500:http"], "node -r ./tests/register-ts.cjs scripts/load-500-http.ts");
  assert.equal(pkg.scripts["smoke:json"], "node scripts/smoke-json-server.mjs");
  assert.equal(pkg.scripts["e2e"], "playwright test");
  assert.equal(pkg.scripts["e2e:local"], "node scripts/run-local-playwright.mjs");
  assert.equal(pkg.scripts["e2e:json"], "node scripts/run-json-playwright.mjs");
  assert.match(pkg.scripts.verify, /npm run smoke:json/);
  assert.match(pkg.scripts["verify:deploy"], /REQUIRE_SMOKE_SERVER=1 npm run smoke:json/);
  assert.match(pkg.scripts["dev:local:supabase"], /env:local:supabase/);
  assert.match(pkg.scripts["verify:local:supabase"], /VOTA_DATA_BACKEND=supabase npm run verify/);
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.installCommand, "npm install");
  assert.match(config, /project_id = "vota-wtf"/);
  assert.match(config, /\[db\.migrations\][\s\S]+enabled = true/);
  assert.match(config, /\[storage\][\s\S]+enabled = true/);
  assert.match(seed, /Seed data is inserted by migrations/);
  assert.match(envScript, /supabase", \["status", "-o", "env"\]/);
  assert.match(envScript, /NEXT_PUBLIC_EVENT_SLUG=megathon/);
  assert.match(loadScript, /eventSlug: DEFAULT_EVENT_SLUG/);
  assert.match(loadScript, /createParticipantSession\(store, DEFAULT_EVENT_SLUG\)/);
  assert.match(loadHttpScript, /fetch\(`\$\{ORIGIN\}\$\{route\}`/);
  assert.match(loadHttpScript, /"https:\/\/vota\.wtf"/);
  assert.match(loadHttpScript, /"megathon-2026"/);
  assert.match(loadHttpScript, /LOAD_ALLOW_LIVE/);
  assert.match(loadHttpScript, /Refusing to write/);
  assert.match(loadHttpScript, /const MARKET_ID = process\.env\.LOAD_MARKET_ID \|\| ""/);
  assert.match(loadHttpScript, /cookieHeader\(initResponse\)/);
  assert.match(loadHttpScript, /virtualDeviceHeaders/);
  assert.match(loadHttpScript, /x-vota-guard-key/);
  assert.match(loadHttpScript, /x-vota-participant-session/);
  assert.doesNotMatch(loadHttpScript, /app\/api\/session\/init\/route/);
  assert.doesNotMatch(loadHttpScript, /app\/api\/session\/profile\/route/);
  assert.doesNotMatch(loadHttpScript, /app\/api\/markets\/\[id\]\/predict\/route/);
  assert.match(loadHttpScript, /LOAD_CONCURRENCY/);
  assert.match(loadHttpScript, /LOAD_MARKET_ID/);
  assert.match(loadHttpScript, /idempotencyReplays/);
  assert.match(smokeJsonScript, /VOTA_DATA_BACKEND: "local"/);
  assert.match(smokeJsonScript, /VOTA_STORE_FILE: storeFile/);
  assert.match(smokeJsonScript, /scripts\/seed-e2e\.ts/);
  assert.match(smokeJsonScript, /nextBin\(\), \["start"/);
  assert.match(smokeJsonScript, /Next production server/);
  assert.match(smokeJsonScript, /api\/session\/init/);
  assert.match(smokeJsonScript, /api\/session\/profile/);
  assert.match(smokeJsonScript, /api\/markets\/\$\{market\.id\}\/predict/);
  assert.match(smokeJsonScript, /api\/payments\/mollie\/create-test-checkout/);
  assert.match(smokeJsonScript, /Complete test checkout/);
  assert.doesNotMatch(smokeJsonScript, /MEGATHON test checkout/);
  assert.match(smokeJsonScript, /\/stage\/megathon/);
  assert.match(smokeJsonScript, /\/admin\/login/);
  assert.match(smokeJsonScript, /REQUIRE_SMOKE_SERVER/);
  assert.match(smokeJsonScript, /Local server smoke skipped/);
  assert.match(envScript, /MOLLIE_API_KEY=/);
  assert.match(e2eRunner, /supabase", \["start"\]/);
  assert.match(e2eRunner, /supabase", \["db", "reset"\]/);
  assert.match(e2eRunner, /scripts\/seed-e2e\.ts/);
  assert.match(e2eRunner, /PLAYWRIGHT_BASE_URL: "http:\/\/127\.0\.0\.1:3100"/);
  assert.match(e2eJsonRunner, /VOTA_DATA_BACKEND: "local"/);
  assert.match(e2eJsonRunner, /VOTA_STORE_FILE: storeFile/);
  assert.match(e2eJsonRunner, /scripts\/seed-e2e\.ts/);
  assert.match(e2eJsonRunner, /PLAYWRIGHT_BASE_URL: "http:\/\/127\.0\.0\.1:3100"/);
  assert.match(playwrightConfig, /readEnvFile\(path\.join\(process\.cwd\(\), "\.env\.local"\)\)/);
  assert.match(playwrightConfig, /\.\.\.localEnv,[\s\S]+\.\.\.process\.env/);
  assert.match(playwrightConfig, /const dataBackend = process\.env\.VOTA_DATA_BACKEND \|\| localEnv\.VOTA_DATA_BACKEND \|\| "supabase"/);
  assert.match(playwrightConfig, /VOTA_DATA_BACKEND: dataBackend/);
  assert.match(e2eSeed, /slug: "megathon"/);
  assert.match(e2eSeed, /name: "Megathon"/);
  assert.match(e2eSeed, /slug: "testingmiki"/);
  assert.match(e2eSeed, /name: "testingmiki"/);
  assert.match(e2eSeed, /slug: "megathon-finals"/);
  assert.match(e2eSeed, /name: "Megathon-Finals"/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000000901/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000000902/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000000903/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000001001/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000001101/);
  assert.match(e2eSeed, /00000000-0000-4000-8000-000000001201/);
  assert.match(playwrightConfig, /reuseExistingServer: process\.env\.PLAYWRIGHT_REUSE_SERVER === "1"/);
  assert.match(readme, /npm run supabase:start/);
  assert.match(readme, /supabase link --project-ref <your-supabase-project-ref>/);
  assert.match(readme, /npm run supabase:push/);
  assert.match(readme, /Keep the framework preset as `Next\.js`/);
  assert.match(readme, /npm run dev:local:supabase/);
  assert.match(readme, /npm run e2e:local/);
  assert.match(readme, /npm run e2e:json/);
  assert.match(readme, /npm run smoke:json/);
  assert.match(readme, /no-browser local server smoke gate/);
  assert.match(readme, /production Next server/);
  assert.match(readme, /REQUIRE_SMOKE_SERVER=1/);
  assert.match(readme, /temporary `VOTA_STORE_FILE`/);
  assert.match(readme, /READINESS_URL=https:\/\/vota\.wtf npm run verify:deploy/);
  assert.match(readme, /LOAD_MARKET_ID=<open-disposable-market-id>/);
  assert.match(readme, /docs\/live-event-readiness-plan\.md/);
  assert.match(readme, /051_delete_market_readiness_contract\.sql/);
  assert.match(readme, /\/join\/megathon-finals/);
  assert.match(readme, /^NEXT_PUBLIC_EVENT_SLUG=megathon$/m);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm install/);
  assert.match(workflow, /CI: "false"/);
  assert.match(workflow, /npm run verify/);
});

test("live-event readiness plan captures the manual gates automation cannot prove", () => {
  const plan = fs.readFileSync("docs/live-event-readiness-plan.md", "utf8");

  assert.match(plan, /Supabase production must have every migration through `supabase\/migrations\/051_delete_market_readiness_contract\.sql` applied/);
  assert.match(plan, /reopen `\/j\/megathon-finals`/);
  assert.match(plan, /Apply migrations through `051`/);
  assert.match(plan, /Run the projector flow: `\/stage\/megathon-finals`/);
  assert.match(plan, /npm run smoke:json/);
  assert.match(plan, /local server smoke gate/);
  assert.match(plan, /REQUIRE_SMOKE_SERVER=1 npm run smoke:json/);
  assert.match(plan, /Critical Findings/);
  assert.match(plan, /Major Findings/);
  assert.match(plan, /Minor Findings/);
  assert.match(plan, /Systemic Patterns/);
  assert.match(plan, /Go\/No-Go Gate/);
  assert.match(plan, /two real mobile devices/i);
  assert.match(plan, /resolve a throwaway market/i);
  assert.match(plan, /READINESS_URL=https:\/\/<domain> npm run verify:deploy/);
});

test("production refuses local backend mode", () => {
  const originalBackend = process.env.VOTA_DATA_BACKEND;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.VOTA_DATA_BACKEND = "local";
    mutableEnv.NODE_ENV = "production";
    assert.throws(() => useSupabaseStore(), /only allowed outside production/);
  } finally {
    if (originalBackend === undefined) delete mutableEnv.VOTA_DATA_BACKEND;
    else mutableEnv.VOTA_DATA_BACKEND = originalBackend;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

test("production requires Supabase when backend mode is omitted", () => {
  const originalBackend = process.env.VOTA_DATA_BACKEND;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    delete mutableEnv.VOTA_DATA_BACKEND;
    delete mutableEnv.SUPABASE_URL;
    delete mutableEnv.SUPABASE_SERVICE_ROLE_KEY;
    mutableEnv.NODE_ENV = "production";
    assert.throws(() => useSupabaseStore(), /Production requires Supabase/);
  } finally {
    if (originalBackend === undefined) delete mutableEnv.VOTA_DATA_BACKEND;
    else mutableEnv.VOTA_DATA_BACKEND = originalBackend;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalUrl === undefined) delete mutableEnv.SUPABASE_URL;
    else mutableEnv.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete mutableEnv.SUPABASE_SERVICE_ROLE_KEY;
    else mutableEnv.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("readiness report fails missing proof links and passes configured deploy essentials", () => {
  const store = createSeedStore();
  const deployEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a".repeat(48),
    VOTA_DATA_BACKEND: "supabase",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
    MOLLIE_API_KEY: "test_123456789012345678901234567890",
    NEXT_PUBLIC_BASE_URL: "https://vota.wtf",
    NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
    NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
    NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
    NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
    NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
    NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
  };

  const ready = buildReadinessReport(store, deployEnv, "megathon-2026");
  assert.equal(ready.ready, true);
  assert.equal(ready.counts.fail, 0);
  assert.ok(ready.counts.warn >= 1);

  const testingRoomReady = buildReadinessReport(store, deployEnv, "testingmiki");
  assert.equal(testingRoomReady.ready, true);
  assert.equal(testingRoomReady.counts.fail, 0);

  const missingProof = buildReadinessReport(
    store,
    {
      ...deployEnv,
      NEXT_PUBLIC_PROOF_STAGE_URL: ""
    },
    "megathon-2026"
  );
  assert.equal(missingProof.ready, false);
  assert.ok(
    missingProof.groups
      .find((group) => group.title === "Public Proof")
      ?.checks.some((item) => item.id === "next_public_proof_stage_url" && item.status === "fail")
  );

  const unsafeRuntime = buildReadinessReport(
    store,
    {
      ...deployEnv,
      ADMIN_PASSWORD: "too-short",
      MOLLIE_API_KEY: "test_xxx",
      NEXT_PUBLIC_BASE_URL: "http://vota.example"
    },
    "megathon-2026"
  );
  const runtimeFailures = unsafeRuntime.groups
    .find((group) => group.title === "Runtime")
    ?.checks.filter((item) => item.status === "fail")
    .map((item) => item.id);
  assert.deepEqual(
    new Set(runtimeFailures),
    new Set(["admin-password", "mollie-test-key", "public-base-url"])
  );
});

test("production readiness rejects local non-HTTPS or non-vota public base URLs", () => {
  const store = createSeedStore();
  const deployEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a".repeat(48),
    VOTA_DATA_BACKEND: "supabase",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
    MOLLIE_API_KEY: "test_123456789012345678901234567890",
    NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
    NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
    NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
    NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
    NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
    NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
  };

  for (const value of ["http://vota.example", "https://vota.example", "https://[::1]:3000", "https://0.0.0.0:3000", "https://vota-demo.vercel.app"]) {
    const report = buildReadinessReport(store, { ...deployEnv, NEXT_PUBLIC_BASE_URL: value }, "megathon-2026");
    assert.ok(
      report.groups
        .find((group) => group.title === "Runtime")
        ?.checks.some((item) => item.id === "public-base-url" && item.status === "fail"),
      `expected ${value} to fail public base URL readiness`
    );
  }
});

test("production readiness rejects preview hosts while stage QR stays canonical", () => {
  const store = createSeedStore();
  const deployEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a".repeat(48),
    VOTA_DATA_BACKEND: "supabase",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
    MOLLIE_API_KEY: "test_123456789012345678901234567890",
    NEXT_PUBLIC_BASE_URL: `https://${"preview-".repeat(24)}example.vercel.app`,
    NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
    NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
    NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
    NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
    NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
    NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
  };

  const missingQrBase = buildReadinessReport(store, deployEnv, "megathon-2026");
  assert.ok(
    missingQrBase.groups
      .find((group) => group.title === "Runtime")
      ?.checks.some((item) => item.id === "public-base-url" && item.status === "fail")
  );
  assert.ok(
    missingQrBase.groups
      .find((group) => group.title === "Runtime")
      ?.checks.some((item) => item.id === "stage-qr-base" && item.status === "pass")
  );

  const canonical = buildReadinessReport(
    store,
    { ...deployEnv, NEXT_PUBLIC_BASE_URL: "https://vota.wtf" },
    "megathon-2026"
  );
  assert.ok(
    canonical.groups
      .find((group) => group.title === "Runtime")
      ?.checks.some((item) => item.id === "public-base-url" && item.status === "pass")
  );
});

test("readiness QR checks use the selected event slug", () => {
  const store = createSeedStore();
  const report = buildReadinessReport(
    store,
    {
      NODE_ENV: "production",
      ADMIN_PASSWORD: "correct horse battery staple",
      ADMIN_SESSION_SECRET: "a".repeat(48),
      VOTA_DATA_BACKEND: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
      MOLLIE_API_KEY: "test_123456789012345678901234567890",
      NEXT_PUBLIC_BASE_URL: "https://vota.wtf",
      NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
      NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
      NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
      NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
      NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
      NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
    },
    "testingmiki"
  );
  const qrCheck = report.groups.flatMap((group) => group.checks).find((item) => item.id === "stage-qr-base");
  assert.match(qrCheck?.detail || "", /\/j\/testingmiki/);
  assert.doesNotMatch(qrCheck?.detail || "", /\/j\/megathon(?:\b|$)/);
});

test("live readiness fails fake Mollie payment lookup and passes successful smoke read", async () => {
  const store = createSeedStore();
  const deployEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    ADMIN_PASSWORD: "correct horse battery staple",
    ADMIN_SESSION_SECRET: "a".repeat(48),
    VOTA_DATA_BACKEND: "supabase",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-not-placeholder",
    MOLLIE_API_KEY: "test_123456789012345678901234567890",
    MOLLIE_READINESS_PAYMENT_ID: "tr_1234567890",
    NEXT_PUBLIC_BASE_URL: "https://vota.wtf",
    NEXT_PUBLIC_PROOF_REPO_URL: "https://example.com/repo",
    NEXT_PUBLIC_PROOF_POSTS_URL: "https://example.com/posts",
    NEXT_PUBLIC_PROOF_DEMO_URL: "https://example.com/demo",
    NEXT_PUBLIC_PROOF_CHECKOUT_URL: "https://example.com/checkout",
    NEXT_PUBLIC_PROOF_ADMIN_URL: "https://example.com/admin",
    NEXT_PUBLIC_PROOF_STAGE_URL: "https://example.com/stage"
  };

  const failed = await buildReadinessReportWithLiveChecks(
    store,
    deployEnv,
    "megathon-2026",
    async () => new Response("Unauthorized", { status: 401 })
  );
  assert.equal(failed.ready, false);
  assert.ok(
    failed.groups
      .find((group) => group.title === "Live Integrations")
      ?.checks.some((item) => item.id === "mollie-live-payment" && item.status === "fail")
  );

  const passed = await buildReadinessReportWithLiveChecks(
    store,
    deployEnv,
    "megathon-2026",
    async () => new Response(JSON.stringify({ status: "paid" }), { status: 200 })
  );
  assert.equal(passed.ready, true);
  assert.ok(
    passed.groups
      .find((group) => group.title === "Live Integrations")
      ?.checks.some((item) => item.id === "mollie-live-payment" && item.status === "pass")
  );

  const contract = {
    ok: true,
    contractVersion: "033_live_event_final_hardening",
    checkoutIntentsTable: true,
    checkoutIntentRecordRpc: true,
    checkoutIntentLinkRpc: true,
    pendingPurchaseRpc: true,
    profileLockRpc: true,
    participantEmailColumn: true,
    participantUniqueNameIndex: true,
    participantUniqueEmailIndex: true,
    poolSettlementRpc: true,
    voidMarketRpc: true,
    deleteMarketRpc: true,
    transitionMarketRpc: true,
    marketSignalsRpc: true,
    predictionLockHelperRpc: true,
    predictionSerializedRpc: true,
    agentPredictionSerializedRpc: true,
    predictionIdempotencyColumn: true,
    predictionRequestUniqueIndex: true,
    resolutionCreditUniqueIndex: true,
    voidRefundUniqueIndex: true,
    pendingPurchaseUniqueIndex: true,
    positionsSameEventTrigger: true,
    predictionActionsSameEventTrigger: true,
    stageFeatureNormalizeTrigger: true,
    ledgerSettlementColumns: true,
    repurposedSeedMarket: true,
    neutralHouseAgentNames: true,
    roleBattleStageModeRemoved: true,
    megathonTestingmikiMarketsSeeded: true,
    checkoutReturnPathScoped: true,
    participantModerationRpc: true,
    marketAggregatesPrivate: true,
    marketAggregatesNotRealtime: true,
    platformParticipantType: true,
    platformProvisionLedgerType: true,
    platformMainAccount: true,
    platformProvisionSettlement: true,
    positionsMarketSignalIndex: true,
    predictionActionsMarketCreatedIndex: true,
    participantSessionsParticipantActiveIndex: true,
    megathonFinalsSeeded: true
  };
  const staleContract = await buildReadinessReportWithLiveChecks(
    store,
    deployEnv,
    "megathon-2026",
    async () => new Response(JSON.stringify({ status: "paid" }), { status: 200 }),
    contract
  );
  assert.equal(staleContract.ready, false);
  assert.ok(
    staleContract.groups
      .find((group) => group.title === "Supabase Contract")
      ?.checks.some((item) => item.id === "supabase-contract-version" && item.status === "fail")
  );

  const currentContract = await buildReadinessReportWithLiveChecks(
    store,
    deployEnv,
    "megathon-2026",
    async () => new Response(JSON.stringify({ status: "paid" }), { status: 200 }),
    { ...contract, contractVersion: "051_delete_market_readiness_contract" }
  );
  assert.equal(currentContract.ready, true);
});

test("production base URL always uses vota.wtf over Vercel or placeholder origins", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    mutableEnv.VERCEL_URL = "vota-demo.vercel.app";
    assert.equal(baseUrl(), "https://vota.wtf");
    mutableEnv.NEXT_PUBLIC_BASE_URL = "https://vota-demo.vercel.app";
    assert.equal(baseUrl(), "https://vota.wtf");
    mutableEnv.NEXT_PUBLIC_BASE_URL = "https://vota.example";
    assert.equal(baseUrl(), "https://vota.wtf");
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalBaseUrl === undefined) delete mutableEnv.NEXT_PUBLIC_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    if (originalVercelUrl === undefined) delete mutableEnv.VERCEL_URL;
    else mutableEnv.VERCEL_URL = originalVercelUrl;
  }
});

test("stage QR join URL uses vota.wtf in production even on preview deploys", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalQrBase = process.env.NEXT_PUBLIC_QR_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.VERCEL_URL = "vota-demo.vercel.app";
    mutableEnv.NEXT_PUBLIC_BASE_URL = `https://${"preview-".repeat(24)}example.vercel.app`;
    delete mutableEnv.NEXT_PUBLIC_QR_BASE_URL;
    assert.equal(stageJoinUrl("megathon-2026"), "https://vota.wtf/j/megathon-2026");
  } finally {
    if (originalBaseUrl === undefined) delete mutableEnv.NEXT_PUBLIC_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    if (originalQrBase === undefined) delete mutableEnv.NEXT_PUBLIC_QR_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_QR_BASE_URL = originalQrBase;
    if (originalVercelUrl === undefined) delete mutableEnv.VERCEL_URL;
    else mutableEnv.VERCEL_URL = originalVercelUrl;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

test("stage QR join URL honors configured hosts outside production", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalQrBase = process.env.NEXT_PUBLIC_QR_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.VERCEL_URL = "";
    mutableEnv.NEXT_PUBLIC_BASE_URL = `https://${"preview-".repeat(24)}example.vercel.app`;
    delete mutableEnv.NEXT_PUBLIC_QR_BASE_URL;
    assert.equal(stageJoinUrl("megathon-2026").startsWith("https://vota.wtf"), false);
    assert.equal(stageJoinUrl("megathon-2026"), `${mutableEnv.NEXT_PUBLIC_BASE_URL}/j/megathon-2026`);
  } finally {
    if (originalBaseUrl === undefined) delete mutableEnv.NEXT_PUBLIC_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    if (originalQrBase === undefined) delete mutableEnv.NEXT_PUBLIC_QR_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_QR_BASE_URL = originalQrBase;
    if (originalVercelUrl === undefined) delete mutableEnv.VERCEL_URL;
    else mutableEnv.VERCEL_URL = originalVercelUrl;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
  }
});
