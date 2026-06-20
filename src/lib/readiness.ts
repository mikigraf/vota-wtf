import { DEFAULT_EVENT_SLUG } from "./constants";
import { dashboardMetrics, publicState } from "./store";
import type { PublicEventState, Store } from "./types";

export type ReadinessStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  href?: string;
}

export interface ReadinessGroup {
  title: string;
  checks: ReadinessCheck[];
}

export interface ReadinessReport {
  generatedAt: string;
  ready: boolean;
  counts: Record<ReadinessStatus, number>;
  groups: ReadinessGroup[];
}

type EnvShape = Record<string, string | undefined>;
type FetchLike = typeof fetch;

const proofEnvVars = [
  ["NEXT_PUBLIC_PROOF_REPO_URL", "Public repo / commit"],
  ["NEXT_PUBLIC_PROOF_POSTS_URL", "Public posts thread"],
  ["NEXT_PUBLIC_PROOF_DEMO_URL", "Demo clip"],
  ["NEXT_PUBLIC_PROOF_CHECKOUT_URL", "Checkout screenshot"],
  ["NEXT_PUBLIC_PROOF_ADMIN_URL", "Admin screenshot"],
  ["NEXT_PUBLIC_PROOF_STAGE_URL", "Stage screenshot"]
] as const;

function check(id: string, label: string, status: ReadinessStatus, detail: string, href?: string): ReadinessCheck {
  return { id, label, status, detail, href };
}

function configured(value?: string, placeholders: string[] = []) {
  if (!value || value.trim().length === 0) return false;
  return !placeholders.includes(value.trim());
}

function isUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isHttpsUrl(value?: string) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isLocalUrl(value?: string) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

function mollieTestKeyReady(value?: string) {
  const trimmed = value?.trim() || "";
  if (!trimmed.startsWith("test_")) return false;
  if (trimmed.length < 24) return false;
  return !/(xxx|placeholder|replace|example|abc123)/i.test(trimmed);
}

function runtimeChecks(env: EnvShape): ReadinessCheck[] {
  const production = env.NODE_ENV === "production";
  const backend = env.VOTA_DATA_BACKEND || (production ? "supabase" : "local");
  const baseUrl = env.NEXT_PUBLIC_BASE_URL || "";
  const effectiveBaseUrl = baseUrl || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  const normalJoinUrl = effectiveBaseUrl ? `${effectiveBaseUrl.replace(/\/$/, "")}/j/${DEFAULT_EVENT_SLUG}` : "";
  const normalQrIsShort = normalJoinUrl ? new TextEncoder().encode(normalJoinUrl).length <= 134 : true;
  const qrBaseReady =
    normalQrIsShort ||
    (isUrl(env.NEXT_PUBLIC_QR_BASE_URL) && !isLocalUrl(env.NEXT_PUBLIC_QR_BASE_URL) && (!production || isHttpsUrl(env.NEXT_PUBLIC_QR_BASE_URL)));
  const adminPasswordReady =
    configured(env.ADMIN_PASSWORD, ["change-me-for-megathon"]) && (env.ADMIN_PASSWORD || "").length >= 12;
  const baseUrlReady = isUrl(baseUrl) && !isLocalUrl(baseUrl) && (!production || isHttpsUrl(baseUrl));
  return [
    check(
      "admin-password",
      "Admin password",
      adminPasswordReady ? "pass" : "fail",
      adminPasswordReady
        ? "Configured with the production minimum length without exposing the value."
        : "Set ADMIN_PASSWORD to at least 12 characters and not the example value."
    ),
    check(
      "admin-session-secret",
      "Admin session secret",
      configured(env.ADMIN_SESSION_SECRET, ["replace-with-a-long-random-secret"]) && (env.ADMIN_SESSION_SECRET || "").length >= 32
        ? "pass"
        : "fail",
      "ADMIN_SESSION_SECRET must be at least 32 characters and not the example value."
    ),
    check(
      "data-backend",
      "Production backend",
      backend === "supabase" ? "pass" : production ? "fail" : "warn",
      backend === "supabase"
        ? "Supabase backend selected."
        : "Local JSON backend is acceptable for development only; deploy with VOTA_DATA_BACKEND=supabase."
    ),
    check(
      "supabase-server",
      "Supabase service credentials",
      isUrl(env.SUPABASE_URL) && configured(env.SUPABASE_SERVICE_ROLE_KEY, ["server-only"]) ? "pass" : "fail",
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for server-side writes."
    ),
    check(
      "supabase-public",
      "Supabase public realtime credentials",
      isUrl(env.NEXT_PUBLIC_SUPABASE_URL) && configured(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ["anon-key"]) ? "pass" : "fail",
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for stage/admin realtime."
    ),
    check(
      "mollie-test-key",
      "Mollie test key format",
      mollieTestKeyReady(env.MOLLIE_API_KEY) ? "pass" : "fail",
      "MOLLIE_API_KEY must be a Mollie Dashboard test key, not the example placeholder."
    ),
    check(
      "public-base-url",
      "Public base URL",
      baseUrlReady ? "pass" : production ? "fail" : "warn",
      baseUrlReady
        ? "Base URL is available for QR, checkout return links, and receipts."
        : "Set NEXT_PUBLIC_BASE_URL to the deployed HTTPS public origin before capturing proof."
    ),
    check(
      "stage-qr-base",
      "Stage QR base",
      qrBaseReady ? "pass" : production ? "fail" : "warn",
      qrBaseReady
        ? "Stage QR uses the deployed join URL or an explicit compact QR base."
        : "Set NEXT_PUBLIC_QR_BASE_URL to a short deployed HTTPS origin when the public join URL is too long for the stage QR."
    )
  ];
}

async function liveIntegrationChecks(env: EnvShape, fetchImpl: FetchLike = fetch): Promise<ReadinessCheck[]> {
  const key = env.MOLLIE_API_KEY || "";
  const paymentId = env.MOLLIE_READINESS_PAYMENT_ID || "";
  if (!mollieTestKeyReady(key)) {
    return [
      check(
        "mollie-live-payment",
        "Mollie live payment read",
        "fail",
        "Set a real Mollie Dashboard test key before running the live payment readiness check."
      )
    ];
  }
  if (!configured(paymentId, ["tr_replace_with_successful_test_payment_id", "test-payment-id", "tr_xxx"])) {
    return [
      check(
        "mollie-live-payment",
        "Mollie live payment read",
        "fail",
        "Set MOLLIE_READINESS_PAYMENT_ID to a successful deployed test payment id from this Mollie account."
      )
    ];
  }

  try {
    const response = await fetchImpl(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!response.ok) {
      return [
        check(
          "mollie-live-payment",
          "Mollie live payment read",
          "fail",
          `Mollie rejected the readiness payment lookup with HTTP ${response.status}.`
        )
      ];
    }
    const data = await response.json().catch(() => ({}));
    const status = typeof data.status === "string" ? data.status : "unknown";
    return [
      check(
        "mollie-live-payment",
        "Mollie live payment read",
        "pass",
        `Mollie accepted the test key and returned payment status ${status}.`
      )
    ];
  } catch {
    return [
      check(
        "mollie-live-payment",
        "Mollie live payment read",
        "fail",
        "Could not reach Mollie to validate the configured test payment id."
      )
    ];
  }
}

function proofChecks(env: EnvShape): ReadinessCheck[] {
  return proofEnvVars.map(([key, label]) => {
    const href = env[key];
    return check(
      key.toLowerCase(),
      label,
      isUrl(href) ? "pass" : "fail",
      isUrl(href) ? "Proof evidence link is configured." : `Set ${key} to the public evidence URL.`,
      isUrl(href) ? href : undefined
    );
  });
}

function eventChecks(store: Store, eventSlug: string): ReadinessCheck[] {
  const event = store.events.find((item) => item.slug === eventSlug);
  if (!event) {
    return [
      check("event-exists", "Active event", "fail", `No event found for ${eventSlug}.`)
    ];
  }
  const metrics = dashboardMetrics(store, eventSlug);
  const state = publicState(store, eventSlug);
  const eventMarkets = store.markets.filter((market) => market.eventId === event.id);
  const publicMarkets = state.markets.filter((market) => market.status !== "voided");
  const stageMarket = state.markets.find((market) => market.id === state.event.featuredMarketId);
  return [
    check(
      "event-status",
      "Event status",
      event.status === "live" ? "pass" : "warn",
      `Event is ${event.status}; set it live for the ceremony.`
    ),
    check(
      "market-count",
      "Prediction card count",
      eventMarkets.length >= 3 ? "pass" : "fail",
      `${eventMarkets.length} configured markets; Sunday script expects 3-5 cards.`
    ),
    check(
      "public-markets",
      "Public prediction feed",
      publicMarkets.length > 0 ? "pass" : "fail",
      `${publicMarkets.length} non-draft markets are visible to participants.`
    ),
    check(
      "active-market",
      "Open prediction market",
      metrics.activeMarkets > 0 ? "pass" : "fail",
      `${metrics.activeMarkets} markets are open for predictions.`
    ),
    check(
      "stage-feature",
      "Stage featured market",
      stageMarket ? "pass" : "fail",
      stageMarket ? `Stage can feature ${stageMarket.title}.` : "Set a non-draft show-on-stage market."
    )
  ];
}

function publicEventChecks(state: PublicEventState, eventSlug: string): ReadinessCheck[] {
  const publicMarkets = state.markets.filter((market) => market.status !== "voided");
  const stageMarket = state.markets.find((market) => market.id === state.event.featuredMarketId);
  return [
    check(
      "event-status",
      "Event status",
      state.event.status === "live" ? "pass" : "warn",
      `Event is ${state.event.status}; set it live for the ceremony.`
    ),
    check(
      "market-count",
      "Prediction card count",
      state.markets.length >= 3 ? "pass" : "fail",
      `${state.markets.length} public markets are configured; Sunday script expects 3-5 cards.`
    ),
    check(
      "public-markets",
      "Public prediction feed",
      publicMarkets.length > 0 ? "pass" : "fail",
      `${publicMarkets.length} non-draft markets are visible to participants.`
    ),
    check(
      "active-market",
      "Open prediction market",
      state.markets.some((market) => market.status === "open") ? "pass" : "fail",
      `${state.markets.filter((market) => market.status === "open").length} markets are open for predictions.`
    ),
    check(
      "stage-feature",
      "Stage featured market",
      stageMarket ? "pass" : "fail",
      stageMarket ? `Stage can feature ${stageMarket.title}.` : "Set a non-draft show-on-stage market."
    )
  ];
}

function optionalIntegrationChecks(env: EnvShape): ReadinessCheck[] {
  return [
    check(
      "cala-context",
      "Cala context export",
      configured(env.CALA_CONTEXT_WEBHOOK_URL, ["optional-context-export-target"]) ? "pass" : "warn",
      configured(env.CALA_CONTEXT_WEBHOOK_URL, ["optional-context-export-target"])
        ? "External Cala webhook configured; local Cala JSON export also remains available."
        : "Optional: set CALA_CONTEXT_WEBHOOK_URL if external enrichment should be pushed out."
    ),
    check(
      "pixverse-key",
      "PixVerse generation key",
      configured(env.PIXVERSE_API_KEY, ["optional-promo-generation-key"]) ? "pass" : "warn",
      configured(env.PIXVERSE_API_KEY, ["optional-promo-generation-key"])
        ? "External PixVerse key configured; local promo briefs and animated receipts also remain available."
        : "Optional: set PIXVERSE_API_KEY if generated videos should be created outside the app."
    )
  ];
}

function readinessGroups(store: Store, env: EnvShape, eventSlug: string): ReadinessGroup[] {
  return [
    { title: "Runtime", checks: runtimeChecks(env) },
    { title: "Event Data", checks: eventChecks(store, eventSlug) },
    { title: "Public Proof", checks: proofChecks(env) },
    { title: "Optional P2 Integrations", checks: optionalIntegrationChecks(env) }
  ];
}

function publicReadinessGroups(state: PublicEventState, env: EnvShape, eventSlug: string): ReadinessGroup[] {
  return [
    { title: "Runtime", checks: runtimeChecks(env) },
    { title: "Event Data", checks: publicEventChecks(state, eventSlug) },
    { title: "Public Proof", checks: proofChecks(env) },
    { title: "Optional P2 Integrations", checks: optionalIntegrationChecks(env) }
  ];
}

function reportFromGroups(groups: ReadinessGroup[]): ReadinessReport {
  const counts = groups
    .flatMap((group) => group.checks)
    .reduce<Record<ReadinessStatus, number>>(
      (acc, item) => {
        acc[item.status] += 1;
        return acc;
      },
      { pass: 0, warn: 0, fail: 0 }
    );
  return {
    generatedAt: new Date().toISOString(),
    ready: counts.fail === 0,
    counts,
    groups
  };
}

export function buildReadinessReport(
  store: Store,
  env: EnvShape = process.env,
  eventSlug = DEFAULT_EVENT_SLUG
): ReadinessReport {
  return reportFromGroups(readinessGroups(store, env, eventSlug));
}

export function buildPublicReadinessReport(
  state: PublicEventState,
  env: EnvShape = process.env,
  eventSlug = DEFAULT_EVENT_SLUG
): ReadinessReport {
  return reportFromGroups(publicReadinessGroups(state, env, eventSlug));
}

export async function buildReadinessReportWithLiveChecks(
  store: Store,
  env: EnvShape = process.env,
  eventSlug = DEFAULT_EVENT_SLUG,
  fetchImpl: FetchLike = fetch
): Promise<ReadinessReport> {
  const groups = [
    ...readinessGroups(store, env, eventSlug),
    { title: "Live Integrations", checks: await liveIntegrationChecks(env, fetchImpl) }
  ];
  return reportFromGroups(groups);
}

export function readinessHttpStatus(report: ReadinessReport) {
  return report.ready ? 200 : 503;
}
