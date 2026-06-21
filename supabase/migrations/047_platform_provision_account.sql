alter table participants drop constraint if exists participants_participant_type_check;

alter table participants
  add constraint participants_participant_type_check
  check (participant_type in ('human', 'house_agent', 'external_agent', 'platform'));

alter table ledger_entries drop constraint if exists ledger_entries_type_check;

alter table ledger_entries
  add constraint ledger_entries_type_check
  check (
    type in (
      'starter_credit',
      'prediction_commit',
      'test_checkout_credit',
      'void_refund',
      'resolution_credit',
      'platform_provision'
    )
  );

create unique index if not exists participants_platform_main_account_idx
  on participants (participant_type)
  where participant_type = 'platform';

create unique index if not exists one_platform_provision_per_market
  on ledger_entries (market_id)
  where type = 'platform_provision' and market_id is not null;

do $$
declare
  v_event_id uuid;
  v_platform_id uuid;
begin
  select id into v_event_id
  from events
  where slug = 'megathon';

  if v_event_id is null then
    select id into v_event_id
    from events
    order by created_at asc, id asc
    limit 1;
  end if;

  if v_event_id is null then
    raise exception 'Platform account needs at least one event.';
  end if;

  select id into v_platform_id
  from participants
  where participant_type = 'platform'
  order by case when id = '00000000-0000-4000-8000-00000000f001'::uuid then 0 else 1 end, created_at asc, id asc
  limit 1;

  if v_platform_id is null then
    insert into participants (
      id,
      event_id,
      participant_type,
      nickname,
      role,
      is_avatar_hidden,
      is_banned,
      oracle_score,
      created_at
    )
    values (
      '00000000-0000-4000-8000-00000000f001',
      v_event_id,
      'platform',
      'vota.wtf Platform',
      'other',
      true,
      false,
      0,
      now()
    )
    on conflict (id) do update
    set event_id = excluded.event_id,
        participant_type = 'platform',
        nickname = 'vota.wtf Platform',
        role = 'other',
        is_avatar_hidden = true,
        is_banned = false,
        oracle_score = 0
    returning id into v_platform_id;
  else
    update participants
    set event_id = v_event_id,
        participant_type = 'platform',
        nickname = 'vota.wtf Platform',
        role = 'other',
        is_avatar_hidden = true,
        is_banned = false,
        oracle_score = 0
    where id = v_platform_id;
  end if;

  insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
  values (v_platform_id, 0, 0, 0)
  on conflict (participant_id) do nothing;
end;
$$;

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
  where p.market_id = p_market_id
    and p.signal_credits > 0
    and not par.is_banned
    and (par.participant_type = 'human' or par.participant_type in ('house_agent', 'external_agent'))
    and (not p_humans_only or par.participant_type = 'human');

  select
    coalesce(jsonb_object_agg(o.id::text, coalesce(c.people_count, 0)), '{}'::jsonb),
    coalesce(jsonb_object_agg(o.id::text, coalesce(c.signal_total, 0)), '{}'::jsonb)
  into v_people_counts, v_credit_totals
  from outcomes o
  left join (
    select
      p.outcome_id,
      count(*) filter (where par.participant_type = 'human')::int as people_count,
      coalesce(sum(p.signal_credits), 0)::int as signal_total
    from positions p
    join participants par on par.id = p.participant_id
    where p.market_id = p_market_id
      and p.signal_credits > 0
      and not par.is_banned
      and (par.participant_type = 'human' or par.participant_type in ('house_agent', 'external_agent'))
      and (not p_humans_only or par.participant_type = 'human')
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
      select p.outcome_id, count(*)::int people_count from positions p join participants par on par.id = p.participant_id where p.market_id = p_market_id and p.signal_credits > 0 and not par.is_banned and par.participant_type in ('house_agent', 'external_agent') and not p_humans_only group by p.outcome_id
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

create or replace function recompute_market_aggregate(p_market_id uuid)
returns market_aggregates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard market_aggregates%rowtype;
  v_result market_aggregates%rowtype;
begin
  select * into v_guard
  from market_guard_aggregate(p_market_id, false);

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
    coalesce(v_guard.total_people, 0),
    coalesce(v_guard.total_signal_credits, 0),
    coalesce(v_guard.outcome_people_counts, '{}'::jsonb),
    coalesce(v_guard.outcome_credit_totals, '{}'::jsonb),
    coalesce(v_guard.role_breakdown, '{}'::jsonb),
    coalesce(v_guard.agent_breakdown, '{}'::jsonb),
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

create or replace function public_leaderboard_tx(p_event_slug text)
returns table (
  id uuid,
  nickname text,
  role text,
  participant_type text,
  avatar_url text,
  oracle_score integer,
  predictions integer,
  correct_markets integer,
  efficiency numeric,
  early_score integer,
  contrarian_score integer
)
language sql
stable
security definer
set search_path = public
as $$
with event_scope as (
  select id
  from events
  where slug = p_event_slug
),
participant_scope as (
  select p.*
  from participants p
  join event_scope e on e.id = p.event_id
  where not p.is_banned
    and p.participant_type <> 'platform'
),
prediction_counts as (
  select
    pa.participant_id,
    count(*)::integer as predictions,
    coalesce(sum(greatest(pa.amount_credits, 0)), 0)::numeric as lifetime_committed
  from prediction_actions pa
  join participant_scope p on p.id = pa.participant_id
  where pa.action_type <> 'admin_void'
  group by pa.participant_id
),
correct_positions as (
  select pos.participant_id, pos.market_id
  from positions pos
  join participant_scope p on p.id = pos.participant_id
  join markets m on m.id = pos.market_id
  where m.status = 'resolved'
    and m.resolved_outcome_id is not null
    and pos.outcome_id = m.resolved_outcome_id
),
correct_counts as (
  select participant_id, count(*)::integer as correct_markets
  from correct_positions
  group by participant_id
),
base_actions as (
  select
    pa.*,
    m.opened_at,
    m.created_at as market_created_at,
    m.resolved_at,
    m.resolved_outcome_id,
    max(pa.created_at) filter (
      where pa.action_type = 'switch'
        and pa.outcome_id = m.resolved_outcome_id
    ) over (partition by pa.participant_id, pa.market_id) as last_switch_to_winner
  from prediction_actions pa
  join correct_positions cp on cp.participant_id = pa.participant_id and cp.market_id = pa.market_id
  join markets m on m.id = pa.market_id
  where pa.action_type <> 'admin_void'
),
scoreable_actions as (
  select
    participant_id,
    signal_credits,
    least(
      1,
      greatest(
        0,
        extract(epoch from (created_at - coalesce(opened_at, market_created_at))) * 1000
        / nullif(greatest(60000, extract(epoch from (coalesce(resolved_at, now()) - coalesce(opened_at, market_created_at))) * 1000), 0)
      )
    ) as progress,
    least(
      1,
      greatest(
        0,
        coalesce(
          (stage_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          (people_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          0
        )
      )
    ) as popularity
  from base_actions
  where outcome_id = resolved_outcome_id
    and signal_credits > 0
    and (last_switch_to_winner is null or created_at >= last_switch_to_winner)
),
score_sums as (
  select
    participant_id,
    round(sum(signal_credits * (1 - progress)))::integer as early_score,
    round(sum(signal_credits * (1 - popularity)))::integer as contrarian_score
  from scoreable_actions
  group by participant_id
)
select
  p.id,
  p.nickname,
  p.role,
  p.participant_type,
  case when p.is_avatar_hidden then null else p.avatar_url end as avatar_url,
  p.oracle_score,
  coalesce(pc.predictions, 0)::integer as predictions,
  coalesce(cc.correct_markets, 0)::integer as correct_markets,
  case
    when coalesce(pc.lifetime_committed, 0) > 0 then p.oracle_score::numeric / pc.lifetime_committed
    else p.oracle_score::numeric
  end as efficiency,
  coalesce(ss.early_score, 0)::integer as early_score,
  coalesce(ss.contrarian_score, 0)::integer as contrarian_score
from participant_scope p
left join prediction_counts pc on pc.participant_id = p.id
left join correct_counts cc on cc.participant_id = p.id
left join score_sums ss on ss.participant_id = p.id
order by p.oracle_score desc, efficiency desc, p.nickname asc;
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
  v_platform_participant participants%rowtype;
  v_platform_wallet wallets%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(trim(p_note), ''), 'Resolved by organizer/admin.');
  v_settlement_inserted integer := 0;
  v_settled_count integer := 0;
  v_settled_credits integer := 0;
  v_balance_after integer := 0;
  v_winning_pool integer := 0;
  v_losing_pool integer := 0;
  v_net_winning_pool integer := 0;
  v_net_losing_pool integer := 0;
  v_platform_provision integer := 0;
  v_assigned_pool integer := 0;
  v_remaining_pool integer := 0;
  v_unclaimed_pool integer := 0;
  v_stake_returned integer := 0;
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
    coalesce(sum(raw_credits) filter (where outcome_id <> p_outcome_id), 0)::integer,
    coalesce(sum(greatest(raw_credits - fee_credits, 0)) filter (where outcome_id = p_outcome_id), 0)::integer,
    coalesce(sum(greatest(raw_credits - fee_credits, 0)) filter (where outcome_id <> p_outcome_id), 0)::integer,
    coalesce(sum(greatest(fee_credits, 0)), 0)::integer
  into
    v_winning_pool,
    v_losing_pool,
    v_net_winning_pool,
    v_net_losing_pool,
    v_platform_provision
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

  if v_net_winning_pool > 0 and v_net_losing_pool > 0 then
    select coalesce(
      sum(floor((v_net_losing_pool::numeric * greatest(raw_credits - fee_credits, 0)::numeric) / v_net_winning_pool::numeric)),
      0
    )::integer
    into v_assigned_pool
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0;
  end if;
  v_remaining_pool := greatest(0, v_net_losing_pool - v_assigned_pool);

  for v_position in
    select *
    from positions
    where market_id = p_market_id and outcome_id = p_outcome_id and raw_credits > 0
    order by raw_credits desc, id asc
    for update
  loop
    v_stake_returned := greatest(v_position.raw_credits - v_position.fee_credits, 0);
    v_pool_share := case
      when v_net_winning_pool > 0 then floor((v_net_losing_pool::numeric * v_stake_returned::numeric) / v_net_winning_pool::numeric)::integer
      else 0
    end;
    if v_remaining_pool > 0 then
      v_pool_share := v_pool_share + 1;
      v_remaining_pool := v_remaining_pool - 1;
    end if;
    v_payout := v_stake_returned + v_pool_share;

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
        'stakeReturned', v_stake_returned,
        'rawStake', v_position.raw_credits,
        'stakeProvision', v_position.fee_credits,
        'poolShare', v_pool_share,
        'losingPool', v_losing_pool,
        'winningPool', v_winning_pool,
        'netLosingPool', v_net_losing_pool,
        'netWinningPool', v_net_winning_pool
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

  v_unclaimed_pool := case when v_net_winning_pool = 0 then v_net_losing_pool else 0 end;

  if v_platform_provision > 0 then
    select * into v_platform_participant
    from participants
    where participant_type = 'platform'
    order by case when id = '00000000-0000-4000-8000-00000000f001'::uuid then 0 else 1 end, created_at asc, id asc
    limit 1
    for update;

    if not found then
      insert into participants (
        id,
        event_id,
        participant_type,
        nickname,
        role,
        is_avatar_hidden,
        is_banned,
        oracle_score,
        created_at
      )
      values (
        '00000000-0000-4000-8000-00000000f001',
        v_market.event_id,
        'platform',
        'vota.wtf Platform',
        'other',
        true,
        false,
        0,
        v_now
      )
      on conflict (id) do update
      set event_id = excluded.event_id,
          participant_type = 'platform',
          nickname = 'vota.wtf Platform',
          role = 'other',
          is_avatar_hidden = true,
          is_banned = false,
          oracle_score = 0
      returning * into v_platform_participant;
    end if;

    select * into v_platform_wallet
    from wallets
    where participant_id = v_platform_participant.id
    for update;

    if not found then
      insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
      values (v_platform_participant.id, 0, 0, 0)
      returning * into v_platform_wallet;
    end if;

    v_balance_after := v_platform_wallet.balance_credits + v_platform_provision;

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
      v_platform_participant.id,
      'platform_provision',
      v_platform_provision,
      'credit',
      v_balance_after,
      'Platform 2% provision: ' || v_market.title,
      p_market_id,
      v_now,
      jsonb_build_object(
        'rate', 0.02,
        'winningPool', v_winning_pool,
        'losingPool', v_losing_pool,
        'netWinningPool', v_net_winning_pool,
        'netLosingPool', v_net_losing_pool,
        'unclaimedPool', v_unclaimed_pool
      )
    )
    on conflict (market_id) where type = 'platform_provision' and market_id is not null do nothing;

    get diagnostics v_settlement_inserted = ROW_COUNT;
    if v_settlement_inserted > 0 then
      update wallets
      set balance_credits = v_balance_after
      where participant_id = v_platform_participant.id
      returning * into v_platform_wallet;
    end if;
  end if;

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
      'netWinningPool', v_net_winning_pool,
      'netLosingPool', v_net_losing_pool,
      'platformProvisionCredits', v_platform_provision,
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
    'netWinningPool', v_net_winning_pool,
    'netLosingPool', v_net_losing_pool,
    'platformProvisionCredits', v_platform_provision,
    'unclaimedPool', v_unclaimed_pool
  );
end;
$$;

alter function readiness_contract_tx() rename to readiness_contract_tx_v046;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_participant_type_platform boolean;
  v_ledger_type_platform_provision boolean;
  v_platform_main_account boolean;
  v_platform_provision_settlement boolean;
  v_ok boolean;
begin
  select readiness_contract_tx_v046() into v_contract;

  select exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'participants'
      and c.conname = 'participants_participant_type_check'
      and pg_get_constraintdef(c.oid) like '%platform%'
  ) into v_participant_type_platform;

  select exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'ledger_entries'
      and c.conname = 'ledger_entries_type_check'
      and pg_get_constraintdef(c.oid) like '%platform_provision%'
  ) into v_ledger_type_platform_provision;

  select exists (
    select 1
    from participants p
    join wallets w on w.participant_id = p.id
    where p.participant_type = 'platform'
      and p.nickname = 'vota.wtf Platform'
  ) and exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'participants_platform_main_account_idx'
  ) into v_platform_main_account;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'one_platform_provision_per_market'
  ) and to_regprocedure('resolve_market_tx(uuid,uuid,text,text)') is not null
  into v_platform_provision_settlement;

  v_ok := coalesce((v_contract ->> 'ok')::boolean, false)
    and v_participant_type_platform
    and v_ledger_type_platform_provision
    and v_platform_main_account
    and v_platform_provision_settlement;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '047_platform_provision_account',
      'platformParticipantType', v_participant_type_platform,
      'platformProvisionLedgerType', v_ledger_type_platform_provision,
      'platformMainAccount', v_platform_main_account,
      'platformProvisionSettlement', v_platform_provision_settlement,
      'ok', v_ok
    );
end;
$$;

revoke execute on function public_leaderboard_tx(text) from public, anon, authenticated;
revoke execute on function resolve_market_tx(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function readiness_contract_tx_v046() from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function public_leaderboard_tx(text) to service_role;
grant execute on function resolve_market_tx(uuid, uuid, text, text) to service_role;
grant execute on function readiness_contract_tx_v046() to service_role;
grant execute on function readiness_contract_tx() to service_role;
