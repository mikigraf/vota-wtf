alter table prediction_actions
  add column if not exists request_id text;

create unique index if not exists prediction_actions_request_id_unique_idx
  on prediction_actions (participant_id, market_id, request_id)
  where request_id is not null;

drop function if exists place_agent_prediction_tx(uuid, uuid, uuid, integer);
drop function if exists place_prediction_tx(uuid, uuid, uuid, integer);
drop function if exists place_prediction_tx(uuid, uuid, uuid, integer, text);

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
  v_people_snapshot jsonb := '{}'::jsonb;
  v_credit_snapshot jsonb := '{}'::jsonb;
  v_action prediction_actions%rowtype;
begin
  if v_amount < 0 then
    raise exception 'Choose a valid MegaBuck amount.';
  end if;

  select * into v_session
  from participant_sessions
  where id = p_session_id and expires_at > v_now
  for update;
  if not found then raise exception 'Join the event before predicting.'; end if;

  select * into v_participant from participants where id = v_session.participant_id for update;
  if not found or v_participant.is_banned then raise exception 'This profile is paused by moderation.'; end if;

  select * into v_wallet from wallets where participant_id = v_participant.id for update;
  if not found then raise exception 'Wallet not found.'; end if;

  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'This prediction is not open.'; end if;
  if v_participant.event_id <> v_market.event_id then
    raise exception 'This profile cannot predict in another event.';
  end if;

  if v_request_id is not null then
    select * into v_action
    from prediction_actions
    where participant_id = v_participant.id
      and market_id = p_market_id
      and request_id = v_request_id
    for update;

    if found then
      if v_action.outcome_id <> p_outcome_id or v_action.amount_credits <> v_amount then
        raise exception 'Idempotency key was already used for a different prediction.';
      end if;

      perform recompute_market_aggregate(p_market_id);
      select * into v_aggregate from market_aggregates where market_id = p_market_id;
      select * into v_position
      from positions
      where participant_id = v_participant.id and market_id = p_market_id;
      if not found then
        raise exception 'Prediction replay could not find the original position.';
      end if;

      return jsonb_build_object(
        'position', to_jsonb(v_position),
        'action', to_jsonb(v_action),
        'aggregate', to_jsonb(v_aggregate),
        'wallet', to_jsonb(v_wallet)
      );
    end if;
  end if;

  if v_market.status <> 'open' then raise exception 'This prediction is not open.'; end if;
  if not exists (select 1 from outcomes where id = p_outcome_id and market_id = p_market_id) then
    raise exception 'Prediction target not found.';
  end if;
  if exists (select 1 from events where id = v_market.event_id and emergency_paused) then
    raise exception 'The arena is paused by the organizer.';
  end if;

  perform recompute_market_aggregate(p_market_id);
  select * into v_aggregate from market_aggregates where market_id = p_market_id for update;
  select * into v_position
  from positions
  where participant_id = v_participant.id and market_id = p_market_id
  for update;

  v_fair_launch :=
    v_position.id is null
    and not v_market.fair_launch_override
    and coalesce(v_aggregate.total_people, 0) < coalesce(v_market.fair_launch_people_threshold, 25)
    and coalesce(v_aggregate.total_signal_credits, 0) < coalesce(v_market.fair_launch_signal_credits_threshold, 5000);

  if v_fair_launch and v_amount <> 100 then
    raise exception 'Fair launch: first prediction is exactly 100 MBucks.';
  end if;
  if v_position.id is null and v_amount < 100 then
    raise exception 'First prediction must be at least 100 MBucks.';
  end if;
  if v_position.id is not null and v_position.outcome_id = p_outcome_id and v_amount <= 0 then
    raise exception 'Choose MegaBucks to add.';
  end if;
  if v_position.id is not null and v_position.outcome_id <> p_outcome_id and not v_market.allow_switching then
    raise exception 'Switching is disabled for this prediction.';
  end if;
  if v_position.id is not null and v_now - v_position.last_action_at < interval '30 seconds' then
    raise exception 'Cooldown active. Try again soon.';
  end if;

  v_fee := floor(v_amount * 0.02);
  v_signal := v_amount - v_fee;
  v_step_cap := case when v_position.id is null then v_market.max_action_stake else greatest(100, floor(v_position.raw_credits * 0.5)) end;
  v_current_user_signal := coalesce(v_position.signal_credits, 0);
  v_max_share := case when v_participant.participant_type = 'human' then 0.10 else 0.05 end;

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
    raise exception 'This market cannot absorb that much yet. Max allowed now: % MBucks.', v_allowed;
  end if;
  if v_wallet.balance_credits < v_amount then
    raise exception 'Not enough MegaBucks.';
  end if;

  if v_position.id is not null and v_position.outcome_id <> p_outcome_id then
    if exists (
      select 1
      from outcomes o
      where o.market_id = p_market_id
        and abs(
          greatest(
            coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::integer, 0)
            - case when o.id = v_position.outcome_id then v_position.signal_credits else 0 end
            + case when o.id = p_outcome_id then v_position.signal_credits + v_signal else 0 end,
            0
          )::numeric / greatest(v_aggregate.total_signal_credits + v_signal, 1)
          - coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::integer, 0)::numeric / greatest(v_aggregate.total_signal_credits, 1)
        ) > 0.05
    ) then
      raise exception 'This market cannot absorb that switch yet. Max allowed now: 0 MBucks.';
    end if;
  end if;

  select coalesce(jsonb_object_agg(o.id::text, case when v_aggregate.total_people > 0 then coalesce((v_aggregate.outcome_people_counts ->> o.id::text)::numeric, 0) / v_aggregate.total_people else 0 end), '{}'::jsonb)
  into v_people_snapshot
  from outcomes o where o.market_id = p_market_id;
  select coalesce(jsonb_object_agg(o.id::text, case when v_aggregate.total_signal_credits > 0 then coalesce((v_aggregate.outcome_credit_totals ->> o.id::text)::numeric, 0) / v_aggregate.total_signal_credits else 0 end), '{}'::jsonb)
  into v_credit_snapshot
  from outcomes o where o.market_id = p_market_id;

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
    participant_id,
    market_id,
    outcome_id,
    request_id,
    action_type,
    amount_credits,
    signal_credits,
    fee_credits,
    people_signal_snapshot,
    credit_signal_snapshot
  )
  values (
    v_participant.id,
    p_market_id,
    p_outcome_id,
    v_request_id,
    v_action_type,
    v_amount,
    case when v_action_type = 'switch' then v_position.signal_credits else v_signal end,
    v_fee,
    v_people_snapshot,
    v_credit_snapshot
  )
  returning * into v_action;

  if v_amount > 0 then
    insert into ledger_entries (participant_id, type, amount_credits, reason, market_id)
    values (v_participant.id, 'prediction_commit', -v_amount, 'Committed MegaBucks to ' || v_market.title, p_market_id);
  end if;

  if v_participant.participant_type = 'human' then
    update markets
    set show_on_stage = true,
        updated_at = case when show_on_stage then updated_at else v_now end
    where id = p_market_id;

    update events
    set stage_mode = 'live',
        featured_market_id = p_market_id
    where id = v_market.event_id and stage_mode = 'join';
  end if;

  v_aggregate := recompute_market_aggregate(p_market_id);

  return jsonb_build_object(
    'position', to_jsonb(v_position),
    'action', to_jsonb(v_action),
    'aggregate', to_jsonb(v_aggregate),
    'wallet', to_jsonb(v_wallet)
  );
end;
$$;

create or replace function place_agent_prediction_tx(
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
declare
  v_participant participants%rowtype;
  v_session_id uuid;
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found or v_participant.participant_type not in ('house_agent', 'external_agent') then
    raise exception 'Agent participant not found.';
  end if;

  insert into participant_sessions (participant_id, event_id, expires_at)
  values (v_participant.id, v_participant.event_id, now() + interval '5 minutes')
  returning id into v_session_id;

  return place_prediction_tx(v_session_id, p_market_id, p_outcome_id, p_amount_credits, null);
end;
$$;

revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function place_agent_prediction_tx(uuid, uuid, uuid, integer) from public, anon, authenticated;

grant execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function place_agent_prediction_tx(uuid, uuid, uuid, integer) to service_role;
