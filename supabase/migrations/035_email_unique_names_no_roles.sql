alter table participants
  add column if not exists email text;

create unique index if not exists participants_event_human_nickname_unique_idx
  on participants (event_id, (lower(trim(nickname))))
  where participant_type = 'human'
    and lower(trim(nickname)) <> 'oracle';

create or replace function update_participant_profile_tx(
  p_participant_id uuid,
  p_nickname text,
  p_email text,
  p_role text default 'other',
  p_avatar_url text default null
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_previous_role text;
  v_market_id uuid;
  v_nickname text := trim(coalesce(p_nickname, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := trim(coalesce(p_role, 'other'));
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;

  if v_participant.participant_type = 'human'
    and nullif(trim(v_participant.nickname), '') is not null
    and lower(trim(v_participant.nickname)) <> 'oracle'
    and nullif(trim(coalesce(v_participant.email, '')), '') is not null
  then
    raise exception 'Profile is locked after entering the arena.';
  end if;

  if v_nickname = '' or lower(v_nickname) = 'oracle' then
    raise exception 'Enter a stage name before joining.';
  end if;

  if v_email = '' or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter your email address before joining.';
  end if;

  if exists (
    select 1
    from participants p
    where p.event_id = v_participant.event_id
      and p.id <> v_participant.id
      and p.participant_type = 'human'
      and lower(trim(p.nickname)) = lower(v_nickname)
      and lower(trim(p.nickname)) <> 'oracle'
  ) then
    raise exception 'That stage name is already taken.';
  end if;

  if v_role not in ('builder', 'sponsor', 'investor', 'other') then
    v_role := 'other';
  end if;

  v_previous_role := v_participant.role;
  update participants
  set nickname = v_nickname,
      email = v_email,
      role = v_role,
      avatar_url = coalesce(nullif(p_avatar_url, ''), avatar_url)
  where id = v_participant.id
  returning * into v_participant;

  if v_previous_role is distinct from v_participant.role then
    for v_market_id in
      select distinct market_id
      from positions
      where participant_id = v_participant.id
    loop
      perform recompute_market_aggregate(v_market_id);
    end loop;
  end if;

  return v_participant;
end;
$$;

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
    ) as ledger_settlement_columns
)
select jsonb_build_object(
  'contractVersion', '035_email_unique_names_no_roles',
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
)
from contract;
$$;

revoke execute on function update_participant_profile_tx(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function update_participant_profile_tx(uuid, text, text, text, text) to service_role;
grant execute on function readiness_contract_tx() to service_role;
