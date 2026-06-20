alter table ledger_entries
  add column if not exists direction text check (direction in ('credit', 'debit')),
  add column if not exists balance_after integer,
  add column if not exists idempotency_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update ledger_entries
set direction = case when amount_credits >= 0 then 'credit' else 'debit' end
where direction is null;

update ledger_entries
set metadata = '{}'::jsonb
where metadata is null;

create or replace function credit_purchase_tx(p_purchase_id uuid, p_status text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase purchases%rowtype;
  v_wallet wallets%rowtype;
  v_credited boolean := false;
begin
  select * into v_purchase from purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if v_purchase.status = 'credited' then
    return jsonb_build_object('purchase', to_jsonb(v_purchase), 'credited', false);
  end if;
  if p_status <> 'paid' then
    update purchases set status = p_status where id = p_purchase_id returning * into v_purchase;
    insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
    values ('payment_status', 'purchase', p_purchase_id::text, jsonb_build_object('status', v_purchase.status), p_ip);
    return jsonb_build_object('purchase', to_jsonb(v_purchase), 'credited', false);
  end if;

  select * into v_wallet from wallets where participant_id = v_purchase.participant_id for update;
  if not found then raise exception 'Wallet not found.'; end if;

  if not exists (
    select 1 from ledger_entries
    where purchase_id = v_purchase.id and type = 'test_checkout_credit'
  ) then
    update wallets
    set balance_credits = balance_credits + v_purchase.credits,
        total_issued_credits = total_issued_credits + v_purchase.credits
    where participant_id = v_purchase.participant_id
    returning * into v_wallet;
    insert into ledger_entries (
      participant_id,
      type,
      amount_credits,
      direction,
      balance_after,
      idempotency_key,
      reason,
      purchase_id,
      metadata
    )
    values (
      v_purchase.participant_id,
      'test_checkout_credit',
      v_purchase.credits,
      'credit',
      v_wallet.balance_credits,
      v_purchase.id::text,
      'Mollie test checkout completed',
      v_purchase.id,
      jsonb_build_object('purchaseId', v_purchase.id)
    );
    v_credited := true;
  end if;

  update purchases
  set status = 'credited',
      paid_at = coalesce(paid_at, now()),
      credited_at = coalesce(credited_at, now())
  where id = p_purchase_id
  returning * into v_purchase;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values ('payment_credit', 'purchase', p_purchase_id::text, jsonb_build_object('credits', v_purchase.credits, 'status', v_purchase.status), p_ip);

  return jsonb_build_object('purchase', to_jsonb(v_purchase), 'wallet', to_jsonb(v_wallet), 'credited', v_credited);
end;
$$;

revoke execute on function init_participant_session_tx(text, text) from public, anon, authenticated;
revoke execute on function credit_purchase_tx(uuid, text, text) from public, anon, authenticated;
grant execute on function init_participant_session_tx(text, text) to service_role;
grant execute on function credit_purchase_tx(uuid, text, text) to service_role;
