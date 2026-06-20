do $$
declare
  v_sql text;
begin
  select pg_get_functiondef('place_prediction_tx(uuid, uuid, uuid, integer, text)'::regprocedure)
  into v_sql;

  if v_sql is null then
    raise exception 'place_prediction_tx(uuid, uuid, uuid, integer, text) is missing';
  end if;

  v_sql := replace(v_sql, E'      or v_participant.avatar_url is null\n', '');

  if position('lower(trim(v_participant.nickname)) = ''oracle''' in v_sql) = 0 then
    v_sql := replace(
      v_sql,
      'nullif(trim(v_participant.nickname), '''') is null',
      'nullif(trim(v_participant.nickname), '''') is null
      or lower(trim(v_participant.nickname)) = ''oracle'''
    );
  end if;

  execute v_sql;
end;
$$;

revoke execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function place_prediction_tx(uuid, uuid, uuid, integer, text) to service_role;
