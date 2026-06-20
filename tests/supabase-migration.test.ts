import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/001_vota_wtf_v7.sql", "utf8");
const coreMigration = fs.readFileSync("supabase/migrations/002_transactional_core.sql", "utf8");
const voidMigration = fs.readFileSync("supabase/migrations/004_transactional_admin_void.sql", "utf8");
const lifecycleMigration = fs.readFileSync("supabase/migrations/005_transactional_admin_lifecycle.sql", "utf8");
const hardeningMigration = fs.readFileSync("supabase/migrations/006_public_hardening.sql", "utf8");
const adminMarketCrudMigration = fs.readFileSync("supabase/migrations/007_admin_market_crud_tx.sql", "utf8");
const publicLeaderboardMigration = fs.readFileSync("supabase/migrations/008_public_leaderboard_projection.sql", "utf8");
const seedRepairMigration = fs.readFileSync("supabase/migrations/009_seed_public_market_count.sql", "utf8");
const predictionIdempotencyMigration = fs.readFileSync("supabase/migrations/010_prediction_idempotency.sql", "utf8");
const resolutionSettlementMigration = fs.readFileSync("supabase/migrations/011_resolution_credit_settlement.sql", "utf8");
const marketEngineV8Migration = fs.readFileSync("supabase/migrations/012_market_engine_v8.sql", "utf8");
const scopedOracleResetMigration = fs.readFileSync("supabase/migrations/013_scoped_oracle_score_reset.sql", "utf8");
const liveHardeningMigration = fs.readFileSync("supabase/migrations/014_live_event_resolution_and_profile_hardening.sql", "utf8");
const stageControlGuardMigration = fs.readFileSync("supabase/migrations/015_stage_control_market_guards.sql", "utf8");
const voidGuardMigration = fs.readFileSync("supabase/migrations/016_void_market_resolution_and_stage_guards.sql", "utf8");
const blindLaunchClearMigration = fs.readFileSync("supabase/migrations/017_market_admin_blind_launch_clear.sql", "utf8");
const profileCompletionMigration = fs.readFileSync("supabase/migrations/018_profile_completion_avatar_optional.sql", "utf8");
const featureStageGuardMigration = fs.readFileSync("supabase/migrations/019_feature_market_stage_guards.sql", "utf8");
const leaderboardParityMigration = fs.readFileSync("supabase/migrations/020_public_leaderboard_stage_signal_parity.sql", "utf8");
const ledgerParityMigration = fs.readFileSync("supabase/migrations/021_ledger_audit_field_parity.sql", "utf8");
const eventIntegrityMigration = fs.readFileSync("supabase/migrations/022_participant_market_event_integrity.sql", "utf8");
const resolveLockOrderMigration = fs.readFileSync("supabase/migrations/023_resolve_market_lock_order.sql", "utf8");
const marketStageFallbackMigration = fs.readFileSync("supabase/migrations/024_update_market_stage_fallback.sql", "utf8");
const guardSessionRecoveryMigration = fs.readFileSync("supabase/migrations/025_guard_session_recovery.sql", "utf8");
const zeroSwitchGuardMigration = fs.readFileSync("supabase/migrations/026_zero_switch_impact_guard.sql", "utf8");
const stageResolutionFallbackMigration = fs.readFileSync("supabase/migrations/027_stage_resolution_resolved_fallback.sql", "utf8");
const humanRoomSignalMigration = fs.readFileSync("supabase/migrations/028_human_room_signal_snapshot.sql", "utf8");
const dataLayer = fs.readFileSync("src/lib/data.ts", "utf8");
const marketForm = fs.readFileSync("components/market-form.tsx", "utf8");
const marketUpdateRoute = fs.readFileSync("app/api/admin/markets/[id]/route.ts", "utf8");
const marketCreateRoute = fs.readFileSync("app/api/admin/markets/route.ts", "utf8");
const newMarketPage = fs.readFileSync("app/admin/markets/new/page.tsx", "utf8");
const rootPage = fs.readFileSync("app/page.tsx", "utf8");
const marketPage = fs.readFileSync("app/admin/markets/[id]/page.tsx", "utf8");
const eventPage = fs.readFileSync("app/e/[eventSlug]/page.tsx", "utf8");
const joinPage = fs.readFileSync("app/join/[eventSlug]/page.tsx", "utf8");
const publicEventLive = fs.readFileSync("components/public-event-live.tsx", "utf8");
const publicMarketPage = fs.readFileSync("app/m/[marketId]/page.tsx", "utf8");
const publicStateRoute = fs.readFileSync("app/api/events/[slug]/public-state/route.ts", "utf8");
const publicLeaderboardRoute = fs.readFileSync("app/api/leaderboard/[eventSlug]/route.ts", "utf8");
const predictRoute = fs.readFileSync("app/api/markets/[id]/predict/route.ts", "utf8");
const initRoute = fs.readFileSync("app/api/session/init/route.ts", "utf8");
const stagePage = fs.readFileSync("app/stage/[eventSlug]/page.tsx", "utf8");
const adminStagePage = fs.readFileSync("app/admin/stage/page.tsx", "utf8");
const stageView = fs.readFileSync("components/stage-view.tsx", "utf8");
const stageRoute = fs.readFileSync("app/api/admin/stage/route.ts", "utf8");
const middleware = fs.readFileSync("middleware.ts", "utf8");
const adminNav = fs.readFileSync("components/admin-nav.tsx", "utf8");
const agentsPage = fs.readFileSync("app/admin/agents/page.tsx", "utf8");
const mcpTokenForm = fs.readFileSync("components/mcp-token-form.tsx", "utf8");
const mcpTokenRoute = fs.readFileSync("app/api/admin/mcp-tokens/route.ts", "utf8");
const ensureAgentsRoute = fs.readFileSync("app/api/admin/agents/ensure/route.ts", "utf8");
const eventAdminPage = fs.readFileSync("app/admin/events/[slug]/page.tsx", "utf8");
const adminReportPage = fs.readFileSync("app/admin/report/page.tsx", "utf8");
const adminReportRoute = fs.readFileSync("app/api/admin/report/route.ts", "utf8");
const buildPage = fs.readFileSync("app/build/page.tsx", "utf8");
const buildDemoPage = fs.readFileSync("app/build/demo/page.tsx", "utf8");
const receiptPage = fs.readFileSync("app/receipt/[id]/page.tsx", "utf8");
const receiptPromoPage = fs.readFileSync("app/receipt/[id]/promo/page.tsx", "utf8");
const predictionPanel = fs.readFileSync("components/prediction-panel.tsx", "utf8");
const checkoutButton = fs.readFileSync("components/checkout-button.tsx", "utf8");
const joinForm = fs.readFileSync("components/join-form.tsx", "utf8");
const profileRoute = fs.readFileSync("app/api/session/profile/route.ts", "utf8");
const analyticsHelper = fs.readFileSync("src/lib/analytics.ts", "utf8");
const promoHelper = fs.readFileSync("src/lib/promo.ts", "utf8");
const envExample = fs.readFileSync(".env.example", "utf8");
const adminAgentRoute = fs.readFileSync("app/api/admin/agents/run-house-agent/route.ts", "utf8");
const externalAgentRoute = fs.readFileSync("app/api/agents/run-house-agent/route.ts", "utf8");
const checkoutRoute = fs.readFileSync("app/api/payments/mollie/create-test-checkout/route.ts", "utf8");
const checkoutStatusRoute = fs.readFileSync("app/api/payments/mollie/status/route.ts", "utf8");
const webhookRoute = fs.readFileSync("app/api/payments/mollie/webhook/route.ts", "utf8");
const localCheckoutPage = fs.readFileSync("app/checkout/test/[purchaseId]/page.tsx", "utf8");
const paymentsHelper = fs.readFileSync("src/lib/payments.ts", "utf8");
const publicReadinessRoute = fs.readFileSync("app/api/readiness/route.ts", "utf8");
const adminLoginRoute = fs.readFileSync("app/api/admin/login/route.ts", "utf8");
const mcpRoute = fs.readFileSync("app/mcp/route.ts", "utf8");

const adminRouteFiles = [
  "app/api/admin/agents/ensure/route.ts",
  "app/api/admin/agents/run-house-agent/route.ts",
  "app/api/admin/audit/route.ts",
  "app/api/admin/logout/route.ts",
  "app/api/admin/markets/[id]/feature/route.ts",
  "app/api/admin/markets/[id]/lock/route.ts",
  "app/api/admin/markets/[id]/open/route.ts",
  "app/api/admin/markets/[id]/resolve/route.ts",
  "app/api/admin/markets/[id]/route.ts",
  "app/api/admin/markets/[id]/void/route.ts",
  "app/api/admin/markets/route.ts",
  "app/api/admin/mcp-tokens/route.ts",
  "app/api/admin/participants/route.ts",
  "app/api/admin/payments/reconcile/route.ts",
  "app/api/admin/payments/route.ts",
  "app/api/admin/readiness/route.ts",
  "app/api/admin/report/route.ts",
  "app/api/admin/stage/route.ts"
];

test("Supabase public grants stay limited to public aggregate state", () => {
  assert.match(migration, /grant select on events, markets, outcomes, market_aggregates to anon, authenticated;/);
  assert.match(migration, /create unique index if not exists mcp_tokens_token_hash_idx/);
  assert.doesNotMatch(migration, /create policy public_read_participants/);
  assert.match(migration, /revoke all privileges on table\s+participants,/);
  assert.match(migration, /from public, anon, authenticated;/);
  assert.match(hardeningMigration, /create policy public_read_markets on markets for select using \(status <> 'draft'\)/);
  assert.match(hardeningMigration, /create policy public_read_outcomes[\s\S]+markets\.status <> 'draft'/);
  assert.match(hardeningMigration, /create policy public_read_market_aggregates[\s\S]+markets\.status <> 'draft'/);
  assert.match(
    hardeningMigration,
    /revoke execute on function init_participant_session_tx\(text, text\) from public, anon, authenticated;/
  );
  assert.match(
    hardeningMigration,
    /revoke execute on function ensure_house_agents_tx\(text\) from public, anon, authenticated;/
  );
  assert.match(publicLeaderboardMigration, /create or replace function public_leaderboard_tx\(p_event_slug text\)/);
  assert.match(publicLeaderboardMigration, /returns table[\s\S]+oracle_score integer[\s\S]+contrarian_score integer/);
  assert.match(publicLeaderboardMigration, /stage_signal_snapshot ->> resolved_outcome_id::text/);
  assert.match(publicLeaderboardMigration, /people_signal_snapshot ->> resolved_outcome_id::text/);
  assert.match(leaderboardParityMigration, /public_leaderboard_tx\(text\)/);
  assert.match(leaderboardParityMigration, /Could not patch public_leaderboard_tx popularity expression/);
  assert.match(publicLeaderboardMigration, /revoke execute on function public_leaderboard_tx\(text\) from public, anon, authenticated;/);
  assert.match(seedRepairMigration, /where id = '00000000-0000-4000-8000-000000000103'/);
  assert.match(seedRepairMigration, /status = 'open'/);
  assert.match(dataLayer, /rpc<Row\[]>\("public_leaderboard_tx"/);
  assert.match(eventPage, /readPublicStateData\(slug\)/);
  assert.match(eventPage, /readLeaderboardGroupsData\(slug\)/);
  assert.match(eventPage, /getSessionParticipantData\(sessionId\)/);
  assert.match(eventPage, /findEventBySlugData\(slug\)/);
  assert.match(eventPage, /session\?\.participant\.eventId !== event\.id/);
  assert.match(eventPage, /hasCompletedProfile\(session\?\.participant\)/);
  assert.match(joinPage, /findEventBySlugData\(eventSlug\)/);
  assert.match(joinPage, /Event not found\./);
  assert.doesNotMatch(eventPage, /readDataStore|readPublicEventStoreData|leaderboardGroups\(|publicState\(|getSessionParticipant\(/);
  assert.match(publicMarketPage, /item\.id === marketId && item\.status !== "draft"/);
  assert.match(publicMarketPage, /readPublicMarketStoreData\(marketId, sessionId\)/);
  assert.match(publicMarketPage, /hasCompletedProfile\(session\?\.participant\)/);
  assert.match(publicMarketPage, /session\?\.participant\.eventId !== market\.eventId/);
  assert.doesNotMatch(publicMarketPage, /readDataStore|readPublicEventStoreData/);
  assert.match(stagePage, /readPublicStateData\(slug\)/);
  assert.match(stagePage, /readLeaderboardGroupsData\(slug\)/);
  assert.match(stagePage, /roleWinners: state\.roleWinners/);
  assert.doesNotMatch(stagePage, /readDataStore|readPublicEventStoreData|leaderboardGroups\(|roleWinnerLabel/);
  assert.match(publicLeaderboardRoute, /readLeaderboardGroupsData\(eventSlug\)/);
  assert.doesNotMatch(publicLeaderboardRoute, /readDataStore|readPublicEventStoreData|leaderboardGroups\(/);
  assert.match(predictRoute, /readPublicMarketStoreData\(id, sessionId\)/);
  assert.match(predictRoute, /getSessionParticipantData\(getParticipantSessionIdFromRequest\(request\)\)/);
  assert.match(predictRoute, /hasCompletedProfile\(session\?\.participant\)/);
  assert.match(predictRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.doesNotMatch(predictRoute, /readDataStore/);
  assert.match(profileRoute, /getSessionParticipantData\(getParticipantSessionIdFromRequest\(request\)\)/);
  assert.match(profileRoute, /Enter a stage name before joining/);
  assert.match(profileRoute, /findNextOpenMarketData\(session\.participant\.eventId\)/);
  assert.doesNotMatch(profileRoute, /readDataStore|getSessionFromRequestData/);
  assert.match(initRoute, /try \{/);
  assert.match(initRoute, /Could not start this event session\./);
  assert.match(publicStateRoute, /readPublicStateData\(slug\)/);
  assert.match(publicStateRoute, /badRequest\("Event not found\.", 404\)/);
  assert.match(dataLayer, /export async function readPublicStateData/);
  assert.match(dataLayer, /export async function readReceiptStoreData/);
  assert.match(dataLayer, /if \(!directAction\) return emptyDataStore\(\)/);
  assert.match(dataLayer, /async function readSupabasePublicState/);
  assert.match(dataLayer, /publicState\(scopedPublicEventStore\(await readStore\(\), eventSlug\), eventSlug\)/);
  assert.match(dataLayer, /selectRows\("markets", `select=\*&event_id=eq\.\$\{encodeURIComponent\(event\.id\)\}&status=neq\.draft`\)/);
  assert.match(dataLayer, /selectRows\("outcomes", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.match(dataLayer, /selectRows\("market_aggregates", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.match(dataLayer, /selectRows\("prediction_actions", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.doesNotMatch(publicStateRoute, /readDataStore/);
});

test("Supabase prediction tables enforce participant and market event integrity", () => {
  assert.match(eventIntegrityMigration, /create or replace function assert_participant_market_same_event\(\)/);
  assert.match(eventIntegrityMigration, /security definer/);
  assert.match(eventIntegrityMigration, /Participant and market must belong to the same event\./);
  assert.match(eventIntegrityMigration, /create trigger positions_participant_market_same_event/);
  assert.match(eventIntegrityMigration, /before insert or update of participant_id, market_id on positions/);
  assert.match(eventIntegrityMigration, /create trigger prediction_actions_participant_market_same_event/);
  assert.match(eventIntegrityMigration, /before insert or update of participant_id, market_id on prediction_actions/);
  assert.match(
    eventIntegrityMigration,
    /revoke execute on function assert_participant_market_same_event\(\) from public, anon, authenticated;/
  );
});

test("root route starts the live participant journey at join instead of browsing markets", () => {
  assert.match(rootPage, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(rootPage, /readDataStore/);
  assert.doesNotMatch(rootPage, /item\.status === "live"/);
  assert.match(rootPage, /redirect\(`\/join\/\$\{DEFAULT_EVENT_SLUG\}`\)/);
  assert.match(dataLayer, /VOTA_ENABLE_PRODUCTION_AUTO_SEED/);
  assert.match(dataLayer, /NODE_ENV === "production"/);
});

test("mobile prediction journey avoids accidental commits and nested checkout submits", () => {
  assert.match(predictionPanel, /useState\(""\)/);
  assert.match(predictionPanel, /Pick an outcome above/);
  assert.match(predictionPanel, /\? "Choose an outcome"/);
  assert.match(checkoutButton, /type="button"/);
  assert.match(checkoutButton, /usePathname/);
  assert.match(checkoutButton, /body: JSON\.stringify\(\{ returnTo: returnTo \|\| pathname \|\| "\/" \}\)/);
  assert.match(predictionPanel, /returnTo=\{`\/m\/\$\{market\.id\}`\}/);
  assert.match(predictionPanel, /order-3 lg:col-start-1/);
  assert.match(joinPage, /Add a photo if you want/);
  assert.match(joinForm, /Photo or avatar optional/);
  assert.doesNotMatch(joinForm, /capture="user"/);
  assert.match(joinPage, /initialProfileComplete=\{hasCompletedProfile\(session\?\.participant\)\}/);
  assert.match(joinForm, /initialRoleValue\(initialRole, initialProfileComplete\)/);
  assert.match(joinForm, /newAvatarDataUrl/);
  assert.match(joinForm, /avatarPreviewUrl/);
  assert.match(profileRoute, /submittedAvatar\.startsWith\("data:image\/"\)/);
  assert.match(profileCompletionMigration, /replace\(v_sql, E'      or v_participant\.avatar_url is null\\n', ''\)/);
  assert.match(profileCompletionMigration, /lower\(trim\(v_participant\.nickname\)\) = ''oracle''/);
  assert.doesNotMatch(marketEngineV8Migration, /or v_participant\.avatar_url is null/);
  assert.doesNotMatch(liveHardeningMigration, /or v_participant\.avatar_url is null/);
});

test("Supabase realtime hardening removes private tables from publication", () => {
  for (const table of [
    "participants",
    "participant_sessions",
    "wallets",
    "positions",
    "prediction_actions",
    "ledger_entries",
    "purchases",
    "admin_audit_logs",
    "agent_profiles",
    "agent_runs",
    "mcp_tokens"
  ]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /alter publication supabase_realtime drop table public\.%I/);
  assert.doesNotMatch(migration, /cmd in \('SELECT', 'ALL'\)/);
});

test("Supabase void market flow is transactional and idempotent", () => {
  assert.match(voidMigration, /create or replace function void_market_tx\(p_market_id uuid, p_ip text default null\)/);
  assert.match(voidMigration, /for update/);
  assert.match(
    voidMigration,
    /from participants[\s\S]+for update;[\s\S]+from wallets[\s\S]+for update;[\s\S]+from markets[\s\S]+for update;/
  );
  assert.match(voidMigration, /one_void_refund_per_participant_market/);
  assert.match(voidMigration, /on conflict \(participant_id, market_id\) where type = 'void_refund'/);
  assert.match(voidMigration, /perform pg_advisory_xact_lock\(724118991042\)/);
  assert.match(voidMigration, /perform recompute_market_aggregate\(p_market_id\)/);
  assert.match(voidMigration, /perform recompute_oracle_scores_tx\(\)/);
  assert.match(voidMigration, /insert into admin_audit_logs \(action, entity_type, entity_id, details, ip\)/);
  assert.match(voidMigration, /grant execute on function void_market_tx\(uuid, text\) to service_role/);
  assert.match(voidGuardMigration, /create or replace function void_market_tx\(p_market_id uuid, p_ip text default null\)/);
  assert.match(voidGuardMigration, /Resolved markets cannot be voided/);
  assert.match(voidGuardMigration, /show_on_stage = false/);
  assert.match(voidGuardMigration, /featured_market_id = v_fallback_market_id/);
  assert.match(voidGuardMigration, /direction,\s+balance_after/);
  assert.match(voidGuardMigration, /jsonb_build_object\('outcomeId', v_position\.outcome_id\)/);
  assert.match(voidGuardMigration, /grant execute on function void_market_tx\(uuid, text\) to service_role/);
});

test("Supabase admin open lock and resolve flows are transactional", () => {
  assert.match(lifecycleMigration, /create or replace function transition_market_tx\(p_market_id uuid, p_action text, p_ip text default null\)/);
  assert.match(lifecycleMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null\)/);
  assert.match(lifecycleMigration, /from markets[\s\S]+for update/);
  assert.match(lifecycleMigration, /perform pg_advisory_xact_lock\(724118991042\)/);
  assert.match(lifecycleMigration, /p_action = 'open'[\s\S]+p_action = 'lock'/);
  assert.match(lifecycleMigration, /Only draft markets can be opened/);
  assert.match(lifecycleMigration, /Only locked markets can be resolved/);
  assert.match(lifecycleMigration, /show_on_stage = true/);
  assert.match(lifecycleMigration, /stage_mode = 'resolution'/);
  assert.match(lifecycleMigration, /featured_market_id = p_market_id/);
  assert.match(lifecycleMigration, /perform recompute_oracle_scores_tx\(\)/);
  assert.match(lifecycleMigration, /values \('resolve_market', 'market'/);
  assert.match(lifecycleMigration, /create or replace function feature_market_tx\(p_market_id uuid, p_ip text default null\)/);
  assert.match(lifecycleMigration, /create or replace function update_stage_controls_tx\(/);
  assert.match(lifecycleMigration, /p_ip text default null/);
  assert.match(lifecycleMigration, /values \('feature_market', 'market'/);
  assert.match(lifecycleMigration, /values \(\s*'stage_control'/);
  assert.match(lifecycleMigration, /insert into admin_audit_logs \(action, entity_type, entity_id, details, ip\)/);
  assert.match(lifecycleMigration, /grant execute on function transition_market_tx\(uuid, text, text\) to service_role/);
  assert.match(lifecycleMigration, /grant execute on function resolve_market_tx\(uuid, uuid, text, text\) to service_role/);
  assert.match(lifecycleMigration, /grant execute on function feature_market_tx\(uuid, text\) to service_role/);
  assert.match(lifecycleMigration, /grant execute on function update_stage_controls_tx\(text, text, uuid, boolean, text\) to service_role/);
  assert.match(stageControlGuardMigration, /create or replace function update_stage_controls_tx\(/);
  assert.match(stageControlGuardMigration, /This stage mode needs a stage-visible market/);
  assert.match(stageControlGuardMigration, /Resolution reveal needs a resolved market/);
  assert.match(stageControlGuardMigration, /v_market\.status in \('draft', 'voided'\)/);
  assert.match(stageControlGuardMigration, /grant execute on function update_stage_controls_tx\(text, text, uuid, boolean, text\) to service_role/);
  assert.match(resolveLockOrderMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid/);
  assert.match(resolveLockOrderMigration, /from participants[\s\S]+order by id[\s\S]+for update;/);
  assert.match(resolveLockOrderMigration, /from wallets[\s\S]+order by participant_id[\s\S]+for update;/);
  assert.match(resolveLockOrderMigration, /select \* into v_market from markets where id = p_market_id for update/);
  assert.match(resolveLockOrderMigration, /grant execute on function resolve_market_tx\(uuid, uuid, text, text\) to service_role/);
  assert.match(dataLayer, /const result = await rpc<Row>\("update_stage_controls_tx"/);
  assert.match(dataLayer, /return eventFromRow\(result\.event\)/);
});

test("Supabase resolve flow settles correct MegaBucks idempotently", () => {
  assert.match(migration, /'resolution_credit'/);
  assert.match(resolutionSettlementMigration, /ledger_entries_type_check/);
  assert.match(resolutionSettlementMigration, /'resolution_credit'/);
  assert.match(resolutionSettlementMigration, /one_resolution_credit_per_participant_market/);
  assert.match(resolutionSettlementMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null\)/);
  assert.match(resolutionSettlementMigration, /from wallets[\s\S]+for update/);
  assert.match(resolutionSettlementMigration, /where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0/);
  assert.match(resolutionSettlementMigration, /insert into ledger_entries \(participant_id, type, amount_credits, reason, market_id, created_at\)/);
  assert.match(resolutionSettlementMigration, /on conflict \(participant_id, market_id\) where type = 'resolution_credit' and market_id is not null do nothing/);
  assert.match(resolutionSettlementMigration, /get diagnostics v_settlement_inserted = ROW_COUNT/);
  assert.match(resolutionSettlementMigration, /balance_credits = balance_credits \+ v_position\.raw_credits/);
  assert.match(resolutionSettlementMigration, /'settledCredits', v_settled_credits/);
  assert.match(resolutionSettlementMigration, /grant execute on function resolve_market_tx\(uuid, uuid, text, text\) to service_role/);
  assert.match(scopedOracleResetMigration, /update participants set oracle_score = 0 where id is not null;/);
  assert.doesNotMatch(scopedOracleResetMigration, /update participants set oracle_score = 0;/);
  assert.match(liveHardeningMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null\)/);
  assert.match(liveHardeningMigration, /select \* into v_wallet from wallets where participant_id = v_position\.participant_id for update/);
  assert.match(liveHardeningMigration, /insert into ledger_entries[\s\S]+on conflict \(participant_id, market_id\) where type = 'resolution_credit'/);
  assert.match(liveHardeningMigration, /get diagnostics v_settlement_inserted = ROW_COUNT;[\s\S]+if v_settlement_inserted > 0 then[\s\S]+update wallets/);
  assert.match(liveHardeningMigration, /grant execute on function resolve_market_tx\(uuid, uuid, text, text\) to service_role/);
});

test("Supabase snapshot writer avoids lifecycle and score clobber columns", () => {
  const snapshotWriter = dataLayer.match(/async function writeSupabaseSnapshot[\s\S]+?\n}\n\nexport async function readDataStore/)?.[0] || "";
  assert.match(dataLayer, /function marketMutableToRow/);
  assert.match(dataLayer, /function participantMutableToRow/);
  assert.match(coreMigration, /create or replace function recompute_market_aggregate[\s\S]+from markets[\s\S]+for update/);
  assert.match(coreMigration, /count\(\*\) filter \(where par\.participant_type = 'human'\)::int/);
  assert.match(coreMigration, /par\.participant_type = 'human' and par\.role = 'builder'/);
  assert.match(snapshotWriter, /newRows\(before\.markets/);
  assert.match(snapshotWriter, /patchChangedMarketRows\(changedMarketPatches\)/);
  assert.doesNotMatch(snapshotWriter, /patchChangedRows\(\s*"markets"/);
  assert.match(snapshotWriter, /patchChangedRows\(\s*"participants"/);
  assert.match(snapshotWriter, /rpc\("recompute_market_aggregate", \{ p_market_id: marketId \}\)/);
  assert.doesNotMatch(snapshotWriter, /upsertRows\("market_aggregates"/);
  assert.match(dataLayer, /updated_at=eq\.\$\{encodeURIComponent\(item\.previous\.updatedAt\)\}/);
  assert.doesNotMatch(dataLayer.match(/function marketMutableToRow[\s\S]+?\n}/)?.[0] || "", /status|resolved_outcome_id|locked_at|resolved_at|voided_at/);
  assert.doesNotMatch(dataLayer.match(/function participantMutableToRow[\s\S]+?\n}/)?.[0] || "", /oracle_score/);
  assert.doesNotMatch(dataLayer.match(/function participantMutableToRow[\s\S]+?\n}/)?.[0] || "", /is_avatar_hidden|is_banned/);
  assert.match(dataLayer, /export async function moderateParticipantData/);
});

test("Supabase prediction transactions cover human stage moves and house agents", () => {
  assert.match(hardeningMigration, /create or replace function init_participant_session_tx/);
  assert.match(hardeningMigration, /perform pg_advisory_xact_lock\(724118991043\)/);
  assert.match(hardeningMigration, /create unique index if not exists participant_sessions_guard_key_hash_unique_idx/);
  assert.match(guardSessionRecoveryMigration, /create or replace function init_participant_session_tx\(p_event_slug text, p_guard_key_hash text default null\)/);
  assert.doesNotMatch(guardSessionRecoveryMigration, /and expires_at > v_now/);
  assert.match(guardSessionRecoveryMigration, /set expires_at = v_now \+ interval '48 hours'/);
  assert.match(guardSessionRecoveryMigration, /grant execute on function init_participant_session_tx\(text, text\) to service_role/);
  assert.match(hardeningMigration, /create or replace function ensure_house_agents_tx/);
  assert.match(hardeningMigration, /perform pg_advisory_xact_lock\(724118991044\)/);
  assert.match(hardeningMigration, /create unique index if not exists agent_profiles_event_name_idx/);
  assert.match(coreMigration, /update events[\s\S]+set stage_mode = 'live'[\s\S]+featured_market_id = p_market_id[\s\S]+stage_mode = 'join'/);
  assert.match(coreMigration, /create or replace function place_agent_prediction_tx\([\s\S]+p_participant_id uuid[\s\S]+p_amount_credits integer/);
  assert.match(coreMigration, /participant_type not in \('house_agent', 'external_agent'\)/);
  assert.match(coreMigration, /return place_prediction_tx\(v_session_id, p_market_id, p_outcome_id, p_amount_credits\)/);
  assert.match(coreMigration, /grant execute on function place_agent_prediction_tx\(uuid, uuid, uuid, integer\) to service_role/);
  assert.match(dataLayer, /const store = await readPublicMarketStoreData\(input\.marketId, sessionId\)/);
  assert.match(dataLayer, /export async function runHouseAgentData/);
  assert.match(dataLayer, /rpc<Row>\("place_agent_prediction_tx"/);
  assert.doesNotMatch(adminAgentRoute, /mutateDataStore\(\(store\) =>\s*runHouseAgent/);
  assert.doesNotMatch(externalAgentRoute, /mutateDataStore\(\(store\) =>\s*runHouseAgent/);
  assert.match(adminAgentRoute, /runHouseAgentData/);
  assert.match(externalAgentRoute, /runHouseAgentData/);
  assert.match(ensureAgentsRoute, /ensureHouseAgentsData/);
});

test("prediction placement supports request idempotency without a parallel path", () => {
  assert.match(predictionIdempotencyMigration, /add column if not exists request_id text/);
  assert.match(predictionIdempotencyMigration, /prediction_actions_request_id_unique_idx/);
  assert.match(predictionIdempotencyMigration, /on prediction_actions \(participant_id, market_id, request_id\)/);
  assert.match(predictionIdempotencyMigration, /create or replace function place_prediction_tx\([\s\S]+p_request_id text default null/);
  assert.match(predictionIdempotencyMigration, /where participant_id = v_participant\.id[\s\S]+and request_id = v_request_id/);
  assert.match(predictionIdempotencyMigration, /Idempotency key was already used for a different prediction/);
  assert.match(predictionIdempotencyMigration, /request_id,/);
  assert.match(predictionIdempotencyMigration, /grant execute on function place_prediction_tx\(uuid, uuid, uuid, integer, text\) to service_role/);
  assert.match(zeroSwitchGuardMigration, /v_position\.id is not null and v_position\.outcome_id <> p_outcome_id and v_impact_max <= 0/);
  assert.match(zeroSwitchGuardMigration, /Could not patch place_prediction_tx zero-switch impact guard/);
  assert.match(zeroSwitchGuardMigration, /grant execute on function place_prediction_tx\(uuid, uuid, uuid, integer, text\) to service_role/);
  assert.match(dataLayer, /p_request_id: input\.requestId\?\.trim\(\)\.slice\(0, 128\) \|\| null/);
  assert.match(predictRoute, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(predictRoute, /requestId: predictionRequestId\(request, body\)/);
  assert.match(predictionPanel, /"Idempotency-Key": requestId/);
  assert.doesNotMatch(dataLayer, /duplicatePrediction|parallelPrediction/);
});

test("v8 market engine migration adds blind launch signals snapshots and richer ledger rows", () => {
  assert.match(marketEngineV8Migration, /blind_launch_enabled/);
  assert.match(marketEngineV8Migration, /conviction_signal_snapshot/);
  assert.match(marketEngineV8Migration, /stage_signal_snapshot/);
  assert.match(marketEngineV8Migration, /closing_stage_signal_snapshot/);
  assert.match(marketEngineV8Migration, /balance_after/);
  assert.match(marketEngineV8Migration, /idempotency_key/);
  assert.match(marketEngineV8Migration, /create or replace function market_signal_snapshot/);
  assert.match(marketEngineV8Migration, /0\.65 \* people_signal \+ 0\.35 \* conviction_signal/);
  assert.match(marketEngineV8Migration, /v_max_share := case when v_participant\.participant_type = 'human' then 0\.15 else 0\.05 end/);
  assert.match(marketEngineV8Migration, /Finish your profile before predicting/);
  assert.match(liveHardeningMigration, /Finish your profile before predicting/);
  assert.match(hardeningMigration, /insert into ledger_entries \(participant_id, type, amount_credits, direction, balance_after, reason, metadata, created_at\)/);
  assert.match(coreMigration, /insert into ledger_entries \(participant_id, type, amount_credits, direction, balance_after, idempotency_key, reason, purchase_id, metadata\)/);
  assert.match(ledgerParityMigration, /init_participant_session_tx\(text, text\)/);
  assert.match(ledgerParityMigration, /create or replace function credit_purchase_tx\(p_purchase_id uuid, p_status text, p_ip text default null\)/);
  assert.match(ledgerParityMigration, /direction,[\s\S]+balance_after,[\s\S]+idempotency_key,[\s\S]+reason,[\s\S]+purchase_id,[\s\S]+metadata/);
  assert.match(ledgerParityMigration, /'payment_status'/);
  assert.doesNotMatch(ledgerParityMigration, /Could not patch/);
  assert.match(dataLayer, /p_blind_launch_prediction_threshold/);
  assert.match(predictRoute, /predictionPreviewData/);
  assert.match(stageView, /Odds over time/);
  assert.match(predictionPanel, /Odds over time/);
});

test("Supabase admin market create and edit flows are transactional", () => {
  assert.match(adminMarketCrudMigration, /create or replace function create_market_tx\(/);
  assert.match(adminMarketCrudMigration, /create or replace function update_market_tx\(/);
  assert.match(adminMarketCrudMigration, /perform pg_advisory_xact_lock\(724118991042\)/);
  assert.match(adminMarketCrudMigration, /select \* into v_market from markets where id = p_market_id for update/);
  assert.match(adminMarketCrudMigration, /Market changed since this form loaded/);
  assert.match(adminMarketCrudMigration, /delete from outcomes where market_id = v_market\.id/);
  assert.match(adminMarketCrudMigration, /perform recompute_market_aggregate\(v_market\.id\)/);
  assert.match(adminMarketCrudMigration, /values \('create_market', 'market'/);
  assert.match(adminMarketCrudMigration, /values \('update_market', 'market'/);
  assert.match(adminMarketCrudMigration, /revoke execute on function create_market_tx[\s\S]+from public, anon, authenticated;/);
  assert.match(adminMarketCrudMigration, /revoke execute on function update_market_tx[\s\S]+from public, anon, authenticated;/);
  assert.match(adminMarketCrudMigration, /grant execute on function create_market_tx[\s\S]+to service_role/);
  assert.match(adminMarketCrudMigration, /grant execute on function update_market_tx[\s\S]+to service_role/);
  assert.match(blindLaunchClearMigration, /p_clear_blind_launch_ended_at boolean default false/);
  assert.match(blindLaunchClearMigration, /when p_clear_blind_launch_ended_at then null/);
  assert.match(blindLaunchClearMigration, /grant execute on function update_market_tx\(uuid, timestamptz[\s\S]+boolean, text\) to service_role/);
  assert.match(marketStageFallbackMigration, /show_on_stage = case when v_market\.status = 'voided' then false/);
  assert.match(marketStageFallbackMigration, /select id into v_fallback_market_id/);
  assert.match(marketStageFallbackMigration, /and featured_market_id = v_market\.id/);
  assert.match(marketStageFallbackMigration, /stage_mode = case[\s\S]+stage_mode <> 'leaderboard' then 'join'/);
  assert.match(marketStageFallbackMigration, /grant execute on function update_market_tx\(uuid, timestamptz[\s\S]+boolean, text\) to service_role/);
  assert.match(dataLayer, /export async function createMarketData/);
  assert.match(dataLayer, /rpc<Row>\("create_market_tx"/);
  assert.match(dataLayer, /export async function updateMarketData/);
  assert.match(dataLayer, /rpc<Row>\("update_market_tx"/);
  assert.match(dataLayer, /p_clear_blind_launch_ended_at: input\.clearBlindLaunchEndedAt \|\| false/);
  assert.match(newMarketPage, /searchParams: Promise<\{ eventSlug\?: string \| string\[\] \}>/);
  assert.match(newMarketPage, /store\.events\.some\(\(event\) => event\.slug === requestedSlug\)/);
  assert.match(newMarketPage, /<MarketForm eventSlug=\{eventSlug\} \/>/);
  assert.match(marketForm, /eventSlug = DEFAULT_EVENT_SLUG/);
  assert.match(marketForm, /name="eventSlug" value=\{eventSlug\}/);
  assert.match(marketCreateRoute, /createMarketData/);
  assert.match(marketUpdateRoute, /updateMarketData/);
  assert.doesNotMatch(marketCreateRoute, /mutateDataStore/);
  assert.doesNotMatch(marketUpdateRoute, /mutateDataStore/);
});

test("Mollie payment attach and verification avoid duplicate or stale credits", () => {
  const attachHelper = dataLayer.match(/export async function attachPaymentToPurchaseData[\s\S]+?\n}\n\nexport async function creditPaidPurchaseData/)?.[0] || "";
  const creditHelper = dataLayer.match(/export async function creditPaidPurchaseData[\s\S]+?\n}\n\nexport async function verifyMcpWriteTokenData/)?.[0] || "";
  assert.match(attachHelper, /if \(useSupabaseStore\(\)\)/);
  assert.match(attachHelper, /patchRowsReturning\("purchases"/);
  assert.match(attachHelper, /mollie_payment_id/);
  assert.match(attachHelper, /checkout_url/);
  assert.match(creditHelper, /rpc<Row>\("credit_purchase_tx"/);
  assert.doesNotMatch(creditHelper, /readSupabaseStore/);
  assert.match(dataLayer, /rpc<Row>\("credit_purchase_tx"[\s\S]+p_ip: auditIp \|\| null/);
  assert.match(dataLayer, /export async function findPurchaseData/);
  assert.match(coreMigration, /create or replace function credit_purchase_tx\(p_purchase_id uuid, p_status text, p_ip text default null\)/);
  assert.match(coreMigration, /insert into admin_audit_logs \(action, entity_type, entity_id, details, ip\)/);
  assert.match(checkoutRoute, /MOLLIE_API_KEY must be configured in production test mode/);
  assert.match(checkoutRoute, /findReusablePendingPurchaseData\(session\.participant\.id\)/);
  assert.match(checkoutRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(checkoutStatusRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(checkoutRoute, /Idempotency-Key/);
  assert.match(checkoutRoute, /SAFE_COPY\.checkout/);
  assert.match(checkoutRoute, /findEventByIdData\(session\.participant\.eventId\)/);
  assert.match(checkoutRoute, /safeReturnTo\(body\.returnTo, event\.slug\)/);
  assert.match(checkoutRoute, /redirectUrl: returnUrl\(purchaseId, eventSlug, returnTo\)/);
  assert.match(checkoutRoute, /createMolliePayment\(purchase\.id, event\.slug, returnTo\)/);
  assert.doesNotMatch(checkoutRoute, /readDataStore|getSessionFromRequestData/);
  assert.match(dataLayer, /export async function findReusablePendingPurchaseData/);
  assert.match(dataLayer, /export async function findNextOpenMarketData/);
  assert.match(dataLayer, /export async function findEventByIdData/);
  assert.match(dataLayer, /await upsertRows\("purchases", \[purchaseToRow\(purchase\)\], "id"\)/);
  assert.doesNotMatch(checkoutRoute, /NEXT_PUBLIC_EVENT_SLUG/);
  assert.match(eventPage, /const sessionParticipantId = session\?\.participant\.id/);
  assert.match(eventPage, /findParticipantPurchaseData\(sessionParticipantId, checkout\)/);
  assert.match(eventPage, /verifyAndCreditPurchase\(existing\)/);
  assert.match(eventPage, /readParticipantLedgerEntriesData\(session\.participant\.id, 8\)/);
  assert.match(eventPage, /MegaBuck history/);
  assert.match(dataLayer, /export async function readParticipantLedgerEntriesData/);
  assert.match(webhookRoute, /const redirectToEvent = String\(payload\.redirectToEvent \|\| ""\) === "1"/);
  assert.match(webhookRoute, /if \(redirectToEvent\)/);
  assert.match(checkoutStatusRoute, /getSessionParticipantData\(getParticipantSessionIdFromRequest\(request\)\)/);
  assert.match(checkoutStatusRoute, /findParticipantPurchaseData\(session\.participant\.id, purchaseId\)/);
  assert.match(checkoutStatusRoute, /verifyAndCreditPurchase\(purchase\)/);
  assert.doesNotMatch(paymentsHelper, /readDataStore/);
  assert.match(localCheckoutPage, /name="redirectToEvent" value="1"/);
  assert.match(localCheckoutPage, /name="returnTo" value=\{returnTo\}/);
  assert.match(webhookRoute, /safeReturnTo\(payload\.returnTo/);
  assert.match(paymentsHelper, /assertMolliePaymentMatchesPurchase/);
  assert.match(paymentsHelper, /attachPaymentToPurchaseData/);
  assert.match(paymentsHelper, /input\.startsWith\("tr_"\)/);
  assert.match(paymentsHelper, /data\.metadata\?\.purchaseId/);
  assert.match(paymentsHelper, /data\.metadata\?\.purchaseId !== purchase\.id/);
  assert.match(paymentsHelper, /String\(data\.amount\?\.value \|\| ""\) !== expectedAmount\(purchase\.amountEur\)/);
  assert.match(paymentsHelper, /data\.amount\?\.currency !== purchase\.currency/);
  assert.match(paymentsHelper, /status === "failed" \|\| status === "expired"/);
});

test("stage resolution fallback selects resolved markets only", () => {
  assert.match(stageResolutionFallbackMigration, /p_stage_mode <> 'resolution' or status = 'resolved'/);
  assert.match(stageResolutionFallbackMigration, /p_stage_mode = 'resolution' and v_market\.status <> 'resolved'/);
  assert.match(stageResolutionFallbackMigration, /Resolution reveal needs a resolved stage-visible market/);
  assert.match(stageRoute, /featuredMarketId: mode === "resolution" \? undefined : featuredMarketId \|\| undefined/);
  assert.match(dataLayer, /input\.stageMode === "resolution"/);
  assert.match(dataLayer, /candidate\.status === "resolved"/);
});

test("Supabase signal snapshots keep agents out of default room signal", () => {
  assert.match(humanRoomSignalMigration, /create or replace function market_signal_snapshot\(p_market_id uuid\)/);
  assert.match(humanRoomSignalMigration, /par\.participant_type = 'human'/);
  assert.match(humanRoomSignalMigration, /sum\(p\.signal_credits\)/);
  assert.match(humanRoomSignalMigration, /grant execute on function market_signal_snapshot\(uuid\) to service_role/);
});

test("admin API route handlers verify the admin session cookie directly", () => {
  for (const file of adminRouteFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /requireAdminRequest/);
    assert.match(source, /const unauthorized = await requireAdminRequest\(request\)/);
    assert.match(source, /if \(unauthorized\) return unauthorized/);
  }
  assert.match(adminLoginRoute, /LOGIN_ATTEMPT_COOKIE/);
  assert.match(adminLoginRoute, /attemptCookieKey/);
  assert.match(adminLoginRoute, /platformIpKey/);
  assert.match(adminLoginRoute, /throttles\.some/);
});

test("admin market edits guard against stale stage or lifecycle forms", () => {
  assert.match(marketForm, /name="updatedAt"/);
  assert.match(marketForm, /name="fairLaunchPeopleThreshold"/);
  assert.match(marketForm, /name="fairLaunchSignalCreditsThreshold"/);
  assert.match(marketCreateRoute, /fairLaunchPeopleThreshold/);
  assert.match(marketCreateRoute, /fairLaunchSignalCreditsThreshold/);
  assert.match(marketUpdateRoute, /fairLaunchPeopleThreshold/);
  assert.match(marketUpdateRoute, /fairLaunchSignalCreditsThreshold/);
  assert.match(marketCreateRoute, /createMarketData/);
  assert.match(marketUpdateRoute, /updateMarketData/);
  assert.match(dataLayer, /freshMarket\.updatedAt !== expectedUpdatedAt/);
  assert.match(marketUpdateRoute, /Market changed since this form loaded/);
  assert.match(marketPage, /disabled=\{market\.status !== "draft"\}/);
  assert.match(marketPage, /market\.status === "locked"/);
  assert.match(marketPage, /action="feature"[\s\S]+disabled=\{market\.status === "draft" \|\| market\.status === "voided"\}/);
  assert.match(marketPage, /Lock this market before resolving it/);
  assert.match(marketPage, /const virtualProvisionCredits = market\.status === "voided"/);
  assert.match(marketPage, /store\.positions/);
  assert.match(marketUpdateRoute, /showOnStage: existing\.status !== "voided" && form\.get\("showOnStage"\) === "on"/);
  assert.match(dataLayer, /Only non-voided public markets can be featured on stage/);
  assert.doesNotMatch(marketPage, /const virtualProvisionCredits = store\.predictionActions/);
  assert.match(stageView, /people in/);
  assert.match(stageView, /item\.status !== "voided" && item\.showOnStage/);
  assert.match(stageView, /Predictions and MegaBuck top-ups are temporarily paused by the organizer/);
  assert.match(stageView, /if \(!publicStateResponse\.ok \|\| !leaderboardResponse\.ok\) return/);
  assert.match(stageView, /if \(!publicState\?\.event \|\| !Array\.isArray\(publicState\.markets\) \|\| !Array\.isArray\(leaderboard\?\.leaderboard\)\) return/);
  assert.match(stageView, /showAgentLayer \? `Humans \$\{pct\(outcome\.humanSignal\)\}` : `Room \$\{pct\(outcome\.stageSignal\)\}`/);
  assert.match(stageView, /Compare Humans\/Agents/);
  assert.match(stageView, /outcome\.combinedSignal/);
  assert.match(stageView, /lastSignalSignature/);
  assert.match(stageView, /stage-pulse-even/);
  assert.match(eventAdminPage, /status !== "voided"/);
  assert.match(eventAdminPage, /No stage-visible markets/);
  assert.match(eventAdminPage, /\/admin\/markets\/new\?eventSlug=\$\{encodeURIComponent\(slug\)\}/);
  assert.match(eventAdminPage, /\{market\.title\} \(\{market\.status\}\)/);
  assert.match(predictionPanel, /const isZeroMegaBuckSwitch = isSwitch && amountValue === 0/);
  assert.match(predictionPanel, /postCooldownAllowedAdd/);
  assert.match(predictionPanel, /Whale Guard cap after cooldown/);
  assert.match(predictionPanel, /amountExceedsAllowed \|\| amountExceedsPostCooldown \|\| previewBlocksSubmit \|\| emergencyPaused/);
  assert.match(predictionPanel, /const previewBlocksSubmit = Boolean\(preview\?\.blocked\)/);
  assert.match(predictionPanel, /Max allowed now/);
  assert.match(predictionPanel, /disabled=\{!selectedAllowed \|\| selectedAllowed\.allowedAdd <= 0\}/);
  assert.match(featureStageGuardMigration, /v_market\.status in \('draft', 'voided'\)/);
});

test("public pages expose role boards and market hero imagery", () => {
  for (const title of ["Builders", "Sponsors", "Investors", "Other", "Early callers", "Contrarian calls"]) {
    assert.match(eventPage, new RegExp(`title="${title}"`));
  }
  assert.match(stageView, /StageBoard title="Builders"/);
  assert.match(stageView, /StageBoard title="Sponsors"/);
  assert.match(stageView, /StageBoard title="Investors"/);
  assert.match(eventPage, /PublicEventLive/);
  assert.match(eventPage, /Predictions are paused/);
  assert.match(eventPage, /nextOpenMarket \? `\/m\/\$\{nextOpenMarket\.id\}` : `\/e\/\$\{slug\}`/);
  assert.match(publicEventLive, /state\.markets\.map/);
  assert.match(publicEventLive, /Markets are loading/);
  assert.match(publicEventLive, /Predictions paused/);
  assert.match(publicMarketPage, /state\.imageUrl/);
  assert.match(publicMarketPage, /item\.id === marketId && item\.status !== "draft" && item\.status !== "voided"/);
  assert.match(predictRoute, /item\.id === id && item\.status !== "draft" && item\.status !== "voided"/);
  assert.match(predictionPanel, /router\.replace\(`\/e\/\$\{eventSlug\}`\)/);
  assert.match(publicMarketPage, /initialEmergencyPaused=\{Boolean\(event\?\.emergencyPaused\)\}/);
  assert.match(publicMarketPage, /<img src=\{state\.imageUrl\}/);
});

test("admin control surfaces avoid GET writes and expose proof/control affordances", () => {
  assert.doesNotMatch(agentsPage, /mutateDataStore/);
  assert.match(agentsPage, /Initialize house agents/);
  assert.match(agentsPage, /McpTokenForm/);
  assert.match(mcpTokenForm, /\/api\/admin\/mcp-tokens/);
  assert.match(mcpTokenRoute, /createMcpWriteTokenData/);
  assert.doesNotMatch(mcpTokenForm, /localStorage|sessionStorage/);
  assert.doesNotMatch(mcpTokenRoute, /searchParams\.set\("mcpToken"/);
  assert.match(ensureAgentsRoute, /ensureHouseAgentsData/);
  assert.match(eventAdminPage, /Control room/);
  assert.match(eventAdminPage, /Stage quick controls/);
  assert.match(eventAdminPage, /AdminLiveRefresh/);
  assert.match(eventAdminPage, /name="returnTo" value=\{`\/admin\/events\/\$\{slug\}`\}/);
  assert.match(adminStagePage, /name="returnTo" value="\/admin\/stage"/);
  assert.match(eventAdminPage, /\/admin\/markets\/new\?eventSlug=\$\{encodeURIComponent\(slug\)\}/);
  assert.match(stageRoute, /safeAdminReturnPath/);
  assert.match(stageRoute, /return Response\.redirect\(new URL\(returnTo, request\.url\), 303\)/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_REPO_URL/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_POSTS_URL/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_DEMO_URL/);
  assert.match(buildPage, /\/build\/demo/);
  assert.match(buildDemoPage, /Live demo script/);
  assert.match(buildDemoPage, /Resolve and score/);
  assert.match(buildPage, /Checkout screenshot/);
  assert.match(buildPage, /Stage screenshot/);
  assert.match(middleware, /sameOriginAdminMutation/);
  assert.match(middleware, /return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
  assert.match(dataLayer, /process\.env\.NODE_ENV !== "production" && verifyBearerToken/);
  assert.match(mcpRoute, /market\.status === "open" && \(!session \|\| market\.eventId === session\.participant\.eventId\)/);
  assert.match(mcpRoute, /visibleOpenMarkets\.find\(\(item\) => item\.id === body\.marketId\)/);
});

test("public readiness is redacted and admin login throttle fails closed in production", () => {
  assert.match(publicReadinessRoute, /readPublicStateData/);
  assert.match(publicReadinessRoute, /buildPublicReadinessReport/);
  assert.match(publicReadinessRoute, /counts: \{ pass: 0, warn: 0, fail: 1 \}/);
  assert.doesNotMatch(publicReadinessRoute, /readDataStore/);
  assert.doesNotMatch(publicReadinessRoute, /buildReadinessReportWithLiveChecks/);
  assert.match(publicReadinessRoute, /ready: report\.ready/);
  assert.match(publicReadinessRoute, /counts: report\.counts/);
  assert.doesNotMatch(publicReadinessRoute, /groups: report\.groups/);
  assert.doesNotMatch(publicReadinessRoute, /details/);
  assert.match(adminLoginRoute, /Admin login throttle is unavailable/);
  assert.match(dataLayer, /process\.env\.NODE_ENV === "production"/);
  assert.match(dataLayer, /throw error/);
  assert.match(joinForm, /const initResponse = await fetch\("\/api\/session\/init"/);
  assert.match(joinForm, /if \(!initResponse\.ok\) throw new Error/);
});

test("P2 report and media surfaces are wired without external runtime dependencies", () => {
  assert.match(adminNav, /\/admin\/report/);
  assert.match(adminReportPage, /buildAdvancedAnalyticsReport/);
  assert.match(adminReportPage, /Cala context enrichment/);
  assert.match(adminReportPage, /PixVerse promo briefs/);
  assert.match(adminReportPage, /format=csv/);
  assert.match(adminReportPage, /format=cala/);
  assert.match(adminReportPage, /format=pixverse/);
  assert.match(adminReportRoute, /analyticsReportRows/);
  assert.match(adminReportRoute, /format === "cala"/);
  assert.match(adminReportRoute, /format === "pixverse"/);
  assert.match(analyticsHelper, /export function buildAdvancedAnalyticsReport/);
  assert.match(analyticsHelper, /calaContextPacks/);
  assert.match(analyticsHelper, /pixVersePromoBriefs/);
  assert.match(receiptPage, /I called it/);
  assert.match(receiptPage, /You saw it first/);
  assert.match(receiptPage, /\/receipt\/\$\{id\}\/promo/);
  assert.match(receiptPage, /readReceiptStoreData\(id\)/);
  assert.match(receiptPage, /store\.events\.find/);
  assert.match(receiptPage, /href=\{`\/e\/\$\{eventSlug\}`\}/);
  assert.doesNotMatch(receiptPage, /readDataStore/);
  assert.match(predictionPanel, /Share your "I called it" receipt/);
  assert.match(receiptPromoPage, /buildReceiptPromo/);
  assert.match(receiptPromoPage, /readReceiptStoreData\(id\)/);
  assert.match(receiptPromoPage, /href=\{`\/e\/\$\{eventSlug\}`\}/);
  assert.doesNotMatch(receiptPromoPage, /readDataStore/);
  assert.match(receiptPromoPage, /promo-frame/);
  assert.match(promoHelper, /pixVersePrompt/);
});

test("proof and optional integration environment hooks are documented", () => {
  for (const key of [
    "NEXT_PUBLIC_PROOF_REPO_URL",
    "NEXT_PUBLIC_PROOF_POSTS_URL",
    "NEXT_PUBLIC_PROOF_DEMO_URL",
    "NEXT_PUBLIC_PROOF_CHECKOUT_URL",
    "NEXT_PUBLIC_PROOF_ADMIN_URL",
    "NEXT_PUBLIC_PROOF_STAGE_URL",
    "MOLLIE_READINESS_PAYMENT_ID",
    "MOLLIE_PROFILE_ID",
    "MOLLIE_TESTMODE_ONLY",
    "APP_URL",
    "WEBHOOK_BASE_URL",
    "CALA_CONTEXT_WEBHOOK_URL",
    "PIXVERSE_API_KEY"
  ]) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  }
});
