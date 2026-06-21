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
const stageResolutionFeatureGuardMigration = fs.readFileSync("supabase/migrations/029_stage_resolution_feature_guard.sql", "utf8");
const stageLiveStatusGuardMigration = fs.readFileSync("supabase/migrations/030_stage_live_market_status_guard.sql", "utf8");
const stageSafeFallbackMigration = fs.readFileSync("supabase/migrations/031_stage_mode_safe_fallbacks.sql", "utf8");
const platformSignalPriorsMigration = fs.readFileSync("supabase/migrations/032_platform_signal_priors.sql", "utf8");
const finalHardeningMigration = fs.readFileSync("supabase/migrations/033_live_event_final_hardening.sql", "utf8");
const predictionSerializationMigration = fs.readFileSync("supabase/migrations/034_prediction_serialization_readiness.sql", "utf8");
const profileIdentityMigration = fs.readFileSync("supabase/migrations/035_email_unique_names_no_roles.sql", "utf8");
const eventSwitcherMigration = fs.readFileSync("supabase/migrations/036_admin_event_switcher_seed_events.sql", "utf8");
const repurposedRoleMarketMigration = fs.readFileSync("supabase/migrations/037_repurpose_role_battle_seed_market.sql", "utf8");
const neutralHouseAgentMigration = fs.readFileSync("supabase/migrations/038_neutral_house_agent_names.sql", "utf8");
const ensureEventRoomsMigration = fs.readFileSync("supabase/migrations/039_ensure_megathon_testingmiki_events.sql", "utf8");
const stageModeCleanupMigration = fs.readFileSync("supabase/migrations/040_remove_role_battle_stage_mode.sql", "utf8");
const roomMarketSeedMigration = fs.readFileSync("supabase/migrations/041_seed_megathon_testingmiki_markets.sql", "utf8");
const checkoutReturnPathMigration = fs.readFileSync("supabase/migrations/042_checkout_return_path_scope.sql", "utf8");
const participantModerationMigration = fs.readFileSync("supabase/migrations/043_participant_moderation_tx.sql", "utf8");
const currentPurchaseReadinessMigration = fs.readFileSync("supabase/migrations/044_readiness_contract_current_purchase_rpc.sql", "utf8");
const participantUniqueEmailMigration = fs.readFileSync("supabase/migrations/045_participant_unique_email.sql", "utf8");
const privateAggregatesMigration = fs.readFileSync("supabase/migrations/046_private_market_aggregates.sql", "utf8");
const platformProvisionMigration = fs.readFileSync("supabase/migrations/047_platform_provision_account.sql", "utf8");
const hotPathIndexMigration = fs.readFileSync("supabase/migrations/048_hot_path_indexes.sql", "utf8");
const constantsLayer = fs.readFileSync("src/lib/constants.ts", "utf8");
const storeLayer = fs.readFileSync("src/lib/store.ts", "utf8");
const dataLayer = fs.readFileSync("src/lib/data.ts", "utf8");
const typeLayer = fs.readFileSync("src/lib/types.ts", "utf8");
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
const receiptPage = fs.readFileSync("app/receipt/[id]/page.tsx", "utf8");
const receiptPromoPage = fs.readFileSync("app/receipt/[id]/promo/page.tsx", "utf8");
const shareReceiptButton = fs.readFileSync("components/share-receipt-button.tsx", "utf8");
const publicStateRoute = fs.readFileSync("app/api/events/[slug]/public-state/route.ts", "utf8");
const publicLeaderboardRoute = fs.readFileSync("app/api/leaderboard/[eventSlug]/route.ts", "utf8");
const predictRoute = fs.readFileSync("app/api/markets/[id]/predict/route.ts", "utf8");
const initRoute = fs.readFileSync("app/api/session/init/route.ts", "utf8");
const dashboardPage = fs.readFileSync("app/admin/page.tsx", "utf8");
const stagePage = fs.readFileSync("app/stage/[eventSlug]/page.tsx", "utf8");
const adminStagePage = fs.readFileSync("app/admin/stage/page.tsx", "utf8");
const stageView = fs.readFileSync("components/stage-view.tsx", "utf8");
const qrCodeComponent = fs.readFileSync("components/qr-code.tsx", "utf8");
const stageRoute = fs.readFileSync("app/api/admin/stage/route.ts", "utf8");
const httpHelper = fs.readFileSync("src/lib/http.ts", "utf8");
const adminLoginPage = fs.readFileSync("app/admin/login/page.tsx", "utf8");
const participantsPage = fs.readFileSync("app/admin/participants/page.tsx", "utf8");
const participantsRoute = fs.readFileSync("app/api/admin/participants/route.ts", "utf8");
const paymentsPage = fs.readFileSync("app/admin/payments/page.tsx", "utf8");
const paymentsRoute = fs.readFileSync("app/api/admin/payments/route.ts", "utf8");
const agentEnsureRoute = fs.readFileSync("app/api/admin/agents/ensure/route.ts", "utf8");
const agentRunRoute = fs.readFileSync("app/api/admin/agents/run-house-agent/route.ts", "utf8");
const middleware = fs.readFileSync("middleware.ts", "utf8");
const adminNav = fs.readFileSync("components/admin-nav.tsx", "utf8");
const agentsPage = fs.readFileSync("app/admin/agents/page.tsx", "utf8");
const mcpTokenForm = fs.readFileSync("components/mcp-token-form.tsx", "utf8");
const mcpTokenRoute = fs.readFileSync("app/api/admin/mcp-tokens/route.ts", "utf8");
const ensureAgentsRoute = fs.readFileSync("app/api/admin/agents/ensure/route.ts", "utf8");
const eventAdminPage = fs.readFileSync("app/admin/events/[slug]/page.tsx", "utf8");
const eventsAdminPage = fs.readFileSync("app/admin/events/page.tsx", "utf8");
const adminEventsRoute = fs.readFileSync("app/api/admin/events/route.ts", "utf8");
const adminMarketPage = fs.readFileSync("app/admin/markets/[id]/page.tsx", "utf8");
const adminEventSwitcher = fs.readFileSync("components/admin-event-switcher.tsx", "utf8");
const adminReportPage = fs.readFileSync("app/admin/report/page.tsx", "utf8");
const adminReportRoute = fs.readFileSync("app/api/admin/report/route.ts", "utf8");
const adminAuditPage = fs.readFileSync("app/admin/audit/page.tsx", "utf8");
const adminAuditRoute = fs.readFileSync("app/api/admin/audit/route.ts", "utf8");
const auditHelper = fs.readFileSync("src/lib/audit.ts", "utf8");
const buildPage = fs.readFileSync("app/build/page.tsx", "utf8");
const buildDemoPage = fs.readFileSync("app/build/demo/page.tsx", "utf8");
const predictionPanel = fs.readFileSync("components/prediction-panel.tsx", "utf8");
const checkoutButton = fs.readFileSync("components/checkout-button.tsx", "utf8");
const joinForm = fs.readFileSync("components/join-form.tsx", "utf8");
const profileRoute = fs.readFileSync("app/api/session/profile/route.ts", "utf8");
const analyticsHelper = fs.readFileSync("src/lib/analytics.ts", "utf8");
const promoHelper = fs.readFileSync("src/lib/promo.ts", "utf8");
const envExample = fs.readFileSync(".env.example", "utf8");
const adminAgentRoute = fs.readFileSync("app/api/admin/agents/run-house-agent/route.ts", "utf8");
const externalAgentRoute = fs.readFileSync("app/api/agents/run-house-agent/route.ts", "utf8");
const adminVoidRoute = fs.readFileSync("app/api/admin/markets/[id]/void/route.ts", "utf8");
const checkoutRoute = fs.readFileSync("app/api/payments/mollie/create-test-checkout/route.ts", "utf8");
const checkoutStatusRoute = fs.readFileSync("app/api/payments/mollie/status/route.ts", "utf8");
const webhookRoute = fs.readFileSync("app/api/payments/mollie/webhook/route.ts", "utf8");
const localCheckoutPage = fs.readFileSync("app/checkout/test/[purchaseId]/page.tsx", "utf8");
const paymentsHelper = fs.readFileSync("src/lib/payments.ts", "utf8");
const publicReadinessRoute = fs.readFileSync("app/api/readiness/route.ts", "utf8");
const adminLoginRoute = fs.readFileSync("app/api/admin/login/route.ts", "utf8");
const mcpRoute = fs.readFileSync("app/mcp/route.ts", "utf8");
const safePathsHelper = fs.readFileSync("src/lib/safe-paths.ts", "utf8");

const adminRouteFiles = [
  "app/api/admin/agents/ensure/route.ts",
  "app/api/admin/agents/run-house-agent/route.ts",
  "app/api/admin/audit/route.ts",
  "app/api/admin/events/route.ts",
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
  assert.match(leaderboardParityMigration, /create or replace function public_leaderboard_tx\(p_event_slug text\)/);
  assert.match(leaderboardParityMigration, /stage_signal_snapshot ->> resolved_outcome_id::text/);
  assert.doesNotMatch(leaderboardParityMigration, /pg_get_functiondef|Could not patch/);
  assert.match(publicLeaderboardMigration, /revoke execute on function public_leaderboard_tx\(text\) from public, anon, authenticated;/);
  assert.match(privateAggregatesMigration, /drop policy if exists public_read_market_aggregates on market_aggregates/);
  assert.match(privateAggregatesMigration, /revoke all privileges on table market_aggregates from public, anon, authenticated/);
  assert.match(privateAggregatesMigration, /alter publication supabase_realtime drop table public\.market_aggregates/);
  assert.match(privateAggregatesMigration, /'marketAggregatesPrivate', v_market_aggregates_private/);
  assert.match(privateAggregatesMigration, /'marketAggregatesNotRealtime', v_market_aggregates_not_realtime/);
  assert.match(privateAggregatesMigration, /'contractVersion', '046_private_market_aggregates'/);
  assert.match(seedRepairMigration, /where id = '00000000-0000-4000-8000-000000000103'/);
  assert.match(seedRepairMigration, /status = 'open'/);
  assert.match(repurposedRoleMarketMigration, /where id = '00000000-0000-4000-8000-000000000103'/);
  assert.match(repurposedRoleMarketMigration, /Which moment gets the loudest reaction\?/);
  assert.match(repurposedRoleMarketMigration, /status = 'open'/);
  assert.match(repurposedRoleMarketMigration, /show_on_stage = false/);
  assert.match(repurposedRoleMarketMigration, /Winner reveal/);
  assert.match(repurposedRoleMarketMigration, /'contractVersion', '037_repurpose_role_battle_seed_market'/);
  assert.match(repurposedRoleMarketMigration, /'repurposedSeedMarket', repurposed_seed_market/);
  assert.match(neutralHouseAgentMigration, /Signal Scout/);
  assert.match(neutralHouseAgentMigration, /Momentum Scout/);
  assert.match(neutralHouseAgentMigration, /Value Scout/);
  assert.match(neutralHouseAgentMigration, /'contractVersion', '038_neutral_house_agent_names'/);
  assert.match(neutralHouseAgentMigration, /'neutralHouseAgentNames', neutral_house_agent_names/);
  assert.match(storeLayer, /id: SEED_IDS\.markets\.role,[\s\S]+status: "open"/);
  assert.match(dataLayer, /rpc<Row\[]>\("public_leaderboard_tx"/);
  assert.match(eventPage, /readPublicStateData\(slug\)/);
  assert.match(eventPage, /readLeaderboardGroupsData\(slug\)/);
  assert.match(eventPage, /getSessionParticipantData\(sessionId\)/);
  assert.match(eventPage, /findEventBySlugData\(slug\)/);
  assert.match(eventPage, /session\?\.participant\.eventId !== event\.id/);
  assert.match(eventPage, /hasCompletedProfile\(session\?\.participant\)/);
  assert.match(joinPage, /findEventBySlugData\(eventSlug\)/);
  assert.match(joinPage, /PublicMissingLink/);
  assert.match(eventPage, /PublicMissingLink/);
  assert.match(publicMarketPage, /PublicMissingLink/);
  assert.doesNotMatch(eventPage, /readDataStore|readPublicEventStoreData|leaderboardGroups\(|publicState\(|getSessionParticipant\(/);
  assert.match(publicMarketPage, /item\.id === marketId && item\.status !== "draft"/);
  assert.match(publicMarketPage, /readPublicMarketStoreData\(marketId, sessionId\)/);
  assert.match(publicMarketPage, /findMarketEventSlugData\(marketId\)/);
  assert.match(publicMarketPage, /href=\{`\/e\/\$\{recoveryEventSlug \|\| DEFAULT_EVENT_SLUG\}`\}/);
  assert.match(dataLayer, /export async function findMarketEventSlugData\(marketId: string\)/);
  assert.match(dataLayer, /store\.markets\.find\(\(item\) => item\.id === marketId\)/);
  assert.match(dataLayer, /select=event_id,events\(slug\)/);
  assert.match(publicMarketPage, /const initialMarket = store\.markets\.find/);
  assert.match(publicMarketPage, /let market = initialMarket/);
  assert.match(publicMarketPage, /store = await readPublicMarketStoreData\(marketId, sessionId\);[\s\S]+const refreshedMarket = store\.markets\.find/);
  assert.match(publicMarketPage, /market = refreshedMarket/);
  assert.match(publicMarketPage, /hasCompletedProfile\(session\?\.participant\)/);
  assert.match(publicMarketPage, /session\?\.participant\.eventId !== market\.eventId/);
  assert.doesNotMatch(publicMarketPage, /readDataStore|readPublicEventStoreData/);
  assert.match(stagePage, /readPublicStateData\(slug\)/);
  assert.match(stagePage, /readLeaderboardGroupsData\(slug\)/);
  assert.match(stagePage, /async function loadStageData\(slug: string\)/);
  assert.match(stagePage, /function isUnknownEventError\(error: unknown\)/);
  assert.doesNotMatch(stagePage, /loadStageData\(DEFAULT_EVENT_SLUG\)/);
  assert.match(stagePage, /Stage room not found/);
  assert.match(stagePage, /stageJoinUrl\(slug\)/);
  assert.doesNotMatch(stagePage, /recoverySlug/);
  assert.doesNotMatch(stagePage, /roleWinners|readDataStore|readPublicEventStoreData|leaderboardGroups\(|roleWinnerLabel/);
  assert.match(publicLeaderboardRoute, /readLeaderboardGroupsData\(eventSlug\)/);
  assert.match(publicLeaderboardRoute, /"Cache-Control": "public, s-maxage=1, stale-while-revalidate=5"/);
  assert.doesNotMatch(publicLeaderboardRoute, /readDataStore|readPublicEventStoreData|leaderboardGroups\(/);
  assert.match(predictRoute, /export const maxDuration = 60/);
  assert.match(typeLayer, /export type PublicParticipant = Omit<Participant, "role" \| "email">/);
  assert.doesNotMatch(typeLayer, /interface LeaderboardRow[\s\S]+role: Role/);
  assert.match(dataLayer, /roleBattleStageModeRemoved: true/);
  assert.doesNotMatch(predictRoute, /getSessionParticipantData/);
  assert.match(predictRoute, /const sessionId = getParticipantSessionIdFromRequest\(request\)/);
  assert.match(predictRoute, /placePredictionData\(sessionId/);
  assert.match(predictRoute, /readPublicMarketStoreData\(id, sessionId\)/);
  assert.match(predictRoute, /hasCompletedProfile\(session\?\.participant\)/);
  assert.doesNotMatch(predictRoute, /readDataStore/);
  assert.match(profileRoute, /getSessionParticipantData\(getParticipantSessionIdFromRequest\(request\)\)/);
  assert.match(profileRoute, /Enter a stage name before joining/);
  assert.match(profileRoute, /findNextOpenMarketData\(session\.participant\.eventId\)/);
  assert.doesNotMatch(profileRoute, /readDataStore|getSessionFromRequestData/);
  assert.match(initRoute, /try \{/);
  assert.match(initRoute, /profileComplete/);
  assert.match(initRoute, /findNextOpenMarketData\(result\.participant\.eventId\)/);
  assert.match(initRoute, /Could not start this event session\./);
  assert.match(publicStateRoute, /readPublicStateData\(slug\)/);
  assert.match(publicStateRoute, /badRequest\("Event not found\.", 404\)/);
  assert.match(dataLayer, /export async function readPublicStateData/);
  assert.match(dataLayer, /export async function readReceiptStoreData/);
  assert.match(dataLayer, /const participantId = directAction\?\.participantId \|\| receiptId/);
  assert.match(dataLayer, /select=id&event_id=eq/);
  assert.match(dataLayer, /if \(!isUuid\(receiptId\)\) return emptyDataStore\(\)/);
  assert.match(dataLayer, /async function readSupabasePublicState/);
  assert.match(dataLayer, /publicState\(scopedPublicEventStore\(await readStore\(\), eventSlug\), eventSlug\)/);
  assert.match(dataLayer, /selectRows\("markets", `select=\*&event_id=eq\.\$\{encodeURIComponent\(event\.id\)\}&status=not\.in\.\(draft,voided\)`\)/);
  assert.match(dataLayer, /source\.markets\.filter\(\(market\) => market\.eventId === event\.id && market\.status !== "draft" && market\.status !== "voided"\)/);
  assert.match(dataLayer, /source\.markets\.find\(\(item\) => item\.id === marketId && item\.status !== "draft" && item\.status !== "voided"\)/);
  assert.match(dataLayer, /selectRows\("outcomes", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.match(dataLayer, /selectRows\("market_aggregates", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.match(dataLayer, /selectRows\("prediction_actions", `select=\*&market_id=in\.\(\$\{marketIds\.join\(","\)\}\)`\)/);
  assert.doesNotMatch(publicStateRoute, /readDataStore/);
});

test("platform provision migration creates one platform account and settles net pools", () => {
  assert.match(platformProvisionMigration, /participants_participant_type_check[\s\S]+platform/);
  assert.match(platformProvisionMigration, /ledger_entries_type_check[\s\S]+platform_provision/);
  assert.match(platformProvisionMigration, /participants_platform_main_account_idx/);
  assert.match(platformProvisionMigration, /one_platform_provision_per_market/);
  assert.match(platformProvisionMigration, /'vota\.wtf Platform'/);
  assert.match(platformProvisionMigration, /create or replace function market_guard_aggregate\(p_market_id uuid, p_humans_only boolean default false\)/);
  assert.match(platformProvisionMigration, /create or replace function recompute_market_aggregate\(p_market_id uuid\)/);
  assert.match(platformProvisionMigration, /par\.participant_type in \('house_agent', 'external_agent'\)/);
  assert.doesNotMatch(platformProvisionMigration, /participant_type <> 'human'/);
  assert.match(platformProvisionMigration, /p\.participant_type <> 'platform'/);
  assert.match(platformProvisionMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null\)/);
  assert.match(platformProvisionMigration, /v_net_winning_pool/);
  assert.match(platformProvisionMigration, /v_net_losing_pool/);
  assert.match(platformProvisionMigration, /v_platform_provision/);
  assert.match(platformProvisionMigration, /greatest\(raw_credits - fee_credits, 0\)/);
  assert.match(platformProvisionMigration, /v_payout := v_stake_returned \+ v_pool_share/);
  assert.match(platformProvisionMigration, /'stakeProvision', v_position\.fee_credits/);
  assert.match(platformProvisionMigration, /'platform_provision'/);
  assert.match(platformProvisionMigration, /on conflict \(market_id\) where type = 'platform_provision' and market_id is not null do nothing/);
  assert.match(platformProvisionMigration, /'platformProvisionCredits', v_platform_provision/);
  assert.match(platformProvisionMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v046/);
  assert.match(platformProvisionMigration, /'contractVersion', '047_platform_provision_account'/);
  assert.match(platformProvisionMigration, /'platformParticipantType', v_participant_type_platform/);
  assert.match(platformProvisionMigration, /'platformProvisionLedgerType', v_ledger_type_platform_provision/);
  assert.match(platformProvisionMigration, /'platformMainAccount', v_platform_main_account/);
  assert.match(platformProvisionMigration, /'platformProvisionSettlement', v_platform_provision_settlement/);
  assert.match(platformProvisionMigration, /grant execute on function resolve_market_tx\(uuid, uuid, text, text\) to service_role/);
  assert.match(typeLayer, /ParticipantType = "human" \| "house_agent" \| "external_agent" \| "platform"/);
  assert.match(typeLayer, /"platform_provision"/);
  assert.match(storeLayer, /ensurePlatformAccount/);
  assert.match(storeLayer, /platformProvisionCredits/);
  assert.match(storeLayer, /entry\.type === "platform_provision"/);
  assert.match(hotPathIndexMigration, /create index if not exists positions_market_signal_idx/);
  assert.match(hotPathIndexMigration, /on positions \(market_id, outcome_id\)/);
  assert.match(hotPathIndexMigration, /include \(participant_id, signal_credits, raw_credits\)/);
  assert.match(hotPathIndexMigration, /create index if not exists prediction_actions_market_created_idx/);
  assert.match(hotPathIndexMigration, /on prediction_actions \(market_id, created_at\)/);
  assert.match(hotPathIndexMigration, /create index if not exists participant_sessions_participant_active_idx/);
  assert.match(hotPathIndexMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v047/);
  assert.match(hotPathIndexMigration, /'contractVersion', '048_hot_path_indexes'/);
  assert.match(hotPathIndexMigration, /'positionsMarketSignalIndex', v_positions_market_signal_index/);
  assert.match(hotPathIndexMigration, /'predictionActionsMarketCreatedIndex', v_prediction_actions_market_created_index/);
  assert.match(hotPathIndexMigration, /'participantSessionsParticipantActiveIndex', v_participant_sessions_participant_active_index/);
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
  const predictionPanel = fs.readFileSync("components/prediction-panel.tsx", "utf8");
  assert.doesNotMatch(`${joinForm}\n${predictionPanel}`, /event: any|React\.FormEvent/);
  assert.match(joinPage, /scopedParticipantNextPathData\(firstSearchParam\(search\.next\), eventSlug\)/);
  assert.match(joinForm, /safeParticipantNextPath\(nextPath\)/);
  assert.match(safePathsHelper, /trimmed\.startsWith\("\/\/"\)/);
  assert.ok(safePathsHelper.includes('trimmed.includes("\\\\")'));
  assert.match(safePathsHelper, /\/%5c\/i/);
  assert.match(safePathsHelper, /url\.origin !== LOCAL_ORIGIN/);
  assert.match(safePathsHelper, /safeAdminNextPath/);
  assert.match(safePathsHelper, /safeCheckoutReturnPath/);
  assert.match(safePathsHelper, /safeCheckoutReturnPath[\s\S]+!isAdminPath\(pathname\) && !isApiPath\(pathname\)/);
  assert.match(adminLoginPage, /safeAdminNextPath\(next\)/);
  assert.match(adminLoginRoute, /safeAdminNextPath\(body\.next\)/);
  assert.match(stageRoute, /safeAdminReturnPath\(String\(form\.get\("returnTo"\) \|\| ""\)\)/);
  assert.match(joinForm, /FormEvent<HTMLFormElement>/);
  assert.match(joinForm, /type InputChangeEvent = \{ currentTarget: HTMLInputElement \}/);
  assert.match(joinForm, /function loadImageSource/);
  assert.match(joinForm, /initData\.profileComplete/);
  assert.match(joinForm, /response\.status === 409 && \/locked after entering\/i/);
  assert.match(joinForm, /typeof createImageBitmap === "function"/);
  assert.match(joinForm, /new Image\(\)/);
  assert.match(joinForm, /image\.onload = \(\) => resolve\(\)/);
  assert.match(predictionPanel, /FormEvent<HTMLFormElement>/);
  assert.match(predictionPanel, /type InputChangeEvent = \{ currentTarget: HTMLInputElement \}/);
  assert.match(predictionPanel, /initialUser\.position\?\.outcomeId \|\| ""/);
  assert.match(predictionPanel, /Pick an outcome above/);
  assert.match(predictionPanel, /\? "Choose an outcome"/);
  assert.match(predictionPanel, /mt-2 grid-cols-2 gap-1\.5 sm:hidden/);
  assert.doesNotMatch(predictionPanel, /max-h-\[128px\][\s\S]+overflow-y-auto/);
  assert.match(predictionPanel, /After prediction \$\{pct\(preview\.after\.stageSignal\)\}/);
  assert.match(predictionPanel, /sticky bottom-2 z-20/);
  assert.match(predictionPanel, /After prediction/);
  assert.match(predictionPanel, /grid-cols-\[repeat\(auto-fit,minmax\(56px,1fr\)\)\]/);
  assert.match(predictionPanel, /setShowMobileCustom/);
  assert.match(predictionPanel, /preview\.before\.stageSignal/);
  assert.match(predictionPanel, /MobileMarketMomentum/);
  assert.match(predictionPanel, /MobileOddsSparkline/);
  assert.match(predictionPanel, /aria-label="Mobile odds over time"/);
  assert.match(predictionPanel, /market\.oddsHistory\.slice\(-24\)/);
  assert.match(predictionPanel, /order-2 sm:hidden/);
  assert.match(predictionPanel, /Back to live room/);
  assert.match(predictionPanel, /order-1 h-fit rounded-xl border border-ink/);
  assert.match(checkoutButton, /type="button"/);
  assert.match(checkoutButton, /usePathname/);
  assert.match(checkoutButton, /body: JSON\.stringify\(\{ returnTo: returnTo \|\| pathname \|\| "\/" \}\)/);
  assert.match(predictionPanel, /returnTo=\{`\/m\/\$\{market\.id\}`\}/);
  assert.match(predictionPanel, /latestRefreshInput/);
  assert.match(predictionPanel, /fetch\(`\/api\/markets\/\$\{requested\.marketId\}\/predict\$\{previewParams \?/);
  assert.match(predictionPanel, /requested\.outcomeId && requested\.status === "open"/);
  assert.match(predictionPanel, /sequence !== refreshSequence\.current/);
  assert.match(predictionPanel, /if \(!marketClosed\) setOutcomeId\(outcome\.id\)/);
  assert.match(predictionPanel, /disabled=\{marketClosed\}/);
  assert.match(predictionPanel, /order-3 hidden lg:col-start-1 lg:block/);
  assert.match(eventPage, /Live room/);
  assert.match(eventPage, /heroLeader/);
  assert.match(eventPage, /line-clamp-2 text-sm font-black/);
  assert.match(eventPage, /openFeaturedMarket \|\| nextOpenMarket \|\| featuredVisibleMarket/);
  assert.match(eventPage, /heroMarket \? \(/);
  assert.match(eventPage, /!heroMarket \? "Waiting"/);
  assert.match(eventPage, /\{heroCta\}\s*<\/span>/);
  assert.match(eventPage, /hidden sm:block[\s\S]+<Tape/);
  assert.match(eventPage, /hidden gap-6 lg:grid/);
  assert.match(eventPage, /hidden gap-3 lg:grid lg:grid-cols-4/);
  assert.match(eventPage, /Add MegaBucks/);
  assert.match(eventPage, /showMobileTopUp/);
  assert.match(publicEventLive, /mb-3 hidden flex-wrap/);
  assert.match(publicEventLive, /grid gap-1 sm:hidden/);
  assert.match(publicEventLive, /mobilePrimaryMarkets = markets\.slice\(0, 3\)/);
  assert.match(publicEventLive, /mobileMoreMarkets = markets\.slice\(3\)/);
  assert.match(publicEventLive, /compareMarketForParticipant/);
  assert.match(publicEventLive, /leadingOutcome/);
  assert.match(publicEventLive, /grid grid-cols-\[92px_minmax\(0,1fr\)\] sm:block/);
  assert.match(publicEventLive, /index > 1 \? "hidden gap-1 sm:grid" : "grid gap-1"/);
  assert.match(publicEventLive, /\+\{market\.outcomes\.length - 2\} more options/);
  assert.match(publicMarketPage, /line-clamp-2 text-base font-black leading-tight sm:text-4xl/);
  assert.match(publicMarketPage, /hidden max-w-3xl font-semibold leading-6 text-white\/70 sm:block/);
  assert.match(publicMarketPage, /hidden gap-3 md:grid/);
  assert.doesNotMatch(publicMarketPage, /variant="secondary"[\s\S]+Event home/);
  assert.match(publicMarketPage, /Market details/);
  assert.match(publicMarketPage, /<span className="sm:hidden">Home<\/span>/);
  assert.match(publicMarketPage, /Continue prediction/);
  assert.match(eventPage, /Predict \{state\.event\.name\} outcomes/);
  assert.match(constantsLayer, /checkout: "Add 100 MBucks in event test mode/);
  assert.doesNotMatch(eventPage, /Predict MEGATHON outcomes/);
  assert.doesNotMatch(predictionPanel, /MEGATHON test mode/);
  assert.match(joinPage, /Add a photo if you want/);
  assert.match(joinPage, /mt-2 text-2xl font-black/);
  assert.match(joinForm, /Photo or avatar optional/);
  assert.match(joinForm, /Add photo optional/);
  assert.match(joinForm, /sm:order-last/);
  assert.doesNotMatch(joinForm, /capture="user"/);
  assert.match(joinPage, /initialEmail=\{session\?\.participant\.email\}/);
  assert.match(joinForm, /type="email"/);
  assert.match(joinForm, /autoComplete="email"/);
  assert.doesNotMatch(joinForm, /initialRoleValue|Choose your role|ROLE_LABELS/);
  assert.match(joinForm, /disabled=\{busy \|\| !nickname\.trim\(\) \|\| !email\.trim\(\)\}/);
  assert.match(profileRoute, /Enter your email address before joining/);
  assert.match(profileRoute, /role = "other"/);
  assert.match(profileIdentityMigration, /add column if not exists email text/);
  assert.match(profileIdentityMigration, /participants_event_human_nickname_unique_idx/);
  assert.match(profileIdentityMigration, /p_email text/);
  assert.match(storeLayer, /That email is already in the arena/);
  assert.match(participantUniqueEmailMigration, /participants_event_human_email_unique_idx/);
  assert.match(participantUniqueEmailMigration, /Duplicate participant emails exist inside an event/);
  assert.match(participantUniqueEmailMigration, /lower\(trim\(coalesce\(p\.email, ''\)\)\) = v_email/);
  assert.match(participantUniqueEmailMigration, /That email is already in the arena/);
  assert.match(participantUniqueEmailMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v044/);
  assert.match(participantUniqueEmailMigration, /'participantUniqueEmailIndex', v_participant_unique_email_index/);
  assert.match(participantUniqueEmailMigration, /'contractVersion', '045_participant_unique_email'/);
  assert.match(joinForm, /newAvatarDataUrl/);
  assert.match(joinForm, /avatarPreviewUrl/);
  assert.match(profileRoute, /submittedAvatar\.startsWith\("data:image\/"\)/);
  assert.match(profileCompletionMigration, /Avatar upload is optional for live joins/);
  assert.doesNotMatch(profileCompletionMigration, /pg_get_functiondef|replace\(v_sql/);
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

test("Supabase participant moderation is transactional and readiness-checked", () => {
  assert.match(participantModerationMigration, /create or replace function moderate_participant_tx\(/);
  assert.match(participantModerationMigration, /if coalesce\(p_action, ''\) not in \('rename', 'hide_avatar', 'show_avatar', 'ban', 'unban'\) then/);
  assert.match(participantModerationMigration, /select \* into v_participant[\s\S]+for update/);
  assert.match(participantModerationMigration, /Event context is required/);
  assert.match(participantModerationMigration, /Participant does not belong to this event/);
  assert.match(participantModerationMigration, /That stage name is already taken/);
  assert.match(participantModerationMigration, /array_agg\(distinct p\.market_id order by p\.market_id\)/);
  assert.match(participantModerationMigration, /perform recompute_market_aggregate\(v_market_id\)/);
  assert.match(participantModerationMigration, /insert into admin_audit_logs \(action, entity_type, entity_id, details, ip\)/);
  assert.match(participantModerationMigration, /grant execute on function moderate_participant_tx\(uuid, text, text, text, text\) to service_role/);
  assert.match(participantModerationMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v042/);
  assert.match(participantModerationMigration, /participantModerationRpc/);
  assert.match(participantModerationMigration, /'ok', coalesce\(\(v_contract ->> 'ok'\)::boolean, false\) and v_moderation_rpc/);
  assert.match(dataLayer, /eventSlug: string/);
  assert.match(dataLayer, /const eventSlug = input\.eventSlug\.trim\(\)/);
  assert.match(dataLayer, /if \(!eventSlug\) throw new Error\("Event context is required\."\)/);
  assert.match(dataLayer, /rpc<Row>\("moderate_participant_tx"/);
  assert.match(participantsRoute, /if \(!eventSlug\) throw new Error\("Event context is required\."\)/);
  assert.match(participantsRoute, /redirectParams\.set\("eventSlug", DEFAULT_EVENT_SLUG\)/);
  assert.doesNotMatch(
    dataLayer.match(/export async function moderateParticipantData[\s\S]+?\n}\n\nexport async function placePredictionData/)?.[0] || "",
    /patchRowsReturning\("participants"|upsertRows\(\s*"admin_audit_logs"/
  );
});

test("Supabase readiness contract uses the current return-path checkout RPC", () => {
  assert.match(currentPurchaseReadinessMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v043/);
  assert.match(currentPurchaseReadinessMigration, /select readiness_contract_tx_v043\(\) into v_contract/);
  assert.match(currentPurchaseReadinessMigration, /to_regprocedure\('create_or_reuse_pending_purchase_tx\(uuid,uuid,text\)'\) is not null/);
  assert.doesNotMatch(currentPurchaseReadinessMigration, /to_regprocedure\('create_or_reuse_pending_purchase_tx\(uuid,uuid\)'\)/);
  assert.match(currentPurchaseReadinessMigration, /'contractVersion', '044_readiness_contract_current_purchase_rpc'/);
  assert.match(currentPurchaseReadinessMigration, /'pendingPurchaseRpc', v_pending_purchase_rpc/);
  assert.match(currentPurchaseReadinessMigration, /'checkoutReturnPathScoped', v_checkout_return_path_scoped/);
  assert.match(currentPurchaseReadinessMigration, /'ok', v_ok/);
  assert.match(currentPurchaseReadinessMigration, /grant execute on function readiness_contract_tx\(\) to service_role/);
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
  assert.match(dataLayer, /rpc<Row>\("place_agent_prediction_serialized_tx"/);
  assert.match(predictionSerializationMigration, /create or replace function place_prediction_serialized_tx/);
  assert.match(predictionSerializationMigration, /pg_advisory_xact_lock\(724118991, market_prediction_lock_key\(p_market_id\)\)/);
  assert.match(predictionSerializationMigration, /create or replace function place_agent_prediction_serialized_tx/);
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
  assert.match(zeroSwitchGuardMigration, /create or replace function place_prediction_tx\(/);
  assert.match(zeroSwitchGuardMigration, /create or replace function market_guard_aggregate\(p_market_id uuid, p_humans_only boolean default false\)/);
  assert.match(zeroSwitchGuardMigration, /p_humans_only or par\.participant_type = 'human'/);
  assert.match(zeroSwitchGuardMigration, /if v_participant\.participant_type = 'human' then[\s\S]+market_guard_aggregate\(p_market_id, true\)/);
  assert.match(zeroSwitchGuardMigration, /v_initial_fair_launch := v_position\.id is null and v_fair_launch/);
  assert.match(zeroSwitchGuardMigration, /v_share_max := v_market\.max_action_stake/);
  assert.match(zeroSwitchGuardMigration, /v_zero_switch_allowed boolean := false/);
  assert.match(zeroSwitchGuardMigration, /v_zero_switch_allowed := not exists/);
  assert.match(zeroSwitchGuardMigration, /if v_amount = 0[\s\S]+v_position\.outcome_id <> p_outcome_id[\s\S]+not v_zero_switch_allowed/);
  assert.match(zeroSwitchGuardMigration, /This market cannot absorb that switch yet\. This market can absorb up to 0 Credits from you right now/);
  assert.match(zeroSwitchGuardMigration, /This market cannot absorb that switch yet\. This market can absorb up to % Credits from you right now/);
  assert.doesNotMatch(zeroSwitchGuardMigration, /pg_get_functiondef|Could not patch/);
  assert.match(zeroSwitchGuardMigration, /grant execute on function market_guard_aggregate\(uuid, boolean\) to service_role/);
  assert.match(zeroSwitchGuardMigration, /grant execute on function place_prediction_tx\(uuid, uuid, uuid, integer, text\) to service_role/);
  assert.match(dataLayer, /rpc<Row>\("place_prediction_serialized_tx"/);
  assert.match(dataLayer, /p_request_id: input\.requestId\?\.trim\(\)\.slice\(0, 128\) \|\| null/);
  assert.match(predictRoute, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(predictRoute, /const requestId = predictionRequestId\(request, body\)/);
  assert.match(predictRoute, /Prediction request id required/);
  assert.match(predictRoute, /requestId\n\s+}\)/);
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
  assert.match(zeroSwitchGuardMigration, /coalesce\(v_participant\.email, ''\) !~\* '\^\[\^\[:space:\]@\]\+@\[\^\[:space:\]@\]\+\\\.\[\^\[:space:\]@\]\+\$'/);
  assert.match(hardeningMigration, /format\('Starter MegaBucks for joining %s', v_event\.name\)/);
  assert.match(guardSessionRecoveryMigration, /format\('Starter MegaBucks for joining %s', v_event\.name\)/);
  assert.doesNotMatch(guardSessionRecoveryMigration, /Starter MegaBucks for joining MEGATHON/);
  assert.match(hardeningMigration, /insert into ledger_entries \(participant_id, type, amount_credits, direction, balance_after, reason, metadata, created_at\)/);
  assert.match(coreMigration, /insert into ledger_entries \(participant_id, type, amount_credits, direction, balance_after, idempotency_key, reason, purchase_id, metadata\)/);
  assert.match(ledgerParityMigration, /init_participant_session_tx\(text, text\)/);
  assert.match(ledgerParityMigration, /create or replace function credit_purchase_tx\(p_purchase_id uuid, p_status text, p_ip text default null\)/);
  assert.match(ledgerParityMigration, /direction,[\s\S]+balance_after,[\s\S]+idempotency_key,[\s\S]+reason,[\s\S]+purchase_id,[\s\S]+metadata/);
  assert.match(ledgerParityMigration, /'payment_status'/);
  assert.match(ledgerParityMigration, /v_previous_status text/);
  assert.match(ledgerParityMigration, /v_purchase\.status is distinct from p_status/);
  assert.match(ledgerParityMigration, /jsonb_build_object\('previousStatus', v_previous_status, 'status', v_purchase\.status\)/);
  assert.doesNotMatch(ledgerParityMigration, /Could not patch/);
  assert.match(platformSignalPriorsMigration, /100::numeric as prior_credits/);
  assert.match(platformSignalPriorsMigration, /credit_total \+ prior_credits/);
  assert.match(platformSignalPriorsMigration, /1 \/ nullif\(outcome_count, 0\) end as stage_people_component/);
  assert.match(platformSignalPriorsMigration, /0\.65 \* stage_people_component \+ 0\.35 \* conviction_signal/);
  assert.match(platformSignalPriorsMigration, /grant execute on function market_signal_snapshot\(uuid\) to service_role/);
  assert.match(dataLayer, /p_blind_launch_prediction_threshold/);
  assert.match(predictRoute, /predictionPreviewData/);
  assert.match(stageView, /Odds over time/);
  assert.match(predictionPanel, /Odds over time/);
});

test("final live hardening migration adds checkout intents profile lock pool settlement and contract checks", () => {
  assert.match(finalHardeningMigration, /create table if not exists checkout_intents/);
  assert.match(finalHardeningMigration, /unique \(event_id, participant_id\)/);
  assert.match(finalHardeningMigration, /create or replace function record_checkout_intent_tx\(p_participant_id uuid, p_purchase_id uuid default null\)/);
  assert.match(finalHardeningMigration, /click_count = checkout_intents\.click_count \+ 1/);
  assert.match(finalHardeningMigration, /create or replace function link_checkout_intent_purchase_tx\(p_participant_id uuid, p_purchase_id uuid\)/);
  assert.match(finalHardeningMigration, /create or replace function update_participant_profile_tx\(/);
  assert.match(finalHardeningMigration, /Profile is locked after entering the arena\./);
  assert.match(finalHardeningMigration, /create or replace function resolve_market_tx\(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null\)/);
  assert.match(finalHardeningMigration, /v_losing_pool/);
  assert.match(finalHardeningMigration, /v_unclaimed_pool/);
  assert.match(finalHardeningMigration, /case when v_winning_pool = 0 then v_losing_pool else 0 end/);
  assert.match(finalHardeningMigration, /'poolShare', v_pool_share/);
  assert.match(finalHardeningMigration, /'unclaimedPool', v_unclaimed_pool/);
  assert.match(finalHardeningMigration, /total_committed_credits = greatest\(0, w\.total_committed_credits - committed\.raw_credits\)/);
  assert.match(finalHardeningMigration, /v_market\.status = 'resolved'/);
  assert.match(finalHardeningMigration, /idempotent', true/);
  assert.match(finalHardeningMigration, /create or replace function readiness_contract_tx\(\)/);
  assert.match(finalHardeningMigration, /033_live_event_final_hardening/);
  assert.match(finalHardeningMigration, /grant execute on function readiness_contract_tx\(\) to service_role/);
  assert.match(dataLayer, /checkout_intents/);
  assert.match(dataLayer, /record_checkout_intent_tx/);
  assert.match(dataLayer, /link_checkout_intent_purchase_tx/);
  assert.match(dataLayer, /update_participant_profile_tx/);
  assert.match(profileRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(profileRoute, /Profile is locked after entering the arena/);
  assert.match(storeLayer, /unclaimedPool: netWinningPool === 0 \? netLosingPool : 0/);
  assert.match(storeLayer, /unclaimedPool: settlement\.unclaimedPool/);
  assert.match(checkoutRoute, /recordCheckoutIntentData\(session\.participant\.id\)/);
  assert.match(checkoutRoute, /linkCheckoutIntentPurchaseData\(session\.participant\.id, updated\.id\)/);
});

test("Supabase migrations do not rely on brittle function text patching", () => {
  for (const file of fs.readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"))) {
    const source = fs.readFileSync(`supabase/migrations/${file}`, "utf8");
    assert.doesNotMatch(source, /pg_get_functiondef|Could not patch/, file);
  }
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
  assert.match(newMarketPage, /searchParams: Promise<\{ eventSlug\?: string \| string\[\]; error\?: string \| string\[\] \}>/);
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
  assert.match(checkoutRoute, /findReusablePendingPurchaseData\(session\.participant\.id, returnTo\)/);
  assert.match(checkoutRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(checkoutStatusRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(checkoutRoute, /Idempotency-Key/);
  assert.match(checkoutRoute, /SAFE_COPY\.checkout/);
  assert.match(checkoutRoute, /description: `vota\.wtf \$\{eventSlug\} test MegaBucks`/);
  assert.match(checkoutRoute, /findEventByIdData\(session\.participant\.eventId\)/);
  assert.match(checkoutRoute, /scopedCheckoutReturnPathData/);
  assert.match(checkoutRoute, /await scopedCheckoutReturnPathData\(body\.returnTo, event\.slug\)/);
  assert.match(checkoutRoute, /redirectUrl: returnUrl\(purchaseId, eventSlug, returnTo\)/);
  assert.match(checkoutRoute, /createOrReusePendingPurchaseData\(session\.participant\.id, returnTo\)/);
  assert.match(checkoutRoute, /createMolliePayment\(purchase\.id, event\.slug, returnTo\)/);
  assert.match(checkoutRoute, /checkoutUrl\.startsWith\("https:\/\/"\)/);
  assert.doesNotMatch(checkoutRoute, /readDataStore|getSessionFromRequestData/);
  assert.match(dataLayer, /export async function findReusablePendingPurchaseData/);
  assert.match(dataLayer, /export async function scopedCheckoutReturnPathData/);
  assert.match(dataLayer, /safeCheckoutReturnPath\(value, eventSlug\)/);
  assert.match(dataLayer, /export async function scopedParticipantNextPathData\(value: unknown, eventSlug: string\)/);
  assert.match(dataLayer, /safeParticipantNextPath\(value\)/);
  assert.match(dataLayer, /decodeURIComponent\(eventPathMatch\[1\] \|\| ""\) === eventSlug/);
  assert.match(dataLayer, /market\?\.eventId === event\.id \? path : ""/);
  assert.match(dataLayer, /const directEventMatch = pathname\.match/);
  assert.match(dataLayer, /\(\?:e\|j\|join\)/);
  assert.match(dataLayer, /market\?\.eventId === event\.id/);
  assert.match(dataLayer, /status=not\.in\.\(draft,voided\)/);
  assert.match(dataLayer, /return_to: purchase\.returnTo \|\| null/);
  assert.match(dataLayer, /p_return_to: returnTo/);
  assert.match(checkoutReturnPathMigration, /add column if not exists return_to text/);
  assert.match(checkoutReturnPathMigration, /create_or_reuse_pending_purchase_tx\(\s*p_participant_id uuid,\s*p_purchase_id uuid,\s*p_return_to text/);
  assert.match(checkoutReturnPathMigration, /and return_to is not distinct from v_return_to/);
  assert.match(checkoutReturnPathMigration, /'checkoutReturnPathScoped', v_checkout_return_path_scoped/);
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
  assert.match(webhookRoute, /scopedCheckoutReturnPathData/);
  assert.match(webhookRoute, /if \(redirectToEvent\)/);
  assert.match(checkoutStatusRoute, /getSessionParticipantData\(getParticipantSessionIdFromRequest\(request\)\)/);
  assert.match(checkoutStatusRoute, /findParticipantPurchaseData\(session\.participant\.id, purchaseId\)/);
  assert.match(checkoutStatusRoute, /verifyAndCreditPurchase\(purchase\)/);
  assert.doesNotMatch(paymentsHelper, /readDataStore/);
  assert.match(localCheckoutPage, /findPurchaseData\(purchaseId\)/);
  assert.match(localCheckoutPage, /scopedCheckoutReturnPathData\(requestedReturnTo \|\| purchase\?\.returnTo, eventSlug\)/);
  assert.match(localCheckoutPage, /const canComplete = purchase && participant && event/);
  assert.match(localCheckoutPage, /Checkout link closed/);
  assert.match(localCheckoutPage, /ButtonLink href=\{returnHref\}/);
  assert.match(localCheckoutPage, /name="redirectToEvent" value="1"/);
  assert.match(localCheckoutPage, /name="returnTo" value=\{returnTo\}/);
  assert.match(webhookRoute, /scopedCheckoutReturnPathData\(payload\.returnTo/);
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
  assert.match(stageRoute, /featuredMarketId: featuredMarketId \|\| undefined/);
  assert.match(dataLayer, /input\.stageMode === "resolution"/);
  assert.match(dataLayer, /candidate\.status === "resolved"/);
  assert.match(stageResolutionFeatureGuardMigration, /create or replace function feature_market_tx\(p_market_id uuid/);
  assert.match(stageResolutionFeatureGuardMigration, /stage_mode = case[\s\S]+stage_mode = 'resolution' and v_market\.status <> 'resolved' then 'live'/);
  assert.match(dataLayer, /if \(market\.status === "resolved"\) event\.stageMode = "resolution"/);
  assert.match(dataLayer, /else if \(event\.stageMode === "resolution"\) event\.stageMode = "live"/);
  assert.match(stageLiveStatusGuardMigration, /v_needs_unresolved_market boolean := p_stage_mode in \('live', 'role_battle', 'humans_vs_agents'\)/);
  assert.match(stageLiveStatusGuardMigration, /v_needs_unresolved_market and v_market\.status = 'resolved'/);
  assert.match(stageLiveStatusGuardMigration, /This stage mode needs an open or locked stage-visible market/);
  assert.match(stageLiveStatusGuardMigration, /and \(not v_needs_unresolved_market or status <> 'resolved'\)/);
  assert.match(stageSafeFallbackMigration, /create or replace function stage_market_is_compatible/);
  assert.match(stageSafeFallbackMigration, /when p_stage_mode = 'resolution' then p_market_status = 'resolved'/);
  assert.match(stageSafeFallbackMigration, /when p_stage_mode in \('live', 'role_battle', 'humans_vs_agents'\) then p_market_status <> 'resolved'/);
  assert.match(stageSafeFallbackMigration, /create trigger events_stage_feature_normalize/);
  assert.match(stageSafeFallbackMigration, /when v_market\.status = 'resolved' then 'resolution'/);
  assert.match(stageSafeFallbackMigration, /if not stage_market_is_compatible\(p_stage_mode, v_market\.status\) then[\s\S]+v_market := null/);
  assert.match(dataLayer, /const marketDisplayModes: StageMode\[\] = \["live", "humans_vs_agents"\]/);
  assert.match(dataLayer, /const compatibleExplicitMarket/);
  assert.match(stageModeCleanupMigration, /set stage_mode = 'live'\s+where stage_mode = 'role_battle'/);
  assert.match(stageModeCleanupMigration, /check \(stage_mode in \('join', 'live', 'humans_vs_agents', 'leaderboard', 'resolution'\)\)/);
  assert.match(stageModeCleanupMigration, /if new\.stage_mode = 'role_battle' then[\s\S]+new\.stage_mode := 'live'/);
  assert.match(stageModeCleanupMigration, /when p_stage_mode in \('live', 'humans_vs_agents'\) then p_market_status <> 'resolved'/);
  assert.match(stageModeCleanupMigration, /if p_stage_mode not in \('join', 'live', 'humans_vs_agents', 'leaderboard', 'resolution'\) then/);
  assert.doesNotMatch(stageModeCleanupMigration, /p_stage_mode not in \('join', 'live', 'role_battle'/);
  assert.match(stageModeCleanupMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v038/);
  assert.match(stageModeCleanupMigration, /'contractVersion', '040_remove_role_battle_stage_mode'/);
  assert.match(stageModeCleanupMigration, /'roleBattleStageModeRemoved', v_role_battle_removed/);
  assert.match(adminStagePage, /Live and humans-vs-agents modes use open or locked markets\. Resolution mode uses resolved markets\./);
  assert.match(eventAdminPage, /Live and humans-vs-agents modes use open or locked markets\. Resolution mode uses resolved markets\./);
  assert.doesNotMatch(stageRoute, /role_battle/);
  assert.doesNotMatch(adminStagePage, /role_battle|Role battle/);
  assert.doesNotMatch(eventAdminPage, /role_battle|Role battle/);
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
  assert.match(adminLoginRoute, /function loginErrorResponse/);
  assert.match(adminLoginRoute, /NextResponse\.redirect\(url, \{ status: 303 \}\)/);
  assert.match(adminLoginPage, /firstSearchParam\(params\.error\)/);
  assert.match(adminLoginPage, /\{error\}/);
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
  assert.match(marketCreateRoute, /adminActionError\(request, returnTo/);
  assert.match(marketUpdateRoute, /adminActionError\(request, returnTo/);
  assert.match(newMarketPage, /Market draft failed/);
  assert.match(dataLayer, /freshMarket\.updatedAt !== expectedUpdatedAt/);
  assert.match(marketUpdateRoute, /Market changed since this form loaded/);
  assert.match(marketPage, /disabled=\{market\.status !== "draft"\}/);
  assert.match(marketPage, /market\.status === "locked"/);
  assert.match(marketPage, /action="feature"[\s\S]+disabled=\{market\.status === "draft" \|\| market\.status === "voided"\}/);
  assert.match(marketPage, /Lock this market before resolving it/);
  assert.match(marketPage, /Market action failed/);
  assert.match(marketForm, /name="confirmResolution"/);
  assert.match(marketForm, /<option value="">Choose the official winner\.\.\.<\/option>/);
  assert.match(marketForm, /name="confirmOutcomeLabel"/);
  assert.match(marketForm, /I confirm this is the official result/);
  assert.match(fs.readFileSync("app/api/admin/markets/[id]/resolve/route.ts", "utf8"), /form\.get\("confirmResolution"\) !== "on"/);
  assert.match(fs.readFileSync("app/api/admin/markets/[id]/resolve/route.ts", "utf8"), /Choose the official winning outcome/);
  assert.match(fs.readFileSync("app/api/admin/markets/[id]/resolve/route.ts", "utf8"), /confirmOutcomeLabel/);
  for (const file of [
    "app/api/admin/markets/[id]/feature/route.ts",
    "app/api/admin/markets/[id]/lock/route.ts",
    "app/api/admin/markets/[id]/open/route.ts",
    "app/api/admin/markets/[id]/resolve/route.ts",
    "app/api/admin/markets/[id]/void/route.ts"
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /adminActionError/);
    assert.doesNotMatch(source, /return badRequest\(error/);
  }
  assert.match(httpHelper, /export function adminActionError/);
  assert.match(httpHelper, /url\.searchParams\.set\("error"/);
  assert.match(marketPage, /const accruedProvisionCredits = market\.status === "voided"/);
  assert.match(marketPage, /entry\.marketId === market\.id && entry\.type === "platform_provision"/);
  assert.match(marketPage, /const platformProvisionCredits = market\.status === "resolved" \? settledPlatformProvisionCredits : accruedProvisionCredits/);
  assert.match(marketPage, /store\.positions/);
  assert.match(marketUpdateRoute, /showOnStage: existing\.status !== "voided" && form\.get\("showOnStage"\) === "on"/);
  assert.match(dataLayer, /Only non-voided public markets can be featured on stage/);
  assert.doesNotMatch(marketPage, /const .*ProvisionCredits = store\.predictionActions/);
  assert.match(stageView, /people in/);
  assert.match(stageView, /function CompactStageQr/);
  assert.match(stageView, /joinUrl=\{joinUrl\}/);
  assert.match(stageView, /Stage data is reconnecting\. Showing the last confirmed state\./);
  assert.match(stageView, /setRefreshFailed\(true\)/);
  assert.match(stageView, /window\.setInterval\(refresh, 2500\)/);
  assert.match(stageView, /item\.status !== "voided" && item\.showOnStage/);
  assert.match(stageView, /Predictions and MegaBuck top-ups are temporarily paused by the organizer/);
  assert.match(stageView, /if \(!publicStateResponse\.ok \|\| !leaderboardResponse\.ok\) \{[\s\S]+setRefreshFailed\(true\)/);
  assert.match(stageView, /if \(!publicState\?\.event \|\| !Array\.isArray\(publicState\.markets\) \|\| !Array\.isArray\(leaderboard\?\.leaderboard\)\) \{[\s\S]+setRefreshFailed\(true\)/);
  assert.match(stageView, /function isCompatibleStageMarket\(stageMode: StageMode, market: PublicMarketState\)/);
  assert.match(stageView, /stageMode === "resolution"[\s\S]+market\.status === "resolved"/);
  assert.match(stageView, /market\.status === "open" \|\| market\.status === "locked"/);
  assert.match(stageView, /showAgentLayer \? `Humans \$\{pct\(outcome\.humanSignal\)\}` : `Room \$\{pct\(outcome\.stageSignal\)\}`/);
  assert.match(stageView, /Compare Humans\/Agents/);
  assert.match(stageView, /outcome\.combinedSignal/);
  assert.ok(
    stageView.indexOf('<span className="font-mono-vota text-ember">{showAgentLayer ?') <
      stageView.indexOf("{!showAgentLayer ? <StageOddsTimeline market={market} /> : null}")
  );
  assert.match(stageView, /max-w-\[440px\]/);
  assert.match(stageView, /max-w-\[300px\]/);
  assert.match(stageView, /min-h-\[100dvh\]/);
  assert.match(stageView, /h-40 w-full[\s\S]+xl:h-48/);
  assert.match(qrCodeComponent, /className = "aspect-square w-full max-w-\[280px\] bg-white"/);
  assert.match(qrCodeComponent, /className\?: string/);
  assert.match(stageView, /lastSignalSignature/);
  assert.match(stageView, /stage-pulse-even/);
  assert.match(eventAdminPage, /status !== "voided"/);
  assert.match(eventAdminPage, /No stage-visible markets/);
  assert.match(eventAdminPage, /Control update failed/);
  assert.match(eventAdminPage, /\/admin\/markets\/new\?eventSlug=\$\{encodeURIComponent\(slug\)\}/);
  assert.match(eventAdminPage, /\{market\.title\} \(\{market\.status\}\{market\.status === "resolved" \? ", resolution only" : ""\}\)/);
  assert.match(eventAdminPage, /activeStageMarkets = stageMarkets\.filter\(\(market\) => market\.status !== "resolved"\)/);
  assert.match(adminStagePage, /activeStageMarkets = markets\.filter\(\(market\) => market\.status !== "resolved"\)/);
  assert.match(adminStagePage, /Stage update failed/);
  assert.match(stageRoute, /adminActionError\(request, returnTo/);
  assert.match(predictionPanel, /const isZeroMegaBuckSwitch = isSwitch && amountValue === 0/);
  assert.match(predictionPanel, /fairLaunchAmountInvalid/);
  assert.match(predictionPanel, /postCooldownAllowedAdd/);
  assert.match(predictionPanel, /Whale Guard cap after cooldown/);
  assert.match(predictionPanel, /fairLaunchAmountInvalid \|\| amountExceedsAllowed \|\| amountExceedsPostCooldown \|\| previewBlocksSubmit \|\| emergencyPaused/);
  assert.match(predictionPanel, /const previewBlocksSubmit = Boolean\(preview\?\.blocked\)/);
  assert.match(storeLayer, /const fairLaunchAmountInvalid = Boolean\(allowed\.fairLaunch && requested !== allowed\.minInitial\)/);
  assert.match(predictionPanel, /Max allowed now/);
  assert.match(predictionPanel, /disabled=\{!selectedAllowed \|\| selectedAllowed\.allowedAdd <= 0\}/);
  assert.match(predictionPanel, /const marketClosed = market\.status !== "open"/);
  assert.match(predictionPanel, /<ClosedMarketSummary/);
  assert.match(predictionPanel, /Winning outcome/);
  assert.match(predictionPanel, /Predictions are locked\. Watch the stage for the reveal\./);
  assert.match(predictionPanel, /Share your receipt/);
  assert.match(featureStageGuardMigration, /v_market\.status in \('draft', 'voided'\)/);
});

test("public pages expose score boards and market hero imagery", () => {
  for (const title of ["Early callers", "Contrarian calls"]) {
    assert.match(eventPage, new RegExp(`title="${title}"`));
  }
  assert.doesNotMatch(eventPage, /title="Builders"|title="Sponsors"|title="Investors"|title="Other"/);
  assert.match(eventPage, /LIVE ODDS/);
  assert.match(stageView, /StageBoard title="Humans"/);
  assert.match(stageView, /StageBoard title="Agents"/);
  assert.match(stageView, /StageBoard title="Early callers"/);
  assert.match(stageView, /StageBoard title="Contrarian calls"/);
  assert.doesNotMatch(stageView, /StageBoard title="Builders"|StageBoard title="Sponsors"|StageBoard title="Investors"|StageFrame title="Role Battle"|roleCalls/);
  assert.doesNotMatch(dashboardPage, /StageBoard title="Builders"|title="Builders"|title="Sponsors"|title="Investors"|Role battle|roleCalls/);
  assert.match(eventPage, /PublicEventLive/);
  assert.match(eventPage, /Predictions are paused/);
  assert.match(eventPage, /participantOrderedMarkets = \[\.\.\.state\.markets\]\.sort\(\(a, b\) => compareMarketForParticipant\(a, b, state\.event\.featuredMarketId\)\)/);
  assert.match(eventPage, /openFeaturedMarket \|\| nextOpenMarket \|\| featuredVisibleMarket/);
  assert.match(eventPage, /showMobileTopUp/);
  assert.match(eventPage, /line-clamp-2 text-xs font-bold leading-tight text-muted/);
  assert.match(publicEventLive, /featuredMarketId = state\.event\.featuredMarketId/);
  assert.match(publicEventLive, /compareMarketForParticipant\(a, b, featuredMarketId\)/);
  assert.match(publicEventLive, /statusDelta !== 0/);
  assert.match(publicEventLive, /markets\.map/);
  assert.match(publicEventLive, /mobilePrimaryMarkets = markets\.slice\(0, 3\)/);
  assert.match(publicEventLive, /mobilePrimaryMarkets\.map/);
  assert.match(publicEventLive, /Markets are loading/);
  assert.match(publicEventLive, /Predictions paused/);
  assert.match(publicMarketPage, /state\.imageUrl/);
  assert.match(publicMarketPage, /item\.id === marketId && item\.status !== "draft" && item\.status !== "voided"/);
  assert.match(predictRoute, /item\.id === id && item\.status !== "draft" && item\.status !== "voided"/);
  assert.match(predictionPanel, /router\.replace\(`\/e\/\$\{eventSlug\}`\)/);
  assert.match(predictionPanel, /Add or switch/);
  assert.match(predictionPanel, /Wallet \{user\.wallet \? mbucks\(user\.wallet\.balanceCredits\) : "Join first"\}/);
  assert.match(publicMarketPage, /initialEmergencyPaused=\{Boolean\(event\?\.emergencyPaused\)\}/);
  assert.match(publicMarketPage, /<img src=\{state\.imageUrl\}/);
  assert.match(stageView, /max-w-\[300px\]/);
  assert.match(stageView, /max-w-\[440px\]/);
  assert.match(localCheckoutPage, /100dvh/);
});

test("admin control surfaces avoid GET writes and expose proof/control affordances", () => {
  assert.doesNotMatch(agentsPage, /mutateDataStore/);
  assert.match(agentsPage, /Initialize house agents/);
  assert.match(agentsPage, /resolveAdminEvent/);
  assert.match(agentsPage, /<McpTokenForm eventSlug=\{event\?\.slug \|\| requestedSlug\} participants=\{participants\} \/>/);
  assert.match(mcpTokenForm, /\/api\/admin\/mcp-tokens/);
  assert.match(mcpTokenForm, /eventSlug/);
  assert.match(mcpTokenForm, /JSON\.stringify\(\{ eventSlug, participantId, expiresInHours: Number\(expiresInHours\) \}\)/);
  assert.match(mcpTokenForm, /Choose participant/);
  assert.match(mcpTokenForm, /disabled=\{busy \|\| !participantId\}/);
  assert.match(mcpTokenRoute, /const eventSlug = String\(body\.eventSlug \|\| DEFAULT_EVENT_SLUG\)/);
  assert.match(mcpTokenRoute, /createMcpWriteTokenData/);
  assert.match(mcpTokenRoute, /redirectTo\.searchParams\.set\("eventSlug", eventSlug\)/);
  assert.match(dataLayer, /Choose a participant for this MCP write token/);
  assert.match(dataLayer, /Participant does not belong to this event/);
  assert.match(dataLayer, /Boolean\(tokenParticipant\) && tokenParticipant === participantId/);
  assert.doesNotMatch(dataLayer, /!tokenParticipant \|\| tokenParticipant === participantId/);
  assert.match(dataLayer, /details: \{ eventId: event\.id, eventSlug: event\.slug, participantId: record\.participantId, expiresAt \}/);
  assert.doesNotMatch(dataLayer, /participantId: record\.participantId \|\| "any"/);
  assert.match(dataLayer, /Math\.min\(720, Math\.max\(1, Math\.floor\(input\.expiresInHours \|\| 72\)\)\)/);
  assert.doesNotMatch(mcpTokenForm, /localStorage|sessionStorage/);
  assert.doesNotMatch(mcpTokenForm, /event: any|React\.FormEvent/);
  assert.match(mcpTokenForm, /type SelectChangeEvent = \{ currentTarget: HTMLSelectElement \}/);
  assert.match(mcpTokenForm, /type InputChangeEvent = \{ currentTarget: HTMLInputElement \}/);
  assert.doesNotMatch(mcpTokenRoute, /searchParams\.set\("mcpToken"/);
  assert.match(ensureAgentsRoute, /ensureHouseAgentsData/);
  assert.match(agentEnsureRoute, /readJsonObject\(request\)/);
  assert.match(agentEnsureRoute, /agentsReturnPath\(eventSlug\)/);
  assert.match(agentRunRoute, /agentsReturnPath\(eventSlug\)/);
  assert.match(storeLayer, /store\.markets\.find\(\(item\) => item\.id === input\.marketId && item\.eventId === event\.id\)/);
  assert.match(agentsPage, /recentRuns/);
  assert.match(agentsPage, /agentStrategyLabel/);
  assert.doesNotMatch(agentsPage, /agent\.strategy\}/);
  assert.doesNotMatch(storeLayer, /name: "Builder Agent"|name: "Sponsor Agent"|name: "Investor Agent"/);
  assert.match(agentsPage, /Agent action failed/);
  assert.match(agentsPage, /MCP token created/);
  assert.match(participantsRoute, /adminActionError\(request, returnTo/);
  assert.match(adminVoidRoute, /form\.get\("confirmVoid"\)/);
  assert.match(adminVoidRoute, /Type VOID before voiding this market/);
  assert.match(adminMarketPage, /name="confirmVoid"/);
  assert.match(adminMarketPage, /placeholder="VOID"/);
  assert.match(adminMarketPage, /aria-label="Type VOID to confirm"/);
  assert.match(dataLayer, /Participant does not belong to this event/);
  assert.match(participantsPage, /Participant update failed/);
  assert.doesNotMatch(participantsPage, /ROLE_LABELS|All roles|participant\.role/);
  assert.doesNotMatch(participantsRoute, /"role"|participant\.role|searchParams\.get\("role"\)/);
  assert.doesNotMatch(paymentsPage, /participant\?\.role/);
  assert.match(paymentsPage, /Export purchases CSV/);
  assert.match(paymentsPage, /Export intent CSV/);
  assert.match(paymentsPage, /Interested people/);
  assert.match(paymentsPage, /Unique intent EUR/);
  assert.match(paymentsPage, /Top-up clicks/);
  assert.match(paymentsPage, /Click intent EUR/);
  assert.match(paymentsPage, /metrics\.intentClickProjectedEur/);
  assert.match(paymentsRoute, /type"\) === "intents"/);
  assert.match(paymentsRoute, /vota-checkout-intents\.csv/);
  assert.match(paymentsRoute, /totalClickValueEur/);
  assert.match(storeLayer, /intentClickProjectedEur/);
  assert.match(storeLayer, /intent\.amountEur \* intent\.clickCount/);
  assert.doesNotMatch(adminReportPage, /rolePerformance|roleSplit/);
  assert.match(eventSwitcherMigration, /'megathon', 'megathon'/);
  assert.match(eventSwitcherMigration, /'testingmiki', 'testingmiki'/);
  assert.match(ensureEventRoomsMigration, /'megathon', 'megathon'/);
  assert.match(ensureEventRoomsMigration, /'testingmiki', 'testingmiki'/);
  assert.doesNotMatch(eventSwitcherMigration, /status = excluded\.status|emergency_paused = excluded|stage_mode = excluded/);
  assert.doesNotMatch(ensureEventRoomsMigration, /status = excluded\.status|emergency_paused = excluded|stage_mode = excluded/);
  assert.doesNotMatch(roomMarketSeedMigration, /status = excluded\.status|emergency_paused = excluded|stage_mode = excluded/);
  assert.match(roomMarketSeedMigration, /Who wins Megathon\?/);
  assert.match(roomMarketSeedMigration, /Who wins testingmiki\?/);
  assert.match(roomMarketSeedMigration, /Which testingmiki signal moves fastest\?/);
  assert.match(roomMarketSeedMigration, /featured_market_id = '00000000-0000-4000-8000-000000001001'/);
  assert.match(roomMarketSeedMigration, /featured_market_id = '00000000-0000-4000-8000-000000001101'/);
  assert.match(roomMarketSeedMigration, /where slug = 'megathon'[\s\S]+featured_market_id is null/);
  assert.match(roomMarketSeedMigration, /where slug = 'testingmiki'[\s\S]+featured_market_id is null/);
  assert.match(roomMarketSeedMigration, /alter function readiness_contract_tx\(\) rename to readiness_contract_tx_v040/);
  assert.match(roomMarketSeedMigration, /'contractVersion', '041_seed_megathon_testingmiki_markets'/);
  assert.match(roomMarketSeedMigration, /'megathonTestingmikiMarketsSeeded', v_rooms_seeded/);
  assert.match(checkoutReturnPathMigration, /'contractVersion', '042_checkout_return_path_scope'/);
  assert.match(constantsLayer, /DEFAULT_EVENT_SLUG = process\.env\.NEXT_PUBLIC_EVENT_SLUG \|\| "megathon"/);
  assert.match(constantsLayer, /LEGACY_EVENT_SLUG = "megathon-2026"/);
  assert.match(storeLayer, /slug: LEGACY_EVENT_SLUG/);
  assert.match(storeLayer, /slug: "megathon"/);
  assert.match(storeLayer, /slug: "testingmiki"/);
  assert.match(storeLayer, /title: "Who wins Megathon\?"/);
  assert.match(storeLayer, /title: "Who wins testingmiki\?"/);
  assert.match(storeLayer, /title: "Which testingmiki signal moves fastest\?"/);
  assert.match(dataLayer, /const eventRows = await selectRows\("events", "select=id,slug"\)/);
  assert.match(dataLayer, /const eventIdBySlug = new Map/);
  assert.match(dataLayer, /const seededMarkets = seed\.markets\.map\(\(market\) => \(\{ \.\.\.market, eventId: remapEventId\(market\.eventId\) \}\)\)/);
  assert.match(dataLayer, /const seededParticipants = seed\.participants\.map\(\(participant\) => \(\{ \.\.\.participant, eventId: remapEventId\(participant\.eventId\) \}\)\)/);
  assert.match(dataLayer, /slug=eq\.\$\{encodeURIComponent\(event\.slug\)\}&featured_market_id=is\.null/);
  assert.match(dataLayer, /megathonTestingmikiMarketsSeeded: true/);
  assert.match(dataLayer, /checkoutReturnPathScoped: true/);
  assert.match(adminNav, /AdminEventSwitcher/);
  assert.match(adminNav, /\["\/admin\/events", "Events"\]/);
  assert.match(adminNav, /Stage screen/);
  assert.match(adminNav, /href=\{`\/stage\/\$\{eventSlug\}`\}/);
  assert.match(adminEventSwitcher, /pathname === "\/admin\/events"/);
  assert.match(adminEventSwitcher, /params\.set\("eventSlug", slug\)/);
  assert.match(adminEventSwitcher, /router\.push\(`\/admin\/events\/\$\{encodeURIComponent\(slug\)\}`\)/);
  assert.match(eventsAdminPage, /All rooms/);
  assert.match(eventsAdminPage, /Create event/);
  assert.match(eventsAdminPage, /action="\/api\/admin\/events"/);
  assert.match(eventsAdminPage, /name="starterCredits"/);
  assert.match(eventsAdminPage, /Stage URL/);
  assert.match(eventsAdminPage, /\/stage\/\$\{event\.slug\}/);
  assert.match(eventsAdminPage, /Public room/);
  assert.match(adminEventsRoute, /requireAdminRequest/);
  assert.match(adminEventsRoute, /createEventData/);
  assert.match(adminEventsRoute, /safeAdminReturnPath/);
  assert.match(adminEventsRoute, /\/admin\/events\/\$\{event\.slug\}/);
  assert.match(dataLayer, /export async function createEventData/);
  assert.match(storeLayer, /export function createEvent/);
  assert.match(storeLayer, /action: "create_event"/);
  assert.match(dashboardPage, /Stage URL/);
  assert.match(dashboardPage, /\/stage\/\$\{metrics\.event\.slug\}/);
  assert.match(eventAdminPage, /Control room/);
  assert.match(eventAdminPage, /Stage URL/);
  assert.match(eventAdminPage, /\/stage\/\$\{slug\}/);
  assert.match(eventAdminPage, /Stage quick controls/);
  assert.match(eventAdminPage, /AdminLiveRefresh/);
  assert.doesNotMatch(eventAdminPage, /notFound\(\)/);
  assert.match(eventAdminPage, /Event not found/);
  assert.match(eventAdminPage, /This admin link points to a room that no longer exists/);
  assert.match(eventAdminPage, /Open \{fallbackEvent\.name\}/);
  assert.match(eventAdminPage, /name="returnTo" value=\{`\/admin\/events\/\$\{slug\}`\}/);
  assert.match(adminStagePage, /name="returnTo" value=\{`\/admin\/stage\?eventSlug=\$\{encodeURIComponent\(event\.slug\)\}`\}/);
  assert.match(adminStagePage, /Stage screen/);
  assert.match(adminStagePage, /\/stage\/\$\{event\.slug\}/);
  assert.match(eventAdminPage, /\/admin\/markets\/new\?eventSlug=\$\{encodeURIComponent\(slug\)\}/);
  assert.match(adminMarketPage, /requestedEventSlug = firstSearchParam\(paramsValue\.eventSlug\) \|\| DEFAULT_EVENT_SLUG/);
  assert.match(adminMarketPage, /Market not found/);
  assert.match(adminMarketPage, /Open \{fallbackEvent\.name\}/);
  assert.match(marketCreateRoute, /const eventSlug = request\.nextUrl\.searchParams\.get\("eventSlug"\) \|\| DEFAULT_EVENT_SLUG/);
  assert.match(marketCreateRoute, /if \(!event\) return badRequest\("Event not found\.", 404\)/);
  assert.match(marketCreateRoute, /const markets = store\.markets\.filter\(\(market\) => market\.eventId === event\.id\)/);
  assert.match(marketCreateRoute, /store\.outcomes\.filter\(\(outcome\) => marketIds\.has\(outcome\.marketId\)\)/);
  assert.match(marketCreateRoute, /store\.marketAggregates\.filter\(\(aggregate\) => marketIds\.has\(aggregate\.marketId\)\)/);
  assert.match(auditHelper, /eventSlug\?: SearchParamValue/);
  assert.match(auditHelper, /eventIdForAuditLog\(store, log\) !== filters\.eventId/);
  assert.match(adminAuditPage, /resolveAdminEvent/);
  assert.match(adminAuditPage, /eventSlug,/);
  assert.match(adminAuditPage, /const scopedLogs = listAuditLogs\(store, \{ eventSlug, limit: 1000 \}\)/);
  assert.match(adminAuditPage, /Event not found: \{requestedSlug\}/);
  assert.match(adminAuditRoute, /const eventSlug = request\.nextUrl\.searchParams\.get\("eventSlug"\) \|\| DEFAULT_EVENT_SLUG/);
  assert.match(adminAuditRoute, /eventSlug,/);
  assert.match(stageRoute, /safeAdminReturnPath/);
  assert.match(stageRoute, /return Response\.redirect\(new URL\(returnTo, request\.url\), 303\)/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_REPO_URL/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_POSTS_URL/);
  assert.match(buildPage, /NEXT_PUBLIC_PROOF_DEMO_URL/);
  assert.match(buildPage, /\/build\/demo/);
  assert.match(buildPage, /\/admin\/payments\?eventSlug=\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildPage, /\/admin\?eventSlug=\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildPage, /\/admin\/readiness\?eventSlug=\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildDemoPage, /Live demo script/);
  assert.match(buildDemoPage, /Resolve and score/);
  assert.match(buildDemoPage, /DEFAULT_DEMO_MARKET_ID = "00000000-0000-4000-8000-000000001001"/);
  assert.match(buildDemoPage, /\/m\/\$\{DEFAULT_DEMO_MARKET_ID\}/);
  assert.doesNotMatch(buildDemoPage, /00000000-0000-4000-8000-000000000101/);
  assert.match(buildDemoPage, /\/stage\/\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildDemoPage, /\/admin\?eventSlug=\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildDemoPage, /\/admin\/participants\?eventSlug=\$\{DEFAULT_EVENT_SLUG\}/);
  assert.match(buildDemoPage, /href: `\/admin\/events\/\$\{DEFAULT_EVENT_SLUG\}`/);
  assert.doesNotMatch(buildDemoPage, /admin\/events\/megathon-2026/);
  assert.match(buildPage, /Checkout screenshot/);
  assert.match(buildPage, /Stage screenshot/);
  assert.match(middleware, /sameOriginAdminMutation/);
  assert.match(middleware, /`\$\{pathname\}\$\{search\}`/);
  assert.match(middleware, /return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/);
  assert.match(dataLayer, /process\.env\.NODE_ENV !== "production" && verifyBearerToken/);
  assert.match(mcpRoute, /const readOnlyEventSlug = requestedEventSlug \|\| process\.env\.NEXT_PUBLIC_EVENT_SLUG \|\| DEFAULT_EVENT_SLUG/);
  assert.match(mcpRoute, /findEventByIdData\(session\.participant\.eventId\)/);
  assert.match(mcpRoute, /readPublicEventStoreData\(visibleEvent\.slug, session\?\.session\.id\)/);
  assert.match(mcpRoute, /readPublicMarketStoreData\(marketId, session\?\.session\.id\)/);
  assert.match(mcpRoute, /market\.status === "open" && market\.eventId === visibleEvent\.id/);
  assert.match(mcpRoute, /event\?\.slug === readOnlyEventSlug/);
  assert.doesNotMatch(mcpRoute, /readDataStore/);
  assert.match(mcpRoute, /Mcp-Session-Id/);
  assert.match(mcpRoute, /text\/event-stream/);
  assert.match(mcpRoute, /hasCompletedProfile\(session\.participant\)/);
  assert.match(mcpRoute, /Finish your profile before predicting\./);
  assert.match(mcpRoute, /Use the \$\{visibleEvent\?\.name \|\| "event"\} test checkout/);
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
  assert.match(adminReportPage, /No events are configured yet/);
  assert.match(adminReportPage, /Cala context enrichment/);
  assert.match(adminReportPage, /PixVerse promo briefs/);
  assert.match(adminReportPage, /format=csv/);
  assert.match(adminReportPage, /format=cala/);
  assert.match(adminReportPage, /format=pixverse/);
  assert.match(adminReportRoute, /analyticsReportRows/);
  assert.match(adminReportRoute, /badRequest\("Event not found\.", 404\)/);
  assert.match(adminReportRoute, /format === "cala"/);
  assert.match(adminReportRoute, /format === "pixverse"/);
  assert.match(analyticsHelper, /export function buildAdvancedAnalyticsReport/);
  assert.match(analyticsHelper, /calaContextPacks/);
  assert.match(analyticsHelper, /pixVersePromoBriefs/);
  assert.match(receiptPage, /I called it/);
  assert.match(receiptPage, /You saw it first/);
  assert.match(receiptPage, /\/receipt\/\$\{id\}\/promo/);
  assert.match(receiptPage, /sticky bottom-2 z-20/);
  assert.match(receiptPage, /max-w-2xl overflow-hidden/);
  assert.match(receiptPage, /\[overflow-wrap:anywhere\]/);
  assert.match(receiptPage, /grid min-w-0 gap-2 overflow-hidden/);
  assert.match(receiptPage, /Back to vota\.wtf/);
  assert.match(receiptPage, /readReceiptStoreData\(id\)/);
  assert.match(receiptPage, /eventSlugForReceipt\(store, receipt\)/);
  assert.match(receiptPage, /href=\{`\/e\/\$\{eventSlug\}`\}/);
  assert.doesNotMatch(receiptPage, /readDataStore/);
  assert.match(dataLayer, /const participantId = directAction\?\.participantId \|\| receiptId/);
  assert.match(dataLayer, /select=id&event_id=eq/);
  assert.match(dataLayer, /if \(!isUuid\(receiptId\)\) return emptyDataStore\(\)/);
  assert.match(predictionPanel, /Share your "I called it" receipt/);
  assert.match(receiptPromoPage, /buildReceiptPromo/);
  assert.match(receiptPromoPage, /readReceiptStoreData\(id\)/);
  assert.match(receiptPromoPage, /const eventSlug = promo\.eventSlug/);
  assert.match(receiptPromoPage, /href=\{`\/e\/\$\{eventSlug\}`\}/);
  assert.doesNotMatch(receiptPromoPage, /readDataStore/);
  assert.match(receiptPromoPage, /promo-frame/);
  assert.match(receiptPromoPage, /promo-frame min-w-0 overflow-hidden/);
  assert.match(receiptPromoPage, /\[overflow-wrap:anywhere\]/);
  assert.match(receiptPromoPage, /grid min-w-0 gap-2 overflow-hidden/);
  assert.match(receiptPromoPage, /sm:min-h-\[560px\]/);
  assert.match(receiptPromoPage, /Back to vota\.wtf/);
  assert.match(promoHelper, /eventSlugForReceipt/);
  assert.match(promoHelper, /eventSlug: string/);
  assert.match(promoHelper, /event\.slug === DEFAULT_EVENT_SLUG/);
  assert.match(promoHelper, /const eventName = store\.events\.find/);
  assert.match(promoHelper, /I locked my \$\{eventName\} take on vota\.wtf/);
  assert.match(promoHelper, /Start with a \$\{eventName\} stage signal/);
  assert.doesNotMatch(promoHelper, /MEGATHON stage signal/);
  assert.match(promoHelper, /pixVersePrompt/);
});

test("receipt pages expose native share and clipboard fallback", () => {
  assert.match(receiptPage, /ShareReceiptButton/);
  assert.match(receiptPromoPage, /ShareReceiptButton/);
  assert.match(shareReceiptButton, /navigator\.share/);
  assert.match(shareReceiptButton, /navigator\.clipboard\.writeText/);
  assert.match(shareReceiptButton, /grid min-w-0 gap-2/);
  assert.match(shareReceiptButton, /w-full min-w-0/);
  assert.match(shareReceiptButton, /\[overflow-wrap:anywhere\]/);
  assert.match(shareReceiptButton, /Share receipt/);
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
