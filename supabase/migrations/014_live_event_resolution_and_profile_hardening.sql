create or replace function place_prediction_tx(
  p_session_id uuid,
  p_market_id uuid,
  p_outcome_id uuid,
  p_amount_credits integer,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session participant_sessions%rowtype;
  v_participant participants%rowtype;
  v_wallet wallets%rowtype;
  v_market markets%rowtype;
  v_position positions%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_amount integer := floor(coalesce(p_amount_credits, 0));
  v_request_id text := nullif(left(trim(coalesce(p_request_id, '')), 128), '');
  v_fee integer;
  v_signal integer;
  v_action_type text := 'initial';
  v_fair_launch boolean;
  v_step_cap integer;
  v_allowed integer;
  v_max_share numeric;
  v_current_user_signal integer := 0;
  v_share_max integer := 0;
  v_impact_max integer := 0;
  v_try_amount integer;
  v_try_signal integer;
  v_current_share numeric;
  v_next_share numeric;
  v_existing_outcome_total integer;
  v_snapshots jsonb := '{}'::jsonb;
  v_action prediction_actions%rowtype;
begin
  if v_amount < 0 then raise exception 'Choose a valid MegaBuck amount.'; end if;

  select * into v_session from participant_sessions where id = p_session_id and expires_at > v_now for update;
  if not found then raise exception 'Join the event before predicting.'; end if;
  select * into v_participant from participants where id = v_session.participant_id for update;
  if not found or v_participant.is_banned then raise exception 'This profile is paused by moderation.'; end if;
  if v_participant.participant_type = 'human'
    and (
      nullif(trim(v_participant.nickname), '') is null
      or lower(trim(v_participant.nickname)) = 'oracle'
      or v_participant.role not in ('builder', 'sponsor', 'investor', 'other')
    )
  then
    raise exception 'Finish your profile before predicting.';
  end if;
  select * into v_wallet from wallets where participant_id = v_participant.id for update;
  if not found then raise exception 'Wallet not found.'; end if;
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'This prediction is not open.'; end if;
  if v_participant.event_id <> v_market.event_id then raise exception 'This profile cannot predict in another event.'; end if;

  if v_request_id is not null then
    select * into v_action
    from prediction_actions
    where participant_id = v_participant.id and market_id = p_market_id and request_id = v_request_id
    for update;
    if found then
      if v_action.outcome_id <> p_outcome_id or v_action.amount_credits <> v_amount then
        raise exception 'Idempotency key was already used for a different prediction.';
      end if;
      perform recompute_market_aggregate(p_market_id);
      select * into v_aggregate from market_aggregates where market_id = p_market_id;
      select * into v_position from positions where participant_id = v_participant.id and market_id = p_market_id;
      if not found then raise exception 'Prediction replay could not find the original position.'; end if;
      return jsonb_build_object('position', to_jsonb(v_position), 'action', to_jsonb(v_action), 'aggregate', to_jsonb(v_aggregate), 'wallet', to_jsonb(v_wallet));
    end if;
  end if;

  if v_market.status <> 'open' then raise exception 'This prediction is not open.'; end if;
  if not exists (select 1 from outcomes where id = p_outcome_id and market_id = p_market_id) then raise exception 'Prediction target not found.'; end if;
  if exists (select 1 from events where id = v_market.event_id and emergency_paused) then raise exception 'The arena is paused by the organizer.'; end if;

  perform recompute_market_aggregate(p_market_id);
  select * into v_aggregate from market_aggregates where market_id = p_market_id for update;
  select * into v_position from positions where participant_id = v_participant.id and market_id = p_market_id for update;

  v_fair_launch := v_position.id is null
    and not v_market.fair_launch_override
    and coalesce(v_aggregate.total_people, 0) < coalesce(v_market.fair_launch_people_threshold, 25)
    and coalesce(v_aggregate.total_signal_credits, 0) < coalesce(v_market.fair_launch_signal_credits_threshold, 5000);

  if v_fair_launch and v_amount <> 100 then raise exception 'Fair launch: first prediction is exactly 100 MBucks.'; end if;
  if v_position.id is null and v_amount < 100 then raise exception 'First prediction must be at least 100 MBucks.'; end if;
  if v_position.id is not null and v_position.outcome_id = p_outcome_id and v_amount <= 0 then raise exception 'Choose MegaBucks to add.'; end if;
  if v_position.id is not null and v_position.outcome_id <> p_outcome_id and not v_market.allow_switching then raise exception 'Switching is disabled for this prediction.'; end if;
  if v_position.id is not null and v_now - v_position.last_action_at < interval '30 seconds' then raise exception 'Cooldown active. Try again soon.'; end if;

  v_fee := floor(v_amount * 0.02);
  v_signal := v_amount - v_fee;
  v_step_cap := case when v_position.id is null then v_market.max_action_stake else greatest(100, floor(v_position.raw_credits * 0.5)) end;
  v_current_user_signal := coalesce(v_position.signal_credits, 0);
  v_max_share := case when v_participant.participant_type = 'human' then 0.15 else 0.05 end;

  if v_fair_launch then
    v_share_max := 100;
    v_impact_max := 100;
  elsif coalesce(v_aggregate.total_signal_credits, 0) <= 0 then
    v_share_max := v_market.max_action_stake;
    v_impact_max := v_market.max_action_stake;
  else
    for v_try_amount in 1..v_market.max_action_stake loop
      v_try_signal := v_try_amount - floor(v_try_amount * 0.02);
      if (v_current_user_signal + v_try_signal)::numeric / (v_aggregate.total_signal_credits + v_try_signal) <= v_max_share then
        v_share_max := v_try_amount;
      end if;
      if v_position.id is not null and v_position.outcome_id <> p_outcome_id then
        if not exists (
          select 1
          from outcomes o
          where o.market_id = p_market_id
            and abs(
              greatest(
                coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::integer, 0)
                - case when o.id = v_position.outcome_id then v_position.signal_credits else 0 end
                + case when o.id = p_outcome_id then v_position.signal_credits + v_try_signal else 0 end,
                0
              )::numeric / greatest(v_aggregate.total_signal_credits + v_try_signal, 1)
              - coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::integer, 0)::numeric / greatest(v_aggregate.total_signal_credits, 1)
            ) > 0.05
        ) then
          v_impact_max := v_try_amount;
        end if;
      else
        v_existing_outcome_total := coalesce((v_aggregate.outcome_credit_totals ->> p_outcome_id::text)::integer, 0);
        v_current_share := v_existing_outcome_total::numeric / greatest(v_aggregate.total_signal_credits, 1);
        v_next_share := (v_existing_outcome_total + v_try_signal)::numeric / (v_aggregate.total_signal_credits + v_try_signal);
        if abs(v_next_share - v_current_share) <= 0.05 then
          v_impact_max := v_try_amount;
        end if;
      end if;
    end loop;
  end if;

  v_allowed := least(v_wallet.balance_credits, v_market.max_action_stake, v_step_cap, v_share_max, v_impact_max);
  if v_amount > v_allowed then
    raise exception 'This market cannot absorb that much yet. This market can absorb up to % Credits from you right now.', v_allowed;
  end if;
  if v_wallet.balance_credits < v_amount then raise exception 'Not enough MegaBucks.'; end if;

  v_snapshots := market_signal_snapshot(p_market_id);

  update wallets
  set balance_credits = balance_credits - v_amount,
      total_committed_credits = total_committed_credits + v_amount
  where participant_id = v_participant.id
  returning * into v_wallet;

  if v_position.id is null then
    insert into positions (participant_id, market_id, outcome_id, raw_credits, signal_credits, fee_credits, last_action_at)
    values (v_participant.id, p_market_id, p_outcome_id, v_amount, v_signal, v_fee, v_now)
    returning * into v_position;
  else
    v_action_type := case when v_position.outcome_id = p_outcome_id then 'add' else 'switch' end;
    update positions
    set outcome_id = p_outcome_id,
        raw_credits = raw_credits + v_amount,
        signal_credits = signal_credits + v_signal,
        fee_credits = fee_credits + v_fee,
        last_action_at = v_now,
        updated_at = v_now
    where id = v_position.id
    returning * into v_position;
  end if;

  insert into prediction_actions (
    participant_id, market_id, outcome_id, request_id, action_type, amount_credits, signal_credits, fee_credits,
    people_signal_snapshot, credit_signal_snapshot, conviction_signal_snapshot, stage_signal_snapshot
  )
  values (
    v_participant.id, p_market_id, p_outcome_id, v_request_id, v_action_type, v_amount,
    case when v_action_type = 'switch' then v_position.signal_credits else v_signal end,
    v_fee,
    coalesce(v_snapshots -> 'people', '{}'::jsonb),
    coalesce(v_snapshots -> 'credit', '{}'::jsonb),
    coalesce(v_snapshots -> 'conviction', '{}'::jsonb),
    coalesce(v_snapshots -> 'stage', '{}'::jsonb)
  )
  returning * into v_action;

  if v_amount > 0 then
    insert into ledger_entries (participant_id, type, amount_credits, direction, balance_after, idempotency_key, reason, market_id, metadata)
    values (v_participant.id, 'prediction_commit', -v_amount, 'debit', v_wallet.balance_credits, v_request_id, 'Committed MegaBucks to ' || v_market.title, p_market_id, jsonb_build_object('outcomeId', p_outcome_id));
  end if;

  if v_participant.participant_type = 'human' then
    update markets set show_on_stage = true, updated_at = case when show_on_stage then updated_at else v_now end where id = p_market_id;
    update events set stage_mode = 'live', featured_market_id = p_market_id where id = v_market.event_id and stage_mode = 'join';
  end if;

  v_aggregate := recompute_market_aggregate(p_market_id);
  return jsonb_build_object('position', to_jsonb(v_position), 'action', to_jsonb(v_action), 'aggregate', to_jsonb(v_aggregate), 'wallet', to_jsonb(v_wallet));
end;
$$;

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

revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function resolve_market_tx(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function resolve_market_tx(uuid, uuid, text, text) to service_role;
