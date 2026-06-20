do $$
declare
  v_sql text;
begin
  select pg_get_functiondef('public_leaderboard_tx(text)'::regprocedure)
  into v_sql;

  if v_sql is null then
    raise exception 'public_leaderboard_tx(text) is missing';
  end if;

  v_sql := replace(
    v_sql,
    'least(1, greatest(0, coalesce((people_signal_snapshot ->> resolved_outcome_id::text)::numeric, 0))) as popularity',
    'least(
      1,
      greatest(
        0,
        coalesce(
          (stage_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          (people_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          0
        )
      )
    ) as popularity'
  );

  if position('stage_signal_snapshot ->> resolved_outcome_id::text' in v_sql) = 0 then
    raise exception 'Could not patch public_leaderboard_tx popularity expression';
  end if;

  execute v_sql;
end;
$$;

revoke execute on function public_leaderboard_tx(text) from public, anon, authenticated;
grant execute on function public_leaderboard_tx(text) to service_role;
