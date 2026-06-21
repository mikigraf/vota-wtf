update events
set stage_mode = 'live'
where stage_mode = 'role_battle';

alter table events drop constraint if exists events_stage_mode_check;
alter table events
  add constraint events_stage_mode_check
  check (stage_mode in ('join', 'live', 'humans_vs_agents', 'leaderboard', 'resolution'));

create or replace function stage_market_is_compatible(p_stage_mode text, p_market_status text)
returns boolean
language sql
immutable
as $$
  select case
    when p_stage_mode = 'resolution' then p_market_status = 'resolved'
    when p_stage_mode in ('live', 'humans_vs_agents') then p_market_status <> 'resolved'
    when p_stage_mode in ('join', 'leaderboard') then true
    else false
  end;
$$;

revoke execute on function stage_market_is_compatible(text, text) from public, anon, authenticated;
grant execute on function stage_market_is_compatible(text, text) to service_role;

create or replace function normalize_event_stage_feature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature_status text;
begin
  if new.stage_mode = 'role_battle' then
    new.stage_mode := 'live';
  end if;

  if new.featured_market_id is not null then
    select status into v_feature_status
    from markets
    where id = new.featured_market_id
      and event_id = new.id
      and status <> 'draft'
      and status <> 'voided'
      and show_on_stage;

    if v_feature_status is null or not stage_market_is_compatible(new.stage_mode, v_feature_status) then
      new.featured_market_id := stage_fallback_market_id(new.id, new.stage_mode, new.featured_market_id);
    end if;
  elsif new.stage_mode in ('live', 'humans_vs_agents', 'resolution') then
    new.featured_market_id := stage_fallback_market_id(new.id, new.stage_mode, null);
  end if;

  if new.stage_mode in ('live', 'humans_vs_agents', 'resolution') and new.featured_market_id is null then
    new.stage_mode := 'join';
  end if;

  return new;
end;
$$;

drop trigger if exists events_stage_feature_normalize on events;
create trigger events_stage_feature_normalize
before insert or update of stage_mode, featured_market_id on events
for each row
execute function normalize_event_stage_feature();

revoke execute on function normalize_event_stage_feature() from public, anon, authenticated;
grant execute on function normalize_event_stage_feature() to service_role;

create or replace function update_stage_controls_tx(
  p_event_slug text,
  p_stage_mode text,
  p_featured_market_id uuid default null,
  p_emergency_paused boolean default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_market markets%rowtype;
  v_needs_market boolean := p_stage_mode in ('live', 'humans_vs_agents');
  v_needs_unresolved_market boolean := p_stage_mode in ('live', 'humans_vs_agents');
begin
  perform pg_advisory_xact_lock(724118991042);

  if p_stage_mode not in ('join', 'live', 'humans_vs_agents', 'leaderboard', 'resolution') then
    raise exception 'Unknown stage mode.';
  end if;

  select * into v_event
  from events
  where slug = p_event_slug
  for update;
  if not found then
    raise exception 'Event not found.';
  end if;

  if p_featured_market_id is not null then
    select * into v_market
    from markets
    where id = p_featured_market_id
    for update;
    if not found or v_market.event_id <> v_event.id or v_market.status in ('draft', 'voided') or not v_market.show_on_stage then
      raise exception 'Featured market is not available on stage.';
    end if;
    if not stage_market_is_compatible(p_stage_mode, v_market.status) then
      v_market := null;
    end if;
  elsif v_event.featured_market_id is not null then
    select * into v_market
    from markets
    where id = v_event.featured_market_id
      and event_id = v_event.id
      and status <> 'draft'
      and status <> 'voided'
      and show_on_stage
      and stage_market_is_compatible(p_stage_mode, status)
    for update;
  end if;

  if (v_needs_market or p_stage_mode = 'resolution') and v_market.id is null then
    select * into v_market
    from markets
    where id = stage_fallback_market_id(v_event.id, p_stage_mode, p_featured_market_id)
    for update;
  end if;

  if v_needs_market and v_market.id is null then
    raise exception 'This stage mode needs an open or locked stage-visible market.';
  end if;

  if p_stage_mode = 'resolution' then
    if v_market.id is null then
      raise exception 'Resolution reveal needs a resolved stage-visible market.';
    end if;
    if v_market.status <> 'resolved' then
      raise exception 'Resolution reveal needs a resolved market.';
    end if;
  end if;

  update events
  set stage_mode = p_stage_mode,
      featured_market_id = coalesce(v_market.id, featured_market_id),
      emergency_paused = coalesce(p_emergency_paused, emergency_paused)
  where id = v_event.id
  returning * into v_event;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values (
    'stage_control',
    'event',
    v_event.id::text,
    jsonb_build_object('mode', v_event.stage_mode, 'featuredMarketId', v_event.featured_market_id, 'emergencyPaused', v_event.emergency_paused),
    p_ip
  );

  return jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

revoke execute on function update_stage_controls_tx(text, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function update_stage_controls_tx(text, text, uuid, boolean, text) to service_role;

alter function readiness_contract_tx() rename to readiness_contract_tx_v038;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_role_battle_removed boolean;
begin
  select readiness_contract_tx_v038() into v_contract;

  select
    not exists (
      select 1
      from events
      where stage_mode = 'role_battle'
    )
    and exists (
      select 1
      from pg_constraint
      where conrelid = 'events'::regclass
        and conname = 'events_stage_mode_check'
        and pg_get_constraintdef(oid) not like '%role_battle%'
        and pg_get_constraintdef(oid) like '%humans_vs_agents%'
    )
    and stage_market_is_compatible('role_battle', 'open') = false
  into v_role_battle_removed;

  return v_contract || jsonb_build_object(
    'contractVersion', '040_remove_role_battle_stage_mode',
    'roleBattleStageModeRemoved', v_role_battle_removed,
    'ok', coalesce((v_contract->>'ok')::boolean, false) and v_role_battle_removed
  );
end;
$$;

revoke execute on function readiness_contract_tx_v038() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v038() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
