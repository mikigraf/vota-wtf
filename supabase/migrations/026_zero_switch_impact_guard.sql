do $$
declare
  v_sql text;
begin
  select pg_get_functiondef('place_prediction_tx(uuid, uuid, uuid, integer, text)'::regprocedure)
  into v_sql;

  if v_sql is null then
    raise exception 'place_prediction_tx(uuid, uuid, uuid, integer, text) is missing';
  end if;

  v_sql := replace(
    v_sql,
    E'  v_allowed := least(v_wallet.balance_credits, v_market.max_action_stake, v_step_cap, v_share_max, v_impact_max);\n  if v_amount > v_allowed then\n',
    E'  v_allowed := least(v_wallet.balance_credits, v_market.max_action_stake, v_step_cap, v_share_max, v_impact_max);\n  if v_position.id is not null and v_position.outcome_id <> p_outcome_id and v_impact_max <= 0 then\n    raise exception ''This market cannot absorb that switch yet. This market can absorb up to 0 Credits from you right now.'';\n  end if;\n  if v_amount > v_allowed then\n'
  );

  if v_sql not like '%v_impact_max <= 0%' then
    raise exception 'Could not patch place_prediction_tx zero-switch impact guard';
  end if;

  execute v_sql;
end;
$$;

revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) to service_role;
