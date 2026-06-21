drop policy if exists public_read_market_aggregates on market_aggregates;

revoke all privileges on table market_aggregates from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'market_aggregates'
  ) then
    alter publication supabase_realtime drop table public.market_aggregates;
  end if;
end;
$$;

alter function readiness_contract_tx() rename to readiness_contract_tx_v045;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_market_aggregates_private boolean;
  v_market_aggregates_not_realtime boolean;
begin
  select readiness_contract_tx_v045() into v_contract;

  v_market_aggregates_private := not exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = 'market_aggregates'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'SELECT'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'market_aggregates'
      and policyname = 'public_read_market_aggregates'
  );

  v_market_aggregates_not_realtime := not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'market_aggregates'
  );

  return v_contract || jsonb_build_object(
    'contractVersion', '046_private_market_aggregates',
    'marketAggregatesPrivate', v_market_aggregates_private,
    'marketAggregatesNotRealtime', v_market_aggregates_not_realtime,
    'ok', coalesce((v_contract->>'ok')::boolean, false)
      and v_market_aggregates_private
      and v_market_aggregates_not_realtime
  );
end;
$$;

revoke execute on function readiness_contract_tx_v045() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v045() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
