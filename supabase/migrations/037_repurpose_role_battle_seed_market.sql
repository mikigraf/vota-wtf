update markets
set
  title = 'Which moment gets the loudest reaction?',
  description = 'The room calls the ceremony moment that will make the audience erupt first.',
  category = 'Audience pulse',
  image_url = '/demo-signal.svg',
  status = 'open',
  show_on_stage = false,
  opened_at = coalesce(opened_at, now()),
  resolution_rule = 'Resolved by the host based on the loudest in-room reaction during the ceremony.',
  updated_at = now()
where id = '00000000-0000-4000-8000-000000000103';

update outcomes
set label = 'Winner reveal', icon = 'WR'
where id = '00000000-0000-4000-8000-000000000207';

update outcomes
set label = 'Demo surprise', icon = 'DS'
where id = '00000000-0000-4000-8000-000000000208';

update outcomes
set label = 'Founder cameo', icon = 'FC'
where id = '00000000-0000-4000-8000-000000000209';

update outcomes
set label = 'Crowd upset', icon = 'CU'
where id = '00000000-0000-4000-8000-000000000210';

create or replace function readiness_contract_tx()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with contract as (
  select
    to_regclass('public.checkout_intents') is not null as checkout_intents_table,
    to_regprocedure('record_checkout_intent_tx(uuid,uuid)') is not null as checkout_intent_record_rpc,
    to_regprocedure('link_checkout_intent_purchase_tx(uuid,uuid)') is not null as checkout_intent_link_rpc,
    to_regprocedure('create_or_reuse_pending_purchase_tx(uuid,uuid)') is not null as pending_purchase_rpc,
    to_regprocedure('update_participant_profile_tx(uuid,text,text,text,text)') is not null as profile_lock_rpc,
    to_regprocedure('resolve_market_tx(uuid,uuid,text,text)') is not null as pool_settlement_rpc,
    to_regprocedure('void_market_tx(uuid,text)') is not null as void_market_rpc,
    to_regprocedure('transition_market_tx(uuid,text,text)') is not null as transition_market_rpc,
    to_regprocedure('market_signal_snapshot(uuid)') is not null as market_signals_rpc,
    to_regprocedure('market_prediction_lock_key(uuid)') is not null as prediction_lock_helper_rpc,
    to_regprocedure('place_prediction_serialized_tx(uuid,uuid,uuid,integer,text)') is not null as prediction_serialized_rpc,
    to_regprocedure('place_agent_prediction_serialized_tx(uuid,uuid,uuid,integer)') is not null as agent_prediction_serialized_rpc,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'participants' and column_name = 'email'
    ) as participant_email_column,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'participants_event_human_nickname_unique_idx'
    ) as participant_unique_name_index,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'prediction_actions' and column_name = 'request_id'
    ) as prediction_idempotency_column,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'prediction_actions_request_id_unique_idx'
    ) as prediction_request_unique_index,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'one_resolution_credit_per_participant_market'
    ) as resolution_credit_unique_index,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'one_void_refund_per_participant_market'
    ) as void_refund_unique_index,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'one_pending_purchase_per_participant'
    ) as pending_purchase_unique_index,
    exists (
      select 1 from pg_trigger
      where tgname = 'positions_participant_market_same_event'
    ) as positions_same_event_trigger,
    exists (
      select 1 from pg_trigger
      where tgname = 'prediction_actions_participant_market_same_event'
    ) as prediction_actions_same_event_trigger,
    exists (
      select 1 from pg_trigger
      where tgname = 'events_stage_feature_normalize'
    ) as stage_feature_normalize_trigger,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'balance_after'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'metadata'
    ) as ledger_settlement_columns,
    exists (
      select 1
      from markets
      where id = '00000000-0000-4000-8000-000000000103'
        and title = 'Which moment gets the loudest reaction?'
        and category = 'Audience pulse'
        and status = 'open'
        and show_on_stage = false
    ) and exists (
      select 1
      from outcomes
      where id = '00000000-0000-4000-8000-000000000207'
        and label = 'Winner reveal'
    ) as repurposed_seed_market
)
select jsonb_build_object(
  'contractVersion', '037_repurpose_role_battle_seed_market',
  'checkoutIntentsTable', checkout_intents_table,
  'checkoutIntentRecordRpc', checkout_intent_record_rpc,
  'checkoutIntentLinkRpc', checkout_intent_link_rpc,
  'pendingPurchaseRpc', pending_purchase_rpc,
  'profileLockRpc', profile_lock_rpc,
  'participantEmailColumn', participant_email_column,
  'participantUniqueNameIndex', participant_unique_name_index,
  'poolSettlementRpc', pool_settlement_rpc,
  'voidMarketRpc', void_market_rpc,
  'transitionMarketRpc', transition_market_rpc,
  'marketSignalsRpc', market_signals_rpc,
  'predictionLockHelperRpc', prediction_lock_helper_rpc,
  'predictionSerializedRpc', prediction_serialized_rpc,
  'agentPredictionSerializedRpc', agent_prediction_serialized_rpc,
  'predictionIdempotencyColumn', prediction_idempotency_column,
  'predictionRequestUniqueIndex', prediction_request_unique_index,
  'resolutionCreditUniqueIndex', resolution_credit_unique_index,
  'voidRefundUniqueIndex', void_refund_unique_index,
  'pendingPurchaseUniqueIndex', pending_purchase_unique_index,
  'positionsSameEventTrigger', positions_same_event_trigger,
  'predictionActionsSameEventTrigger', prediction_actions_same_event_trigger,
  'stageFeatureNormalizeTrigger', stage_feature_normalize_trigger,
  'ledgerSettlementColumns', ledger_settlement_columns,
  'repurposedSeedMarket', repurposed_seed_market,
  'ok',
    checkout_intents_table
    and checkout_intent_record_rpc
    and checkout_intent_link_rpc
    and pending_purchase_rpc
    and profile_lock_rpc
    and participant_email_column
    and participant_unique_name_index
    and pool_settlement_rpc
    and void_market_rpc
    and transition_market_rpc
    and market_signals_rpc
    and prediction_lock_helper_rpc
    and prediction_serialized_rpc
    and agent_prediction_serialized_rpc
    and prediction_idempotency_column
    and prediction_request_unique_index
    and resolution_credit_unique_index
    and void_refund_unique_index
    and pending_purchase_unique_index
    and positions_same_event_trigger
    and prediction_actions_same_event_trigger
    and stage_feature_normalize_trigger
    and ledger_settlement_columns
    and repurposed_seed_market
)
from contract;
$$;

revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
