with renames(old_name, new_name) as (
  values
    ('Builder Agent', 'Signal Scout'),
    ('Sponsor Agent', 'Momentum Scout'),
    ('Investor Agent', 'Value Scout')
),
updated_agents as (
  update agent_profiles agent
  set name = renames.new_name
  from renames
  where agent.name = renames.old_name
    and not exists (
      select 1
      from agent_profiles existing
      where existing.event_id = agent.event_id
        and existing.name = renames.new_name
    )
  returning agent.participant_id, agent.name
)
update participants participant
set nickname = updated_agents.name
from updated_agents
where participant.id = updated_agents.participant_id;

create or replace function ensure_house_agents_tx(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_definition record;
  v_participant participants%rowtype;
  v_agent agent_profiles%rowtype;
  v_now timestamptz := now();
  v_agents jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(724118991044);

  select * into v_event
  from events
  where slug = p_event_slug
  for update;
  if not found then
    raise exception 'Unknown event: %', p_event_slug;
  end if;

  for v_definition in
    select *
    from (values
      ('Signal Scout', 'Builder Agent', 'builder', 'builder_bias'),
      ('Momentum Scout', 'Sponsor Agent', 'sponsor', 'sponsor_bias'),
      ('Value Scout', 'Investor Agent', 'investor', 'investor_bias'),
      ('Skeptic Agent', null, 'other', 'skeptic'),
      ('Chaos Agent', null, 'other', 'chaos')
    ) as definitions(name, old_name, role, strategy)
  loop
    select * into v_agent
    from agent_profiles
    where event_id = v_event.id
      and (name = v_definition.name or name = v_definition.old_name)
    order by case when name = v_definition.name then 0 else 1 end
    limit 1;

    if found then
      update agent_profiles
      set name = v_definition.name
      where id = v_agent.id
      returning * into v_agent;

      update participants
      set nickname = v_definition.name
      where id = v_agent.participant_id;
    else
      insert into participants (event_id, participant_type, nickname, role, is_avatar_hidden, is_banned, oracle_score, created_at)
      values (v_event.id, 'house_agent', v_definition.name, v_definition.role, false, false, 0, v_now)
      returning * into v_participant;

      insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
      values (v_participant.id, 1000, 1000, 0);

      insert into agent_profiles (event_id, participant_id, name, strategy, created_at)
      values (v_event.id, v_participant.id, v_definition.name, v_definition.strategy, v_now)
      on conflict (event_id, name) do update set name = excluded.name
      returning * into v_agent;
    end if;

    v_agents := v_agents || to_jsonb(v_agent);
  end loop;

  return jsonb_build_object('agents', v_agents);
end;
$$;

revoke execute on function ensure_house_agents_tx(text) from public, anon, authenticated;
grant execute on function ensure_house_agents_tx(text) to service_role;

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
    ) as repurposed_seed_market,
    not exists (
      select 1
      from agent_profiles
      where name in ('Builder Agent', 'Sponsor Agent', 'Investor Agent')
    ) as neutral_house_agent_names
)
select jsonb_build_object(
  'contractVersion', '038_neutral_house_agent_names',
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
  'neutralHouseAgentNames', neutral_house_agent_names,
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
    and neutral_house_agent_names
)
from contract;
$$;

revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
