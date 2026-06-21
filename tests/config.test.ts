import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildReadinessReport, buildReadinessReportWithLiveChecks } from "../src/lib/readiness";
import { createSeedStore } from "../src/lib/store";
import { useSupabaseStore } from "../src/lib/data";
import { baseUrl, stageJoinUrl } from "../src/lib/utils";

test("production config does not silently force the local JSON backend", () => {
  const envExample = fs.readFileSync(".env.example", "utf8");
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
  const e2eRunner = fs.readFileSync("scripts/run-local-playwright.mjs", "utf8");
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
  assert.equal(pkg.scripts["e2e"], "playwright test");
  assert.equal(pkg.scripts["e2e:local"], "node scripts/run-local-playwright.mjs");
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
  assert.match(envScript, /MOLLIE_API_KEY=/);
  assert.match(e2eRunner, /supabase", \["start"\]/);
  assert.match(e2eRunner, /supabase", \["db", "reset"\]/);
  assert.match(e2eRunner, /scripts\/seed-e2e\.ts/);
  assert.match(e2eRunner, /PLAYWRIGHT_BASE_URL: "http:\/\/127\.0\.0\.1:3100"/);
  assert.match(playwrightConfig, /readEnvFile\(path\.join\(process\.cwd\(\), "\.env\.local"\)\)/);
  assert.match(playwrightConfig, /\.\.\.localEnv,[\s\S]+\.\.\.process\.env/);
  assert.match(e2eSeed, /slug: "megathon"/);
  assert.match(e2eSeed, /name: "Megathon"/);
  assert.match(e2eSeed, /slug: "megatalkTesting"/);
  assert.match(e2eSeed, /name: "megatalkTesting"/);
  assert.match(playwrightConfig, /reuseExistingServer: process\.env\.PLAYWRIGHT_REUSE_SERVER === "1"/);
  assert.match(readme, /npm run supabase:start/);
  assert.match(readme, /supabase link --project-ref <your-supabase-project-ref>/);
  assert.match(readme, /npm run supabase:push/);
  assert.match(readme, /Keep the framework preset as `Next\.js`/);
  assert.match(readme, /npm run dev:local:supabase/);
  assert.match(readme, /npm run e2e:local/);
  assert.match(readme, /READINESS_URL=https:\/\/your-deploy\.example npm run verify:deploy/);
  assert.match(readme, /READINESS_URL=https:\/\/your-vercel-domain\.example npm run verify:deploy/);
  assert.match(readme, /docs\/live-event-readiness-plan\.md/);
  assert.match(readme, /036_admin_event_switcher_seed_events\.sql/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /npm install/);
  assert.match(workflow, /CI: "false"/);
  assert.match(workflow, /npm run verify/);
});

test("live-event readiness plan captures the manual gates automation cannot prove", () => {
  const plan = fs.readFileSync("docs/live-event-readiness-plan.md", "utf8");

  assert.match(plan, /Supabase production must have every migration through `supabase\/migrations\/036_admin_event_switcher_seed_events\.sql` applied/);
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
    NEXT_PUBLIC_BASE_URL: "https://vota.example",
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

test("production readiness rejects local or non-HTTPS public base URLs", () => {
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

  for (const value of ["http://vota.example", "https://[::1]:3000", "https://0.0.0.0:3000"]) {
    const report = buildReadinessReport(store, { ...deployEnv, NEXT_PUBLIC_BASE_URL: value }, "megathon-2026");
    assert.ok(
      report.groups
        .find((group) => group.title === "Runtime")
        ?.checks.some((item) => item.id === "public-base-url" && item.status === "fail"),
      `expected ${value} to fail public base URL readiness`
    );
  }
});

test("production readiness requires explicit QR base for long deployed join URLs", () => {
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
      ?.checks.some((item) => item.id === "stage-qr-base" && item.status === "fail")
  );

  const withQrBase = buildReadinessReport(
    store,
    { ...deployEnv, NEXT_PUBLIC_QR_BASE_URL: "https://vota.wtf" },
    "megathon-2026"
  );
  assert.ok(
    withQrBase.groups
      .find((group) => group.title === "Runtime")
      ?.checks.some((item) => item.id === "stage-qr-base" && item.status === "pass")
  );

  const withOverlongQrBase = buildReadinessReport(
    store,
    { ...deployEnv, NEXT_PUBLIC_QR_BASE_URL: `https://${"qr-too-long-".repeat(18)}example.com` },
    "megathon-2026"
  );
  assert.ok(
    withOverlongQrBase.groups
      .find((group) => group.title === "Runtime")
      ?.checks.some((item) => item.id === "stage-qr-base" && item.status === "fail")
  );
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
    NEXT_PUBLIC_BASE_URL: "https://vota.example",
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
    poolSettlementRpc: true,
    voidMarketRpc: true,
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
    ledgerSettlementColumns: true
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
    { ...contract, contractVersion: "035_email_unique_names_no_roles" }
  );
  assert.equal(currentContract.ready, true);
});

test("production base URL prefers Vercel origin over copied localhost placeholder", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    mutableEnv.VERCEL_URL = "vota-demo.vercel.app";
    assert.equal(baseUrl(), "https://vota-demo.vercel.app");
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalBaseUrl === undefined) delete mutableEnv.NEXT_PUBLIC_BASE_URL;
    else mutableEnv.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    if (originalVercelUrl === undefined) delete mutableEnv.VERCEL_URL;
    else mutableEnv.VERCEL_URL = originalVercelUrl;
  }
});

test("stage QR join URL falls back to a short QR base when deploy URLs are too long", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalQrBase = process.env.NEXT_PUBLIC_QR_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.VERCEL_URL = "";
    mutableEnv.NEXT_PUBLIC_BASE_URL = `https://${"preview-".repeat(24)}example.vercel.app`;
    mutableEnv.NEXT_PUBLIC_QR_BASE_URL = "https://vota.wtf";
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

test("stage QR join URL never silently switches to a default host", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const originalQrBase = process.env.NEXT_PUBLIC_QR_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = "production";
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
