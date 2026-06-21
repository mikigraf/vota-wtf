create or replace function delete_market_tx(p_market_id uuid, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_event events%rowtype;
  v_fallback_market_id uuid;
  v_participants_affected integer := 0;
  v_agent_runs_deleted integer := 0;
  v_prediction_actions_deleted integer := 0;
  v_ledger_entries_deleted integer := 0;
  v_positions_deleted integer := 0;
  v_outcomes_deleted integer := 0;
begin
  perform pg_advisory_xact_lock(724118991042);

  select * into v_market
  from markets
  where id = p_market_id
  for update;
  if not found then
    raise exception 'Market not found.';
  end if;

  select * into v_event
  from events
  where id = v_market.event_id
  for update;

  select count(distinct participant_id)::integer
  into v_participants_affected
  from (
    select participant_id from positions where market_id = p_market_id
    union
    select participant_id from ledger_entries where market_id = p_market_id
  ) affected;

  perform 1
  from wallets
  where participant_id in (
    select participant_id from positions where market_id = p_market_id
    union
    select participant_id from ledger_entries where market_id = p_market_id
  )
  order by participant_id
  for update;

  if exists (
    with reversals as (
      select
        participant_id,
        coalesce(sum(
          case
            when direction = 'debit' then -abs(amount_credits)
            when direction = 'credit' then abs(amount_credits)
            else amount_credits
          end
        ), 0)::integer as balance_effect
      from ledger_entries
      where market_id = p_market_id
      group by participant_id
    )
    select 1
    from wallets w
    join reversals r on r.participant_id = w.participant_id
    where w.balance_credits - r.balance_effect < 0
  ) then
    raise exception 'Cannot delete this market because reversing its ledger would overdraw a wallet.';
  end if;

  with reversals as (
    select
      participant_id,
      coalesce(sum(
        case
          when direction = 'debit' then -abs(amount_credits)
          when direction = 'credit' then abs(amount_credits)
          else amount_credits
        end
      ), 0)::integer as balance_effect
    from ledger_entries
    where market_id = p_market_id
    group by participant_id
  )
  update wallets w
  set balance_credits = w.balance_credits - r.balance_effect
  from reversals r
  where r.participant_id = w.participant_id;

  if v_event.id is not null and v_event.featured_market_id = p_market_id then
    v_fallback_market_id := stage_fallback_market_id(v_event.id, v_event.stage_mode, p_market_id);
    update events
    set featured_market_id = v_fallback_market_id,
        stage_mode = case
          when v_fallback_market_id is null and stage_mode <> 'leaderboard' then 'join'
          else stage_mode
        end
    where id = v_event.id;
  end if;

  delete from agent_runs where market_id = p_market_id;
  get diagnostics v_agent_runs_deleted = ROW_COUNT;

  delete from prediction_actions where market_id = p_market_id;
  get diagnostics v_prediction_actions_deleted = ROW_COUNT;

  delete from ledger_entries where market_id = p_market_id;
  get diagnostics v_ledger_entries_deleted = ROW_COUNT;

  delete from positions where market_id = p_market_id;
  get diagnostics v_positions_deleted = ROW_COUNT;

  delete from market_aggregates where market_id = p_market_id;

  delete from outcomes where market_id = p_market_id;
  get diagnostics v_outcomes_deleted = ROW_COUNT;

  delete from markets where id = p_market_id;

  update wallets w
  set total_committed_credits = coalesce((
    select sum(p.raw_credits)::integer
    from positions p
    join markets m on m.id = p.market_id
    where p.participant_id = w.participant_id
      and m.status in ('open', 'locked')
  ), 0);

  perform recompute_oracle_scores_tx();

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values (
    'delete_market',
    'market',
    p_market_id::text,
    jsonb_build_object(
      'title', v_market.title,
      'eventId', v_market.event_id,
      'status', v_market.status,
      'participantsAffected', v_participants_affected,
      'agentRunsDeleted', v_agent_runs_deleted,
      'predictionActionsDeleted', v_prediction_actions_deleted,
      'ledgerEntriesDeleted', v_ledger_entries_deleted,
      'positionsDeleted', v_positions_deleted,
      'outcomesDeleted', v_outcomes_deleted
    ),
    p_ip
  );

  return jsonb_build_object(
    'market', to_jsonb(v_market),
    'participantsAffected', v_participants_affected,
    'agentRunsDeleted', v_agent_runs_deleted,
    'predictionActionsDeleted', v_prediction_actions_deleted,
    'ledgerEntriesDeleted', v_ledger_entries_deleted,
    'positionsDeleted', v_positions_deleted,
    'outcomesDeleted', v_outcomes_deleted
  );
end;
$$;

revoke execute on function delete_market_tx(uuid, text) from public, anon, authenticated;
grant execute on function delete_market_tx(uuid, text) to service_role;
