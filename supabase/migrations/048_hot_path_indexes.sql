create index if not exists positions_market_signal_idx
  on positions (market_id, outcome_id)
  include (participant_id, signal_credits, raw_credits)
  where signal_credits > 0;

create index if not exists prediction_actions_market_created_idx
  on prediction_actions (market_id, created_at);

create index if not exists participant_sessions_participant_active_idx
  on participant_sessions (participant_id, expires_at desc, created_at desc);

alter function readiness_contract_tx() rename to readiness_contract_tx_v047;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_positions_market_signal_index boolean := false;
  v_prediction_actions_market_created_index boolean := false;
  v_participant_sessions_participant_active_index boolean := false;
  v_ok boolean := false;
begin
  select readiness_contract_tx_v047() into v_contract;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'positions_market_signal_idx'
  ) into v_positions_market_signal_index;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'prediction_actions_market_created_idx'
  ) into v_prediction_actions_market_created_index;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'participant_sessions_participant_active_idx'
  ) into v_participant_sessions_participant_active_index;

  v_ok := coalesce((v_contract ->> 'ok')::boolean, false)
    and v_positions_market_signal_index
    and v_prediction_actions_market_created_index
    and v_participant_sessions_participant_active_index;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '048_hot_path_indexes',
      'positionsMarketSignalIndex', v_positions_market_signal_index,
      'predictionActionsMarketCreatedIndex', v_prediction_actions_market_created_index,
      'participantSessionsParticipantActiveIndex', v_participant_sessions_participant_active_index,
      'ok', v_ok
    );
end;
$$;

revoke execute on function readiness_contract_tx_v047() from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function readiness_contract_tx_v047() to service_role;
grant execute on function readiness_contract_tx() to service_role;
