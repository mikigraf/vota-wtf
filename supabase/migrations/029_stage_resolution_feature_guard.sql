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
  set featured_market_id = p_market_id,
      stage_mode = case
        when stage_mode = 'resolution' and v_market.status <> 'resolved' then 'live'
        else stage_mode
      end
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

revoke execute on function feature_market_tx(uuid, text) from public, anon, authenticated;
grant execute on function feature_market_tx(uuid, text) to service_role;
