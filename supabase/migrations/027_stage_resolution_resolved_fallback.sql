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
    if p_stage_mode = 'resolution' and v_market.status <> 'resolved' then
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
      and (p_stage_mode <> 'resolution' or status = 'resolved')
    for update;
  end if;

  if (v_needs_market or p_stage_mode = 'resolution') and v_market.id is null then
    select * into v_market
    from markets
    where event_id = v_event.id
      and status <> 'draft'
      and status <> 'voided'
      and show_on_stage
      and (p_stage_mode <> 'resolution' or status = 'resolved')
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

grant execute on function update_stage_controls_tx(text, text, uuid, boolean, text) to service_role;
