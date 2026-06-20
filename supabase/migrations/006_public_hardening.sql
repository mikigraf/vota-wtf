alter table participant_sessions
  add column if not exists guard_key_hash text;

drop index if exists participant_sessions_guard_key_hash_idx;

create index if not exists participant_sessions_guard_key_hash_idx
  on participant_sessions(event_id, guard_key_hash)
  where guard_key_hash is not null;

create unique index if not exists participant_sessions_guard_key_hash_unique_idx
  on participant_sessions(event_id, guard_key_hash)
  where guard_key_hash is not null;

create unique index if not exists agent_profiles_event_name_idx
  on agent_profiles(event_id, name);

create unique index if not exists agent_profiles_participant_id_idx
  on agent_profiles(participant_id);

drop policy if exists public_read_markets on markets;
drop policy if exists public_read_outcomes on outcomes;
drop policy if exists public_read_market_aggregates on market_aggregates;

create policy public_read_markets on markets for select using (status <> 'draft');

create policy public_read_outcomes on outcomes for select using (
  exists (
    select 1
    from markets
    where markets.id = outcomes.market_id
      and markets.status <> 'draft'
  )
);

create policy public_read_market_aggregates on market_aggregates for select using (
  exists (
    select 1
    from markets
    where markets.id = market_aggregates.market_id
      and markets.status <> 'draft'
  )
);

create or replace function init_participant_session_tx(p_event_slug text, p_guard_key_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_session participant_sessions%rowtype;
  v_participant participants%rowtype;
  v_wallet wallets%rowtype;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(724118991043);

  select * into v_event
  from events
  where slug = p_event_slug
  for update;
  if not found then
    raise exception 'Unknown event: %', p_event_slug;
  end if;

  if p_guard_key_hash is not null and trim(p_guard_key_hash) <> '' then
    select * into v_session
    from participant_sessions
    where event_id = v_event.id
      and guard_key_hash = p_guard_key_hash
      and expires_at > v_now
    order by created_at desc
    limit 1;

    if found then
      select * into v_participant from participants where id = v_session.participant_id;
      select * into v_wallet from wallets where participant_id = v_session.participant_id;
      return jsonb_build_object(
        'session', to_jsonb(v_session),
        'participant', to_jsonb(v_participant),
        'wallet', to_jsonb(v_wallet)
      );
    end if;
  end if;

  insert into participants (event_id, participant_type, nickname, role, is_avatar_hidden, is_banned, oracle_score, created_at)
  values (v_event.id, 'human', 'oracle', 'other', false, false, 0, v_now)
  returning * into v_participant;

  insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
  values (v_participant.id, coalesce(v_event.starter_credits, 1000), coalesce(v_event.starter_credits, 1000), 0)
  returning * into v_wallet;

  insert into participant_sessions (participant_id, event_id, guard_key_hash, created_at, expires_at)
  values (v_participant.id, v_event.id, nullif(trim(coalesce(p_guard_key_hash, '')), ''), v_now, v_now + interval '48 hours')
  returning * into v_session;

  insert into ledger_entries (participant_id, type, amount_credits, direction, balance_after, reason, metadata, created_at)
  values (
    v_participant.id,
    'starter_credit',
    v_wallet.balance_credits,
    'credit',
    v_wallet.balance_credits,
    'Starter MegaBucks for joining MEGATHON',
    jsonb_build_object('eventId', v_event.id),
    v_now
  );

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'participant', to_jsonb(v_participant),
    'wallet', to_jsonb(v_wallet)
  );
end;
$$;

create or replace function ensure_house_agents_tx(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_definition record;
  v_participant participants%rowtype;
  v_agent agent_profiles%rowtype;
  v_now timestamptz := now();
  v_agents jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(724118991044);

  select * into v_event
  from events
  where slug = p_event_slug
  for update;
  if not found then
    raise exception 'Unknown event: %', p_event_slug;
  end if;

  for v_definition in
    select *
    from (values
      ('Builder Agent', 'builder', 'builder_bias'),
      ('Sponsor Agent', 'sponsor', 'sponsor_bias'),
      ('Investor Agent', 'investor', 'investor_bias'),
      ('Skeptic Agent', 'other', 'skeptic'),
      ('Chaos Agent', 'other', 'chaos')
    ) as definitions(name, role, strategy)
  loop
    select * into v_agent
    from agent_profiles
    where event_id = v_event.id and name = v_definition.name;

    if not found then
      insert into participants (event_id, participant_type, nickname, role, is_avatar_hidden, is_banned, oracle_score, created_at)
      values (v_event.id, 'house_agent', v_definition.name, v_definition.role, false, false, 0, v_now)
      returning * into v_participant;

      insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
      values (v_participant.id, 1000, 1000, 0);

      insert into agent_profiles (event_id, participant_id, name, strategy, created_at)
      values (v_event.id, v_participant.id, v_definition.name, v_definition.strategy, v_now)
      on conflict (event_id, name) do update set name = excluded.name
      returning * into v_agent;
    end if;

    v_agents := v_agents || to_jsonb(v_agent);
  end loop;

  return jsonb_build_object('agents', v_agents);
end;
$$;

revoke execute on function init_participant_session_tx(text, text) from public, anon, authenticated;
revoke execute on function ensure_house_agents_tx(text) from public, anon, authenticated;
grant execute on function init_participant_session_tx(text, text) to service_role;
grant execute on function ensure_house_agents_tx(text) to service_role;
