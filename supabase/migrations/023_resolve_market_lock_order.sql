create or replace function resolve_market_tx(p_market_id uuid, p_outcome_id uuid, p_note text default '', p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_outcome outcomes%rowtype;
  v_position positions%rowtype;
  v_wallet wallets%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(trim(p_note), ''), 'Resolved by organizer/admin.');
  v_settlement_inserted integer := 0;
  v_settled_count integer := 0;
  v_settled_credits integer := 0;
  v_balance_after integer := 0;
begin
  perform pg_advisory_xact_lock(724118991042);

  perform 1
  from participants
  where id in (
    select participant_id
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0
  )
  order by id
  for update;

  perform 1
  from wallets
  where participant_id in (
    select participant_id
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0
  )
  order by participant_id
  for update;

  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'Resolution target not found'; end if;
  select * into v_outcome from outcomes where id = p_outcome_id and market_id = p_market_id;
  if not found then raise exception 'Resolution target not found'; end if;
  if v_market.status <> 'locked' then raise exception 'Only locked markets can be resolved.'; end if;

  perform stamp_market_closing_stage(p_market_id);

  update markets
  set status = 'resolved', resolved_outcome_id = p_outcome_id, resolution_note = v_note,
      show_on_stage = true, resolved_at = v_now, locked_at = coalesce(locked_at, v_now), updated_at = v_now
  where id = p_market_id
  returning * into v_market;

  update events set stage_mode = 'resolution', featured_market_id = p_market_id where id = v_market.event_id;

  for v_position in
    select * from positions where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0 for update
  loop
    select * into v_wallet from wallets where participant_id = v_position.participant_id for update;
    if not found then raise exception 'Wallet not found.'; end if;
    v_balance_after := v_wallet.balance_credits + v_position.raw_credits;

    insert into ledger_entries (participant_id, type, amount_credits, direction, balance_after, reason, market_id, created_at, metadata)
    values (
      v_position.participant_id, 'resolution_credit', v_position.raw_credits, 'credit', v_balance_after,
      'Resolved prediction credit: ' || v_market.title, p_market_id, v_now, jsonb_build_object('outcomeId', p_outcome_id)
    )
    on conflict (participant_id, market_id) where type = 'resolution_credit' and market_id is not null do nothing;

    get diagnostics v_settlement_inserted = ROW_COUNT;
    if v_settlement_inserted > 0 then
      update wallets
      set balance_credits = v_balance_after
      where participant_id = v_position.participant_id
      returning * into v_wallet;
      v_settled_count := v_settled_count + 1;
      v_settled_credits := v_settled_credits + v_position.raw_credits;
    end if;
  end loop;

  perform recompute_oracle_scores_tx();
  v_aggregate := recompute_market_aggregate(p_market_id);
  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('resolve_market', 'market', p_market_id::text, jsonb_build_object('outcomeId', p_outcome_id, 'note', v_note, 'settledCount', v_settled_count, 'settledCredits', v_settled_credits), p_ip);
  return jsonb_build_object('market', to_jsonb(v_market), 'aggregate', to_jsonb(v_aggregate), 'settledCount', v_settled_count, 'settledCredits', v_settled_credits);
end;
$$;

revoke execute on function resolve_market_tx(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function resolve_market_tx(uuid, uuid, text, text) to service_role;
