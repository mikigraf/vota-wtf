create or replace function market_prediction_lock_key(p_market_id uuid)
returns integer
language sql
immutable
security definer
set search_path = public
as $$
  select hashtext(p_market_id::text);
$$;

create or replace function place_prediction_serialized_tx(
  p_session_id uuid,
  p_market_id uuid,
  p_outcome_id uuid,
  p_amount_credits integer,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(724118991, market_prediction_lock_key(p_market_id));
  return place_prediction_tx(p_session_id, p_market_id, p_outcome_id, p_amount_credits, p_request_id);
end;
$$;

create or replace function place_agent_prediction_serialized_tx(
  p_participant_id uuid,
  p_market_id uuid,
  p_outcome_id uuid,
  p_amount_credits integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(724118991, market_prediction_lock_key(p_market_id));
  return place_agent_prediction_tx(p_participant_id, p_market_id, p_outcome_id, p_amount_credits);
end;
$$;

create or replace function create_or_reuse_pending_purchase_tx(
  p_participant_id uuid,
  p_purchase_id uuid
)
returns purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_purchase purchases%rowtype;
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found.';
  end if;

  select * into v_purchase
  from purchases
  where participant_id = p_participant_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if found then
    return v_purchase;
  end if;

  insert into purchases (id, participant_id, status, amount_eur, currency, credits, created_at)
  values (p_purchase_id, p_participant_id, 'pending', 1.00, 'EUR', 100, now())
  returning * into v_purchase;

  return v_purchase;
end;
$$;

with ranked_pending as (
  select
    id,
    row_number() over (
      partition by participant_id
      order by (checkout_url is not null) desc, created_at desc, id desc
    ) as pending_rank
  from purchases
  where status = 'pending'
)
update purchases
set status = 'canceled'
where id in (
  select id from ranked_pending where pending_rank > 1
);

create unique index if not exists one_pending_purchase_per_participant
  on purchases (participant_id)
  where status = 'pending';

create or replace function public_leaderboard_tx(p_event_slug text)
returns table (
  id uuid,
  nickname text,
  role text,
  participant_type text,
  avatar_url text,
  oracle_score integer,
  predictions integer,
  correct_markets integer,
  efficiency numeric,
  early_score integer,
  contrarian_score integer
)
language sql
stable
security definer
set search_path = public
as $$
with event_scope as (
  select id
  from events
  where slug = p_event_slug
),
participant_scope as (
  select p.*
  from participants p
  join event_scope e on e.id = p.event_id
  where not p.is_banned
),
prediction_counts as (
  select
    pa.participant_id,
    count(*)::integer as predictions,
    coalesce(sum(greatest(pa.amount_credits, 0)), 0)::numeric as lifetime_committed
  from prediction_actions pa
  join participant_scope p on p.id = pa.participant_id
  where pa.action_type <> 'admin_void'
  group by pa.participant_id
),
correct_positions as (
  select pos.participant_id, pos.market_id
  from positions pos
  join participant_scope p on p.id = pos.participant_id
  join markets m on m.id = pos.market_id
  where m.status = 'resolved'
    and m.resolved_outcome_id is not null
    and pos.outcome_id = m.resolved_outcome_id
),
correct_counts as (
  select participant_id, count(*)::integer as correct_markets
  from correct_positions
  group by participant_id
),
base_actions as (
  select
    pa.*,
    m.opened_at,
    m.created_at as market_created_at,
    m.resolved_at,
    m.resolved_outcome_id,
    max(pa.created_at) filter (
      where pa.action_type = 'switch'
        and pa.outcome_id = m.resolved_outcome_id
    ) over (partition by pa.participant_id, pa.market_id) as last_switch_to_winner
  from prediction_actions pa
  join correct_positions cp on cp.participant_id = pa.participant_id and cp.market_id = pa.market_id
  join markets m on m.id = pa.market_id
  where pa.action_type <> 'admin_void'
),
scoreable_actions as (
  select
    participant_id,
    signal_credits,
    least(
      1,
      greatest(
        0,
        extract(epoch from (created_at - coalesce(opened_at, market_created_at))) * 1000
        / nullif(greatest(60000, extract(epoch from (coalesce(resolved_at, now()) - coalesce(opened_at, market_created_at))) * 1000), 0)
      )
    ) as progress,
    least(
      1,
      greatest(
        0,
        coalesce(
          (stage_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          (people_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          0
        )
      )
    ) as popularity
  from base_actions
  where outcome_id = resolved_outcome_id
    and signal_credits > 0
    and (last_switch_to_winner is null or created_at >= last_switch_to_winner)
),
score_sums as (
  select
    participant_id,
    round(sum(signal_credits * (1 - progress)))::integer as early_score,
    round(sum(signal_credits * (1 - popularity)))::integer as contrarian_score
  from scoreable_actions
  group by participant_id
)
select
  p.id,
  p.nickname,
  p.role,
  p.participant_type,
  case when p.is_avatar_hidden then null else p.avatar_url end as avatar_url,
  p.oracle_score,
  coalesce(pc.predictions, 0)::integer as predictions,
  coalesce(cc.correct_markets, 0)::integer as correct_markets,
  case
    when coalesce(pc.lifetime_committed, 0) > 0 then p.oracle_score::numeric / pc.lifetime_committed
    else p.oracle_score::numeric
  end as efficiency,
  coalesce(ss.early_score, 0)::integer as early_score,
  coalesce(ss.contrarian_score, 0)::integer as contrarian_score
from participant_scope p
left join prediction_counts pc on pc.participant_id = p.id
left join correct_counts cc on cc.participant_id = p.id
left join score_sums ss on ss.participant_id = p.id
order by p.oracle_score desc, efficiency desc, p.nickname asc;
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
    to_regprocedure('update_participant_profile_tx(uuid,text,text,text)') is not null as profile_lock_rpc,
    to_regprocedure('resolve_market_tx(uuid,uuid,text,text)') is not null as pool_settlement_rpc,
    to_regprocedure('void_market_tx(uuid,text)') is not null as void_market_rpc,
    to_regprocedure('transition_market_tx(uuid,text,text)') is not null as transition_market_rpc,
    to_regprocedure('market_signal_snapshot(uuid)') is not null as market_signals_rpc,
    to_regprocedure('market_prediction_lock_key(uuid)') is not null as prediction_lock_helper_rpc,
    to_regprocedure('place_prediction_serialized_tx(uuid,uuid,uuid,integer,text)') is not null as prediction_serialized_rpc,
    to_regprocedure('place_agent_prediction_serialized_tx(uuid,uuid,uuid,integer)') is not null as agent_prediction_serialized_rpc,
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
  'contractVersion', '034_prediction_serialization_readiness',
  'checkoutIntentsTable', checkout_intents_table,
  'checkoutIntentRecordRpc', checkout_intent_record_rpc,
  'checkoutIntentLinkRpc', checkout_intent_link_rpc,
  'pendingPurchaseRpc', pending_purchase_rpc,
  'profileLockRpc', profile_lock_rpc,
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

revoke execute on function market_prediction_lock_key(uuid) from public, anon, authenticated;
revoke execute on function place_prediction_serialized_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function place_agent_prediction_serialized_tx(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function create_or_reuse_pending_purchase_tx(uuid, uuid) from public, anon, authenticated;
revoke execute on function public_leaderboard_tx(text) from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function market_prediction_lock_key(uuid) to service_role;
grant execute on function place_prediction_serialized_tx(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function place_agent_prediction_serialized_tx(uuid, uuid, uuid, integer) to service_role;
grant execute on function create_or_reuse_pending_purchase_tx(uuid, uuid) to service_role;
grant execute on function public_leaderboard_tx(text) to service_role;
grant execute on function readiness_contract_tx() to service_role;
