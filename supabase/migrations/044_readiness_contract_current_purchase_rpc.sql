alter function readiness_contract_tx() rename to readiness_contract_tx_v043;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_pending_purchase_rpc boolean;
  v_checkout_return_path_scoped boolean;
  v_ok boolean;
begin
  select readiness_contract_tx_v043() into v_contract;

  v_pending_purchase_rpc := to_regprocedure('create_or_reuse_pending_purchase_tx(uuid,uuid,text)') is not null;
  v_checkout_return_path_scoped :=
    v_pending_purchase_rpc
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'purchases'
        and column_name = 'return_to'
    );

  v_ok :=
    coalesce((v_contract->>'checkoutIntentsTable')::boolean, false)
    and coalesce((v_contract->>'checkoutIntentRecordRpc')::boolean, false)
    and coalesce((v_contract->>'checkoutIntentLinkRpc')::boolean, false)
    and v_pending_purchase_rpc
    and coalesce((v_contract->>'profileLockRpc')::boolean, false)
    and coalesce((v_contract->>'participantEmailColumn')::boolean, false)
    and coalesce((v_contract->>'participantUniqueNameIndex')::boolean, false)
    and coalesce((v_contract->>'poolSettlementRpc')::boolean, false)
    and coalesce((v_contract->>'voidMarketRpc')::boolean, false)
    and coalesce((v_contract->>'transitionMarketRpc')::boolean, false)
    and coalesce((v_contract->>'marketSignalsRpc')::boolean, false)
    and coalesce((v_contract->>'predictionLockHelperRpc')::boolean, false)
    and coalesce((v_contract->>'predictionSerializedRpc')::boolean, false)
    and coalesce((v_contract->>'agentPredictionSerializedRpc')::boolean, false)
    and coalesce((v_contract->>'predictionIdempotencyColumn')::boolean, false)
    and coalesce((v_contract->>'predictionRequestUniqueIndex')::boolean, false)
    and coalesce((v_contract->>'resolutionCreditUniqueIndex')::boolean, false)
    and coalesce((v_contract->>'voidRefundUniqueIndex')::boolean, false)
    and coalesce((v_contract->>'pendingPurchaseUniqueIndex')::boolean, false)
    and coalesce((v_contract->>'positionsSameEventTrigger')::boolean, false)
    and coalesce((v_contract->>'predictionActionsSameEventTrigger')::boolean, false)
    and coalesce((v_contract->>'stageFeatureNormalizeTrigger')::boolean, false)
    and coalesce((v_contract->>'ledgerSettlementColumns')::boolean, false)
    and coalesce((v_contract->>'repurposedSeedMarket')::boolean, false)
    and coalesce((v_contract->>'neutralHouseAgentNames')::boolean, false)
    and coalesce((v_contract->>'roleBattleStageModeRemoved')::boolean, false)
    and coalesce((v_contract->>'megathonTestingmikiMarketsSeeded')::boolean, false)
    and v_checkout_return_path_scoped
    and coalesce((v_contract->>'participantModerationRpc')::boolean, false);

  return v_contract
    || jsonb_build_object(
      'contractVersion', '044_readiness_contract_current_purchase_rpc',
      'pendingPurchaseRpc', v_pending_purchase_rpc,
      'checkoutReturnPathScoped', v_checkout_return_path_scoped,
      'ok', v_ok
    );
end;
$$;

revoke execute on function readiness_contract_tx_v043() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v043() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
