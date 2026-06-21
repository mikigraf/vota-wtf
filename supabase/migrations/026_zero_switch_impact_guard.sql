create or replace function market_guard_aggregate(p_market_id uuid, p_humans_only boolean default false)
returns market_aggregates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result market_aggregates%rowtype;
  v_total_people integer;
  v_total_signal integer;
  v_people_counts jsonb;
  v_credit_totals jsonb;
  v_role_breakdown jsonb;
  v_agent_breakdown jsonb;
begin
  select
    count(*) filter (where par.participant_type = 'human')::int,
    coalesce(sum(p.signal_credits) filter (where not p_humans_only or par.participant_type = 'human'), 0)::int
  into v_total_people, v_total_signal
  from positions p
  join participants par on par.id = p.participant_id
  where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned;

  select
    coalesce(jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)), '{}'::jsonb),
    coalesce(jsonb_object_agg(o.id::text, coalesce(c.signal_total, 0)), '{}'::jsonb)
  into v_people_counts, v_credit_totals
  from outcomes o
  left join (
    select
      p.outcome_id,
      count(*) filter (where par.participant_type = 'human')::int as people_count,
      coalesce(sum(p.signal_credits) filter (where not p_humans_only or par.participant_type = 'human'), 0)::int as signal_total
    from positions p
    join participants par on par.id = p.participant_id
    where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned
    group by p.outcome_id
  ) c on c.outcome_id = o.id
  where o.market_id = p_market_id;

  select jsonb_build_object(
    'builder', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type = 'human' and par.role = 'builder' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb),
    'sponsor', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type = 'human' and par.role = 'sponsor' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb),
    'investor', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type = 'human' and par.role = 'investor' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb),
    'other', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type = 'human' and par.role = 'other' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb)
  ) into v_role_breakdown;

  select jsonb_build_object(
    'human', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type = 'human' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb),
    'agent', coalesce((select jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)) from outcomes o left join (
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type <> 'human' group by p.outcome_id
    ) c on c.outcome_id = o.id where o.market_id = p_market_id), '{}'::jsonb)
  ) into v_agent_breakdown;

  v_result.market_id := p_market_id;
  v_result.total_people := coalesce(v_total_people, 0);
  v_result.total_signal_credits := coalesce(v_total_signal, 0);
  v_result.outcome_people_counts := coalesce(v_people_counts, '{}'::jsonb);
  v_result.outcome_credit_totals := coalesce(v_credit_totals, '{}'::jsonb);
  v_result.role_breakdown := coalesce(v_role_breakdown, '{}'::jsonb);
  v_result.agent_breakdown := coalesce(v_agent_breakdown, '{}'::jsonb);
  v_result.updated_at := now();
  return v_result;
end;
$$;

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
  v_initial_fair_launch boolean;
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
  if v_participant.participant_type = 'human' then
    select * into v_aggregate from market_guard_aggregate(p_market_id, true);
  else
    select * into v_aggregate from market_aggregates where market_id = p_market_id for update;
  end if;
  select * into v_position from positions where participant_id = v_participant.id and market_id = p_market_id for update;

  v_fair_launch := not v_market.fair_launch_override
    and coalesce(v_aggregate.total_people, 0) < coalesce(v_market.fair_launch_people_threshold, 25)
    and coalesce(v_aggregate.total_signal_credits, 0) < coalesce(v_market.fair_launch_signal_credits_threshold, 5000);
  v_initial_fair_launch := v_position.id is null and v_fair_launch;

  if v_initial_fair_launch and v_amount <> 100 then raise exception 'Fair launch: first prediction is exactly 100 MBucks.'; end if;
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
    v_share_max := v_market.max_action_stake;
    v_impact_max := v_market.max_action_stake;
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
    if v_position.id is not null and v_position.outcome_id <> p_outcome_id then
      raise exception 'This market cannot absorb that switch yet. This market can absorb up to % Credits from you right now.', v_allowed;
    end if;
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

revoke execute on function market_guard_aggregate(uuid, boolean) from public, anon, authenticated;
revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function market_guard_aggregate(uuid, boolean) to service_role;
grant execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) to service_role;
