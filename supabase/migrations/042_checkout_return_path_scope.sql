alter table purchases
  add column if not exists return_to text;

update purchases
set return_to = '/'
where return_to is null;

drop function if exists create_or_reuse_pending_purchase_tx(uuid, uuid);

create or replace function create_or_reuse_pending_purchase_tx(
  p_participant_id uuid,
  p_purchase_id uuid,
  p_return_to text
)
returns purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_purchase purchases%rowtype;
  v_return_to text := coalesce(nullif(p_return_to, ''), '/');
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found.';
  end if;

  select * into v_purchase
  from purchases
  where participant_id = p_participant_id
    and status = 'pending'
    and return_to is not distinct from v_return_to
  order by (checkout_url is not null) desc, created_at desc, id desc
  limit 1
  for update;

  if found then
    return v_purchase;
  end if;

  update purchases
  set status = 'canceled'
  where participant_id = p_participant_id
    and status = 'pending';

  insert into purchases (id, participant_id, status, amount_eur, currency, credits, return_to, created_at)
  values (p_purchase_id, p_participant_id, 'pending', 1.00, 'EUR', 100, v_return_to, now())
  returning * into v_purchase;

  return v_purchase;
end;
$$;

alter function readiness_contract_tx() rename to readiness_contract_tx_v041;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_checkout_return_path_scoped boolean;
begin
  select readiness_contract_tx_v041() into v_contract;

  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'purchases'
        and column_name = 'return_to'
    )
    and to_regprocedure('create_or_reuse_pending_purchase_tx(uuid,uuid,text)') is not null
    and exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'one_pending_purchase_per_participant'
    )
  into v_checkout_return_path_scoped;

  return v_contract || jsonb_build_object(
    'contractVersion', '042_checkout_return_path_scope',
    'checkoutReturnPathScoped', v_checkout_return_path_scoped,
    'ok', coalesce((v_contract->>'ok')::boolean, false) and v_checkout_return_path_scoped
  );
end;
$$;

revoke execute on function create_or_reuse_pending_purchase_tx(uuid, uuid, text) from public, anon, authenticated;
grant execute on function create_or_reuse_pending_purchase_tx(uuid, uuid, text) to service_role;
revoke execute on function readiness_contract_tx_v041() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v041() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
