drop function if exists transition_market_tx(uuid, text);
drop function if exists resolve_market_tx(uuid, uuid, text);
drop function if exists feature_market_tx(uuid);
drop function if exists update_stage_controls_tx(text, text, uuid, boolean);

create or replace function transition_market_tx(p_market_id uuid, p_action text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(724118991042);

  select * into v_market
  from markets
  where id = p_market_id
  for update;
  if not found then
    raise exception 'Market not found';
  end if;

  if p_action = 'open' then
    if v_market.status <> 'draft' then
      raise exception 'Only draft markets can be opened.';
    end if;
    update markets
    set status = 'open',
        opened_at = coalesce(opened_at, v_now),
        updated_at = v_now
    where id = p_market_id
    returning * into v_market;
  elsif p_action = 'lock' then
    if v_market.status <> 'open' then
      raise exception 'Only open markets can be locked.';
    end if;
    update markets
    set status = 'locked',
        locked_at = v_now,
        updated_at = v_now
    where id = p_market_id
    returning * into v_market;
  else
    raise exception 'Unknown market transition.';
  end if;

  v_aggregate := recompute_market_aggregate(p_market_id);

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values (p_action || '_market', 'market', p_market_id::text, jsonb_build_object('title', v_market.title), p_ip);

  return jsonb_build_object(
    'market', to_jsonb(v_market),
    'aggregate', to_jsonb(v_aggregate)
  );
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
  v_aggregate market_aggregates%rowtype;
  v_now timestamptz := now();
  v_note text := coalesce(nullif(trim(p_note), ''), 'Resolved by organizer/admin.');
begin
  perform pg_advisory_xact_lock(724118991042);

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

  if v_market.status <> 'locked' then
    raise exception 'Only locked markets can be resolved.';
  end if;

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

  perform recompute_oracle_scores_tx();
  v_aggregate := recompute_market_aggregate(p_market_id);

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('resolve_market', 'market', p_market_id::text, jsonb_build_object('outcomeId', p_outcome_id, 'note', v_note), p_ip);

  return jsonb_build_object(
    'market', to_jsonb(v_market),
    'aggregate', to_jsonb(v_aggregate)
  );
end;
$$;

create or replace function feature_market_tx(p_market_id uuid, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_market markets%rowtype;
  v_event_id uuid;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(724118991042);

  select event_id into v_event_id
  from markets
  where id = p_market_id;
  if not found then
    raise exception 'Market not found.';
  end if;

  select * into v_event
  from events
  where id = v_event_id
  for update;
  if not found then
    raise exception 'Event not found.';
  end if;

  select * into v_market
  from markets
  where id = p_market_id
  for update;
  if not found then
    raise exception 'Market not found.';
  end if;

  if v_market.status in ('draft', 'voided') then
    raise exception 'Only non-voided public markets can be featured on stage.';
  end if;

  update markets
  set show_on_stage = true,
      updated_at = v_now
  where id = p_market_id
  returning * into v_market;

  update events
  set featured_market_id = p_market_id
  where id = v_event.id
  returning * into v_event;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('feature_market', 'market', p_market_id::text, jsonb_build_object('title', v_market.title, 'eventSlug', v_event.slug), p_ip);

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'market', to_jsonb(v_market)
  );
end;
$$;

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
  v_needs_market boolean := p_stage_mode in ('live', 'role_battle', 'humans_vs_agents');
begin
  perform pg_advisory_xact_lock(724118991042);

  if p_stage_mode not in ('join', 'live', 'role_battle', 'humans_vs_agents', 'leaderboard', 'resolution') then
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
  elsif v_event.featured_market_id is not null then
    select * into v_market
    from markets
    where id = v_event.featured_market_id
      and event_id = v_event.id
      and status <> 'draft'
      and status <> 'voided'
      and show_on_stage
    for update;
  end if;

  if (v_needs_market or p_stage_mode = 'resolution') and v_market.id is null then
    select * into v_market
    from markets
    where event_id = v_event.id
      and status <> 'draft'
      and status <> 'voided'
      and show_on_stage
    order by created_at asc
    limit 1
    for update;
  end if;

  if v_needs_market and v_market.id is null then
    raise exception 'This stage mode needs a stage-visible market.';
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
    jsonb_build_object('mode', p_stage_mode, 'featuredMarketId', v_event.featured_market_id, 'emergencyPaused', v_event.emergency_paused),
    p_ip
  );

  return jsonb_build_object('event', to_jsonb(v_event));
end;
$$;

revoke execute on function transition_market_tx(uuid, text, text) from public, anon, authenticated;
revoke execute on function resolve_market_tx(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function feature_market_tx(uuid, text) from public, anon, authenticated;
revoke execute on function update_stage_controls_tx(text, text, uuid, boolean, text) from public, anon, authenticated;

grant execute on function transition_market_tx(uuid, text, text) to service_role;
grant execute on function resolve_market_tx(uuid, uuid, text, text) to service_role;
grant execute on function feature_market_tx(uuid, text) to service_role;
grant execute on function update_stage_controls_tx(text, text, uuid, boolean, text) to service_role;
