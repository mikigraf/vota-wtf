import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildRealtimeSocketUrl, realtimeTableNames, isRealtimeInvalidationMessage } from "../src/lib/supabase-realtime";

test("Supabase realtime websocket URL uses the public project URL and anon key", () => {
  const url = buildRealtimeSocketUrl("https://example.supabase.co", "anon-key");
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "wss:");
  assert.equal(parsed.host, "example.supabase.co");
  assert.equal(parsed.pathname, "/realtime/v1/websocket");
  assert.equal(parsed.searchParams.get("apikey"), "anon-key");
  assert.equal(parsed.searchParams.get("vsn"), "1.0.0");
});

test("Supabase realtime invalidation detects postgres change messages only", () => {
  assert.equal(isRealtimeInvalidationMessage(JSON.stringify({ event: "postgres_changes", payload: {} })), true);
  assert.equal(isRealtimeInvalidationMessage({ event: "broadcast", payload: {} }), true);
  assert.equal(isRealtimeInvalidationMessage(JSON.stringify({ event: "phx_reply", payload: {} })), false);
  assert.equal(isRealtimeInvalidationMessage("not-json"), false);
});

test("Supabase realtime defaults avoid participant private data", () => {
  assert.deepEqual(realtimeTableNames(), ["events", "markets", "outcomes", "market_aggregates"]);
});

test("participant prediction cards use polling instead of realtime subscriptions", () => {
  const predictionPanel = fs.readFileSync("components/prediction-panel.tsx", "utf8");
  const stageView = fs.readFileSync("components/stage-view.tsx", "utf8");
  const adminRefresh = fs.readFileSync("components/admin-live-refresh.tsx", "utf8");
  const publicEventLive = fs.readFileSync("components/public-event-live.tsx", "utf8");
  const eventPage = fs.readFileSync("app/e/[eventSlug]/page.tsx", "utf8");

  assert.doesNotMatch(predictionPanel, /subscribeToSupabaseRealtime/);
  assert.match(predictionPanel, /setInterval\(refresh, 3000\)/);
  assert.match(eventPage, /<PublicEventLive eventSlug=\{slug\} initialState=\{state\} \/>/);
  assert.doesNotMatch(adminRefresh, /PublicLiveRefresh/);
  assert.doesNotMatch(publicEventLive, /subscribeToSupabaseRealtime|router\.refresh/);
  assert.match(publicEventLive, /fetch\(`\/api\/events\/\$\{eventSlug\}\/public-state`/);
  assert.match(publicEventLive, /setInterval\(refresh, intervalMs\)/);
  assert.match(stageView, /subscribeToSupabaseRealtime/);
  assert.match(adminRefresh, /subscribeToSupabaseRealtime/);
});

test("MCP endpoint keeps a small non-admin tool surface", () => {
  const route = fs.readFileSync("app/mcp/route.ts", "utf8");
  const supportedTools = [...route.matchAll(/tool === "([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(supportedTools, [
    "calculate_allowed_stake",
    "get_market",
    "get_wallet",
    "list_markets",
    "place_prediction",
    "request_more_budget"
  ]);
  assert.doesNotMatch(route, /buy_tokens|resolve_market|create_market|adjust_ledger|execute_sql/);
  assert.match(route, /market\.status === "open" && Boolean\(visibleEventId\) && market\.eventId === visibleEventId/);
  assert.match(route, /visibleOpenMarkets\.find\(\(item\) => item\.id === body\.marketId\)/);
});
