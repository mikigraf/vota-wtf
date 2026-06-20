create or replace function void_market_tx(p_market_id uuid, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_position positions%rowtype;
  v_wallet wallets%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_people_snapshot jsonb := '{}'::jsonb;
  v_credit_snapshot jsonb := '{}'::jsonb;
  v_conviction_snapshot jsonb := '{}'::jsonb;
  v_stage_snapshot jsonb := '{}'::jsonb;
  v_refund_count integer := 0;
  v_refund_inserted integer := 0;
  v_fallback_market_id uuid;
begin
  perform pg_advisory_xact_lock(724118991042);

  perform 1
  from participants
  where id in (
    select participant_id
    from positions
    where market_id = p_market_id and raw_credits > 0
  )
  order by id
  for update;

  perform 1
  from wallets
  where participant_id in (
    select participant_id
    from positions
    where market_id = p_market_id and raw_credits > 0
  )
  order by participant_id
  for update;

  select * into v_market
  from markets
  where id = p_market_id
  for update;
  if not found then
    raise exception 'Market not found';
  end if;

  if v_market.status = 'resolved' then
    raise exception 'Resolved markets cannot be voided.';
  end if;

  if v_market.status = 'voided' then
    select * into v_aggregate from market_aggregates where market_id = p_market_id;
    return jsonb_build_object(
      'market', to_jsonb(v_market),
      'aggregate', to_jsonb(v_aggregate),
      'voided', false,
      'refundCount', 0
    );
  end if;

  perform recompute_market_aggregate(p_market_id);
  select * into v_aggregate
  from market_aggregates
  where market_id = p_market_id
  for update;

  select coalesce(jsonb_object_agg(o.id::text, case when v_aggregate.total_people > 0 then coalesce((v_aggregate.outcome_people_counts ->> o.id::text)::numeric, 0) / v_aggregate.total_people else 0 end), '{}'::jsonb)
  into v_people_snapshot
  from outcomes o
  where o.market_id = p_market_id;

  select coalesce(jsonb_object_agg(o.id::text, case when v_aggregate.total_signal_credits > 0 then coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::numeric, 0) / v_aggregate.total_signal_credits else 0 end), '{}'::jsonb)
  into v_credit_snapshot
  from outcomes o
  where o.market_id = p_market_id;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_stage_snapshot
  from jsonb_each(coalesce((market_signal_snapshot(p_market_id) -> 'stage'), '{}'::jsonb));

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_conviction_snapshot
  from jsonb_each(coalesce((market_signal_snapshot(p_market_id) -> 'conviction'), '{}'::jsonb));

  update markets
  set status = 'voided',
      show_on_stage = false,
      voided_at = v_now,
      updated_at = v_now
  where id = p_market_id
  returning * into v_market;

  select id into v_fallback_market_id
  from markets
  where event_id = v_market.event_id
    and id <> p_market_id
    and status <> 'draft'
    and status <> 'voided'
    and show_on_stage
  order by created_at asc
  limit 1;

  update events
  set featured_market_id = v_fallback_market_id,
      stage_mode = case when v_fallback_market_id is null and stage_mode <> 'leaderboard' then 'join' else stage_mode end
  where id = v_market.event_id
    and featured_market_id = p_market_id;

  for v_position in
    select *
    from positions
    where market_id = p_market_id and raw_credits > 0
    for update
  loop
    update wallets
    set balance_credits = balance_credits + v_position.raw_credits,
        total_committed_credits = greatest(0, total_committed_credits - v_position.raw_credits)
    where participant_id = v_position.participant_id
    returning * into v_wallet;
    if not found then
      raise exception 'Wallet not found.';
    end if;

    insert into prediction_actions (
      participant_id,
      market_id,
      outcome_id,
      action_type,
      amount_credits,
      signal_credits,
      fee_credits,
      people_signal_snapshot,
      credit_signal_snapshot,
      conviction_signal_snapshot,
      stage_signal_snapshot,
      created_at
    )
    values (
      v_position.participant_id,
      p_market_id,
      v_position.outcome_id,
      'admin_void',
      0,
      0,
      0,
      v_people_snapshot,
      v_credit_snapshot,
      v_conviction_snapshot,
      v_stage_snapshot,
      v_now
    );

    insert into ledger_entries (
      participant_id,
      type,
      amount_credits,
      direction,
      balance_after,
      reason,
      market_id,
      created_at,
      metadata
    )
    values (
      v_position.participant_id,
      'void_refund',
      v_position.raw_credits,
      'credit',
      v_wallet.balance_credits,
      'Voided prediction refund: ' || v_market.title,
      p_market_id,
      v_now,
      jsonb_build_object('outcomeId', v_position.outcome_id)
    )
    on conflict (participant_id, market_id) where type = 'void_refund' and market_id is not null do nothing;

    get diagnostics v_refund_inserted = ROW_COUNT;
    if v_refund_inserted > 0 then
      v_refund_count := v_refund_count + 1;
    end if;

    update positions
    set raw_credits = 0,
        signal_credits = 0,
        fee_credits = 0,
        updated_at = v_now
    where id = v_position.id;
  end loop;

  perform recompute_market_aggregate(p_market_id);
  perform recompute_oracle_scores_tx();
  select * into v_aggregate from market_aggregates where market_id = p_market_id;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('void_market', 'market', p_market_id::text, jsonb_build_object('title', v_market.title, 'refundCount', v_refund_count), p_ip);

  return jsonb_build_object(
    'market', to_jsonb(v_market),
    'aggregate', to_jsonb(v_aggregate),
    'voided', true,
    'refundCount', v_refund_count
  );
end;
$$;

revoke execute on function void_market_tx(uuid, text) from public, anon, authenticated;
grant execute on function void_market_tx(uuid, text) to service_role;
