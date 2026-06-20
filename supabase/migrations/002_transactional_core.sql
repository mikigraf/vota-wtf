drop function if exists credit_purchase_tx(uuid, text);

create or replace function recompute_market_aggregate(p_market_id uuid)
returns market_aggregates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result market_aggregates;
  v_total_people integer;
  v_total_signal integer;
  v_people_counts jsonb;
  v_credit_totals jsonb;
  v_role_breakdown jsonb;
  v_agent_breakdown jsonb;
begin
  perform 1
  from markets
  where id = p_market_id
  for update;
  if not found then
    raise exception 'Market not found.';
  end if;

  select
    count(*) filter (where par.participant_type = 'human')::int,
    coalesce(sum(p.signal_credits), 0)::int
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
      count(*) filter (where par.participant_type = 'human')::int people_count,
      coalesce(sum(p.signal_credits), 0)::int signal_total
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

  insert into market_aggregates (
    market_id,
    total_people,
    total_signal_credits,
    outcome_people_counts,
    outcome_credit_totals,
    role_breakdown,
    agent_breakdown,
    updated_at
  )
  values (
    p_market_id,
    coalesce(v_total_people, 0),
    coalesce(v_total_signal, 0),
    coalesce(v_people_counts, '{}'::jsonb),
    coalesce(v_credit_totals, '{}'::jsonb),
    coalesce(v_role_breakdown, '{}'::jsonb),
    coalesce(v_agent_breakdown, '{}'::jsonb),
    now()
  )
  on conflict (market_id) do update set
    total_people = excluded.total_people,
    total_signal_credits = excluded.total_signal_credits,
    outcome_people_counts = excluded.outcome_people_counts,
    outcome_credit_totals = excluded.outcome_credit_totals,
    role_breakdown = excluded.role_breakdown,
    agent_breakdown = excluded.agent_breakdown,
    updated_at = excluded.updated_at
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function place_prediction_tx(
  p_session_id uuid,
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
  v_session participant_sessions%rowtype;
  v_participant participants%rowtype;
  v_wallet wallets%rowtype;
  v_market markets%rowtype;
  v_position positions%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_amount integer := floor(coalesce(p_amount_credits, 0));
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
  v_before_from numeric;
  v_after_from numeric;
  v_before_to numeric;
  v_after_to numeric;
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
  if not found or v_market.status <> 'open' then raise exception 'This prediction is not open.'; end if;
  if v_participant.event_id <> v_market.event_id then
    raise exception 'This profile cannot predict in another event.';
  end if;
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

  return place_prediction_tx(v_session_id, p_market_id, p_outcome_id, p_amount_credits);
end;
$$;

create or replace function credit_purchase_tx(p_purchase_id uuid, p_status text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase purchases%rowtype;
  v_wallet wallets%rowtype;
  v_credited boolean := false;
begin
  select * into v_purchase from purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if v_purchase.status = 'credited' then
    return jsonb_build_object('purchase', to_jsonb(v_purchase), 'credited', false);
  end if;
  if p_status <> 'paid' then
    update purchases set status = p_status where id = p_purchase_id returning * into v_purchase;
    return jsonb_build_object('purchase', to_jsonb(v_purchase), 'credited', false);
  end if;

  select * into v_wallet from wallets where participant_id = v_purchase.participant_id for update;
  if not found then raise exception 'Wallet not found.'; end if;

  if not exists (
    select 1 from ledger_entries
    where purchase_id = v_purchase.id and type = 'test_checkout_credit'
  ) then
    update wallets
    set balance_credits = balance_credits + v_purchase.credits,
        total_issued_credits = total_issued_credits + v_purchase.credits
    where participant_id = v_purchase.participant_id
    returning * into v_wallet;
    insert into ledger_entries (participant_id, type, amount_credits, direction, balance_after, idempotency_key, reason, purchase_id, metadata)
    values (
      v_purchase.participant_id,
      'test_checkout_credit',
      v_purchase.credits,
      'credit',
      v_wallet.balance_credits,
      v_purchase.id::text,
      'Mollie test checkout completed',
      v_purchase.id,
      jsonb_build_object('purchaseId', v_purchase.id)
    );
    v_credited := true;
  end if;

  update purchases
  set status = 'credited',
      paid_at = coalesce(paid_at, now()),
      credited_at = coalesce(credited_at, now())
  where id = p_purchase_id
  returning * into v_purchase;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('payment_credit', 'purchase', p_purchase_id::text, jsonb_build_object('credits', v_purchase.credits, 'status', v_purchase.status), p_ip);

  return jsonb_build_object('purchase', to_jsonb(v_purchase), 'wallet', to_jsonb(v_wallet), 'credited', v_credited);
end;
$$;

revoke execute on function recompute_market_aggregate(uuid) from public, anon, authenticated;
revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function place_agent_prediction_tx(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function credit_purchase_tx(uuid, text, text) from public, anon, authenticated;

grant execute on function recompute_market_aggregate(uuid) to service_role;
grant execute on function place_prediction_tx(uuid, uuid, uuid, integer) to service_role;
grant execute on function place_agent_prediction_tx(uuid, uuid, uuid, integer) to service_role;
grant execute on function credit_purchase_tx(uuid, text, text) to service_role;
