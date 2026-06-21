alter function readiness_contract_tx() rename to readiness_contract_tx_v050;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_delete_market_rpc boolean;
begin
  select readiness_contract_tx_v050() into v_contract;

  v_delete_market_rpc := to_regprocedure('delete_market_tx(uuid,text)') is not null;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '051_delete_market_readiness_contract',
      'deleteMarketRpc', v_delete_market_rpc,
      'ok', coalesce((v_contract ->> 'ok')::boolean, false) and v_delete_market_rpc
    );
end;
$$;

revoke execute on function readiness_contract_tx_v050() from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function readiness_contract_tx_v050() to service_role;
grant execute on function readiness_contract_tx() to service_role;
