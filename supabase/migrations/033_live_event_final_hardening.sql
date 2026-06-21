create table if not exists checkout_intents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  click_count integer not null default 1 check (click_count > 0),
  amount_eur numeric(8,2) not null default 1.00,
  credits integer not null default 100,
  purchase_id uuid references purchases(id) on delete set null,
  unique (event_id, participant_id)
);

alter table checkout_intents enable row level security;

revoke all privileges on table checkout_intents from public, anon, authenticated;
grant all privileges on table checkout_intents to service_role;

create or replace function record_checkout_intent_tx(p_participant_id uuid, p_purchase_id uuid default null)
returns checkout_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_intent checkout_intents%rowtype;
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;

  insert into checkout_intents (
    event_id,
    participant_id,
    first_clicked_at,
    last_clicked_at,
    click_count,
    amount_eur,
    credits,
    purchase_id
  )
  values (
    v_participant.event_id,
    v_participant.id,
    now(),
    now(),
    1,
    1.00,
    100,
    p_purchase_id
  )
  on conflict (event_id, participant_id) do update set
    last_clicked_at = now(),
    click_count = checkout_intents.click_count + 1,
    purchase_id = coalesce(excluded.purchase_id, checkout_intents.purchase_id)
  returning * into v_intent;

  return v_intent;
end;
$$;

create or replace function link_checkout_intent_purchase_tx(p_participant_id uuid, p_purchase_id uuid)
returns checkout_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_intent checkout_intents%rowtype;
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;

  update checkout_intents
  set purchase_id = p_purchase_id,
      last_clicked_at = now()
  where event_id = v_participant.event_id
    and participant_id = v_participant.id
  returning * into v_intent;

  if not found then
    insert into checkout_intents (
      event_id,
      participant_id,
      first_clicked_at,
      last_clicked_at,
      click_count,
      amount_eur,
      credits,
      purchase_id
    )
    values (
      v_participant.event_id,
      v_participant.id,
      now(),
      now(),
      1,
      1.00,
      100,
      p_purchase_id
    )
    returning * into v_intent;
  end if;

  return v_intent;
end;
$$;

create or replace function update_participant_profile_tx(
  p_participant_id uuid,
  p_nickname text,
  p_role text,
  p_avatar_url text default null
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_previous_role text;
  v_market_id uuid;
  v_nickname text := trim(coalesce(p_nickname, ''));
  v_role text := trim(coalesce(p_role, ''));
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;

  if v_participant.participant_type = 'human'
    and nullif(trim(v_participant.nickname), '') is not null
    and lower(trim(v_participant.nickname)) <> 'oracle'
    and v_participant.role in ('builder', 'sponsor', 'investor', 'other')
  then
    raise exception 'Profile is locked after entering the arena.';
  end if;

  if v_nickname = '' then
    raise exception 'Enter a stage name before joining.';
  end if;
  if v_role not in ('builder', 'sponsor', 'investor', 'other') then
    raise exception 'Choose your role before joining.';
  end if;

  v_previous_role := v_participant.role;
  update participants
  set nickname = v_nickname,
      role = v_role,
      avatar_url = coalesce(nullif(p_avatar_url, ''), avatar_url)
  where id = v_participant.id
  returning * into v_participant;

  if v_previous_role is distinct from v_participant.role then
    for v_market_id in
      select distinct market_id
      from positions
      where participant_id = v_participant.id
    loop
      perform recompute_market_aggregate(v_market_id);
    end loop;
  end if;

  return v_participant;
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
  v_winning_pool integer := 0;
  v_losing_pool integer := 0;
  v_assigned_pool integer := 0;
  v_remaining_pool integer := 0;
  v_unclaimed_pool integer := 0;
  v_pool_share integer := 0;
  v_payout integer := 0;
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
    raise exception 'Resolution target not found';
  end if;

  select * into v_outcome
  from outcomes
  where id = p_outcome_id and market_id = p_market_id;
  if not found then
    raise exception 'Resolution target not found';
  end if;

  if v_market.status = 'resolved' then
    if v_market.resolved_outcome_id = p_outcome_id then
      v_aggregate := recompute_market_aggregate(p_market_id);
      return jsonb_build_object(
        'market', to_jsonb(v_market),
        'aggregate', to_jsonb(v_aggregate),
        'settledCount', 0,
        'settledCredits', 0,
        'idempotent', true
      );
    end if;
    raise exception 'Market is already resolved with a different outcome.';
  end if;

  if v_market.status <> 'locked' then
    raise exception 'Only locked markets can be resolved.';
  end if;

  perform stamp_market_closing_stage(p_market_id);

  update markets
  set status = 'resolved',
      resolved_outcome_id = p_outcome_id,
      resolution_note = v_note,
      show_on_stage = true,
      resolved_at = v_now,
      locked_at = coalesce(locked_at, v_now),
      updated_at = v_now
  where id = p_market_id
  returning * into v_market;

  update events
  set stage_mode = 'resolution',
      featured_market_id = p_market_id
  where id = v_market.event_id;

  select
    coalesce(sum(raw_credits) filter (where outcome_id = p_outcome_id), 0)::integer,
    coalesce(sum(raw_credits) filter (where outcome_id <> p_outcome_id), 0)::integer
  into v_winning_pool, v_losing_pool
  from positions
  where market_id = p_market_id and raw_credits > 0;

  update wallets w
  set total_committed_credits = greatest(0, w.total_committed_credits - committed.raw_credits)
  from (
    select participant_id, sum(raw_credits)::integer as raw_credits
    from positions
    where market_id = p_market_id and raw_credits > 0
    group by participant_id
  ) committed
  where w.participant_id = committed.participant_id;

  if v_winning_pool > 0 and v_losing_pool > 0 then
    select coalesce(sum(floor((v_losing_pool::numeric * raw_credits::numeric) / v_winning_pool::numeric)), 0)::integer
    into v_assigned_pool
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0;
  end if;
  v_remaining_pool := greatest(0, v_losing_pool - v_assigned_pool);

  for v_position in
    select *
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0
    order by raw_credits desc, id asc
    for update
  loop
    v_pool_share := case
      when v_winning_pool > 0 then floor((v_losing_pool::numeric * v_position.raw_credits::numeric) / v_winning_pool::numeric)::integer
      else 0
    end;
    if v_remaining_pool > 0 then
      v_pool_share := v_pool_share + 1;
      v_remaining_pool := v_remaining_pool - 1;
    end if;
    v_payout := v_position.raw_credits + v_pool_share;

    select * into v_wallet
    from wallets
    where participant_id = v_position.participant_id
    for update;
    if not found then
      raise exception 'Wallet not found.';
    end if;
    v_balance_after := v_wallet.balance_credits + v_payout;

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
      'resolution_credit',
      v_payout,
      'credit',
      v_balance_after,
      'Resolved prediction credit: ' || v_market.title,
      p_market_id,
      v_now,
      jsonb_build_object(
        'outcomeId', p_outcome_id,
        'stakeReturned', v_position.raw_credits,
        'poolShare', v_pool_share,
        'losingPool', v_losing_pool,
        'winningPool', v_winning_pool
      )
    )
    on conflict (participant_id, market_id) where type = 'resolution_credit' and market_id is not null do nothing;

    get diagnostics v_settlement_inserted = ROW_COUNT;
    if v_settlement_inserted > 0 then
      update wallets
      set balance_credits = v_balance_after
      where participant_id = v_position.participant_id
      returning * into v_wallet;
      v_settled_count := v_settled_count + 1;
      v_settled_credits := v_settled_credits + v_payout;
    end if;
  end loop;
  v_unclaimed_pool := case when v_winning_pool = 0 then v_losing_pool else 0 end;

  perform recompute_oracle_scores_tx();
  v_aggregate := recompute_market_aggregate(p_market_id);

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values (
    'resolve_market',
    'market',
    p_market_id::text,
    jsonb_build_object(
      'outcomeId', p_outcome_id,
      'note', v_note,
      'settledCount', v_settled_count,
      'settledCredits', v_settled_credits,
      'winningPool', v_winning_pool,
      'losingPool', v_losing_pool,
      'unclaimedPool', v_unclaimed_pool
    ),
    p_ip
  );

  return jsonb_build_object(
    'market', to_jsonb(v_market),
    'aggregate', to_jsonb(v_aggregate),
    'settledCount', v_settled_count,
    'settledCredits', v_settled_credits,
    'winningPool', v_winning_pool,
    'losingPool', v_losing_pool,
    'unclaimedPool', v_unclaimed_pool
  );
end;
$$;

create or replace function readiness_contract_tx()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
select jsonb_build_object(
  'contractVersion', '033_live_event_final_hardening',
  'checkoutIntentsTable', to_regclass('public.checkout_intents') is not null,
  'checkoutIntentRecordRpc', to_regprocedure('record_checkout_intent_tx(uuid,uuid)') is not null,
  'checkoutIntentLinkRpc', to_regprocedure('link_checkout_intent_purchase_tx(uuid,uuid)') is not null,
  'profileLockRpc', to_regprocedure('update_participant_profile_tx(uuid,text,text,text)') is not null,
  'poolSettlementRpc', to_regprocedure('resolve_market_tx(uuid,uuid,text,text)') is not null,
  'marketSignalsRpc', to_regprocedure('market_signal_snapshot(uuid)') is not null,
  'predictionIdempotencyColumn', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prediction_actions' and column_name = 'request_id'
  ),
  'ledgerSettlementColumns', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'balance_after'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ledger_entries' and column_name = 'metadata'
  ),
  'ok',
    to_regclass('public.checkout_intents') is not null
    and to_regprocedure('record_checkout_intent_tx(uuid,uuid)') is not null
    and to_regprocedure('link_checkout_intent_purchase_tx(uuid,uuid)') is not null
    and to_regprocedure('update_participant_profile_tx(uuid,text,text,text)') is not null
    and to_regprocedure('resolve_market_tx(uuid,uuid,text,text)') is not null
    and to_regprocedure('market_signal_snapshot(uuid)') is not null
);
$$;

revoke execute on function record_checkout_intent_tx(uuid, uuid) from public, anon, authenticated;
revoke execute on function link_checkout_intent_purchase_tx(uuid, uuid) from public, anon, authenticated;
revoke execute on function update_participant_profile_tx(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function resolve_market_tx(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function record_checkout_intent_tx(uuid, uuid) to service_role;
grant execute on function link_checkout_intent_purchase_tx(uuid, uuid) to service_role;
grant execute on function update_participant_profile_tx(uuid, text, text, text) to service_role;
grant execute on function resolve_market_tx(uuid, uuid, text, text) to service_role;
grant execute on function readiness_contract_tx() to service_role;
