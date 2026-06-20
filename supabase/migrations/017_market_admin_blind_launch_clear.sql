create or replace function update_market_tx(
  p_market_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_description text,
  p_category text,
  p_image_url text,
  p_resolution_rule text,
  p_outcomes jsonb,
  p_show_on_stage boolean,
  p_fair_launch_override boolean,
  p_fair_launch_people_threshold integer,
  p_fair_launch_signal_credits_threshold integer,
  p_max_action_stake integer,
  p_allow_switching boolean,
  p_blind_launch_enabled boolean,
  p_blind_launch_prediction_threshold integer,
  p_blind_launch_seconds integer,
  p_blind_launch_ended_at timestamptz,
  p_clear_blind_launch_ended_at boolean default false,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_outcome jsonb;
  v_valid_outcomes jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(724118991042);
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'Market not found.'; end if;
  if p_expected_updated_at is not null and v_market.updated_at <> p_expected_updated_at then
    raise exception 'Market changed since this form loaded. Refresh and try again.';
  end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'Market title is required.'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'Market description is required.'; end if;
  if trim(coalesce(p_resolution_rule, '')) = '' then raise exception 'Resolution rule is required.'; end if;

  if p_outcomes is not null then
    if v_market.status <> 'draft' then raise exception 'Outcome editing is only allowed while the market is a draft.'; end if;
    for v_outcome in select value from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb)) loop
      if trim(coalesce(v_outcome->>'label', '')) <> '' and jsonb_array_length(v_valid_outcomes) < 8 then
        v_valid_outcomes := v_valid_outcomes || v_outcome;
      end if;
    end loop;
    if jsonb_array_length(v_valid_outcomes) < 2 then raise exception 'At least two outcomes are required.'; end if;
  end if;

  update markets
  set title = trim(p_title),
      description = trim(p_description),
      category = coalesce(nullif(trim(coalesce(p_category, '')), ''), 'General'),
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      resolution_rule = trim(p_resolution_rule),
      show_on_stage = coalesce(p_show_on_stage, show_on_stage),
      fair_launch_override = coalesce(p_fair_launch_override, fair_launch_override),
      fair_launch_people_threshold = least(greatest(coalesce(p_fair_launch_people_threshold, fair_launch_people_threshold), 1), 500),
      fair_launch_signal_credits_threshold = least(greatest(coalesce(p_fair_launch_signal_credits_threshold, fair_launch_signal_credits_threshold), 100), 1000000),
      max_action_stake = least(greatest(coalesce(p_max_action_stake, max_action_stake), 100), 5000),
      allow_switching = coalesce(p_allow_switching, allow_switching),
      blind_launch_enabled = coalesce(p_blind_launch_enabled, blind_launch_enabled),
      blind_launch_prediction_threshold = least(greatest(coalesce(p_blind_launch_prediction_threshold, blind_launch_prediction_threshold), 1), 500),
      blind_launch_seconds = least(greatest(coalesce(p_blind_launch_seconds, blind_launch_seconds), 10), 86400),
      blind_launch_ended_at = case
        when p_clear_blind_launch_ended_at then null
        else coalesce(p_blind_launch_ended_at, blind_launch_ended_at)
      end,
      updated_at = v_now
  where id = v_market.id
  returning * into v_market;

  if p_outcomes is not null then
    delete from outcomes where market_id = v_market.id;
    for v_outcome in select value from jsonb_array_elements(v_valid_outcomes) loop
      insert into outcomes (id, market_id, label, image_url, icon)
      values (
        coalesce(nullif(v_outcome->>'id', '')::uuid, gen_random_uuid()),
        v_market.id,
        trim(v_outcome->>'label'),
        nullif(trim(coalesce(v_outcome->>'imageUrl', '')), ''),
        coalesce(nullif(left(trim(coalesce(v_outcome->>'icon', '')), 2), ''), left(trim(v_outcome->>'label'), 1))
      );
    end loop;
  end if;

  perform recompute_market_aggregate(v_market.id);
  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('update_market', 'market', v_market.id::text, jsonb_build_object('title', v_market.title), p_ip);
  return jsonb_build_object('market', to_jsonb(v_market));
end;
$$;

revoke execute on function update_market_tx(uuid, timestamptz, text, text, text, text, text, jsonb, boolean, boolean, integer, integer, integer, boolean, boolean, integer, integer, timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function update_market_tx(uuid, timestamptz, text, text, text, text, text, jsonb, boolean, boolean, integer, integer, integer, boolean, boolean, integer, integer, timestamptz, boolean, text) to service_role;
