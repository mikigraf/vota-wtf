create unique index if not exists one_void_refund_per_participant_market
  on ledger_entries (participant_id, market_id)
  where type = 'void_refund' and market_id is not null;

drop function if exists void_market_tx(uuid);

create or replace function recompute_oracle_scores_tx()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_market markets%rowtype;
  v_position positions%rowtype;
  v_action prediction_actions%rowtype;
  v_score integer;
  v_opened timestamptz;
  v_resolved timestamptz;
  v_duration numeric;
  v_progress numeric;
  v_popularity numeric;
  v_early numeric;
  v_contrarian numeric;
  v_last_switch_at timestamptz;
begin
  perform pg_advisory_xact_lock(724118991042);

  for v_participant in select * from participants loop
    v_score := 0;
    for v_market in
      select *
      from markets
      where status = 'resolved' and resolved_outcome_id is not null
    loop
      select * into v_position
      from positions
      where participant_id = v_participant.id and market_id = v_market.id;
      if not found or v_position.outcome_id <> v_market.resolved_outcome_id then
        continue;
      end if;

      select max(created_at) into v_last_switch_at
      from prediction_actions
      where participant_id = v_participant.id
        and market_id = v_market.id
        and action_type = 'switch'
        and outcome_id = v_market.resolved_outcome_id;

      v_opened := coalesce(v_market.opened_at, v_market.created_at);
      v_resolved := coalesce(v_market.resolved_at, now());
      v_duration := greatest(60, extract(epoch from (v_resolved - v_opened)));

      for v_action in
        select *
        from prediction_actions
        where participant_id = v_participant.id
          and market_id = v_market.id
          and action_type <> 'admin_void'
          and outcome_id = v_market.resolved_outcome_id
          and signal_credits > 0
          and (v_last_switch_at is null or created_at >= v_last_switch_at)
        order by created_at
      loop
        v_progress := least(1, greatest(0, extract(epoch from (v_action.created_at - v_opened)) / v_duration));
        v_popularity := coalesce((v_action.people_signal_snapshot ->> v_market.resolved_outcome_id::text)::numeric, 0);
        v_early := least(2, greatest(1, 1 + (1 - v_progress)));
        v_contrarian := least(2.5, greatest(1, 1 + (1 - v_popularity) * 1.5));
        v_score := v_score + round(v_action.signal_credits * v_early * v_contrarian)::integer;
      end loop;
    end loop;
    update participants set oracle_score = v_score where id = v_participant.id;
  end loop;
end;
$$;

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
  v_refund_count integer := 0;
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

  update markets
  set status = 'voided',
      voided_at = v_now,
      updated_at = v_now
  where id = p_market_id
  returning * into v_market;

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
      v_now
    );

    insert into ledger_entries (participant_id, type, amount_credits, reason, market_id, created_at)
    values (v_position.participant_id, 'void_refund', v_position.raw_credits, 'Voided prediction refund: ' || v_market.title, p_market_id, v_now)
    on conflict (participant_id, market_id) where type = 'void_refund' and market_id is not null do nothing;

    update positions
    set raw_credits = 0,
        signal_credits = 0,
        fee_credits = 0,
        updated_at = v_now
    where id = v_position.id;

    v_refund_count := v_refund_count + 1;
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

revoke execute on function recompute_oracle_scores_tx() from public, anon, authenticated;
revoke execute on function void_market_tx(uuid, text) from public, anon, authenticated;

grant execute on function recompute_oracle_scores_tx() to service_role;
grant execute on function void_market_tx(uuid, text) to service_role;
