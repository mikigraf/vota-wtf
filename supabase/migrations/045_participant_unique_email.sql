do $$
begin
  if exists (
    select 1
    from participants
    where participant_type = 'human'
      and nullif(trim(coalesce(email, '')), '') is not null
    group by event_id, lower(trim(email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate participant emails exist inside an event. Resolve them before applying participant email uniqueness.';
  end if;
end;
$$;

create unique index if not exists participants_event_human_email_unique_idx
  on participants (event_id, (lower(trim(email))))
  where participant_type = 'human'
    and nullif(trim(coalesce(email, '')), '') is not null;

create or replace function update_participant_profile_tx(
  p_participant_id uuid,
  p_nickname text,
  p_email text,
  p_role text default 'other',
  p_avatar_url text default null
)
returns participants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_previous_role text;
  v_market_id uuid;
  v_nickname text := trim(coalesce(p_nickname, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := trim(coalesce(p_role, 'other'));
begin
  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found';
  end if;

  if v_participant.participant_type = 'human'
    and nullif(trim(v_participant.nickname), '') is not null
    and lower(trim(v_participant.nickname)) <> 'oracle'
    and nullif(trim(coalesce(v_participant.email, '')), '') is not null
  then
    raise exception 'Profile is locked after entering the arena.';
  end if;

  if v_nickname = '' or lower(v_nickname) = 'oracle' then
    raise exception 'Enter a stage name before joining.';
  end if;

  if v_email = '' or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter your email address before joining.';
  end if;

  if exists (
    select 1
    from participants p
    where p.event_id = v_participant.event_id
      and p.id <> v_participant.id
      and p.participant_type = 'human'
      and lower(trim(p.nickname)) = lower(v_nickname)
      and lower(trim(p.nickname)) <> 'oracle'
  ) then
    raise exception 'That stage name is already taken.';
  end if;

  if exists (
    select 1
    from participants p
    where p.event_id = v_participant.event_id
      and p.id <> v_participant.id
      and p.participant_type = 'human'
      and lower(trim(coalesce(p.email, ''))) = v_email
  ) then
    raise exception 'That email is already in the arena.';
  end if;

  if v_role not in ('builder', 'sponsor', 'investor', 'other') then
    v_role := 'other';
  end if;

  v_previous_role := v_participant.role;
  update participants
  set nickname = v_nickname,
      email = v_email,
      role = v_role,
      avatar_url = coalesce(nullif(p_avatar_url, ''), avatar_url)
  where id = v_participant.id
  returning * into v_participant;

  if v_previous_role is distinct from v_participant.role then
    for v_market_id in
      select distinct market_id
      from positions
      where participant_id = v_participant.id
    loop
      perform recompute_market_aggregate(v_market_id);
    end loop;
  end if;

  return v_participant;
end;
$$;

alter function readiness_contract_tx() rename to readiness_contract_tx_v044;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_participant_unique_email_index boolean;
  v_ok boolean;
begin
  select readiness_contract_tx_v044() into v_contract;

  v_participant_unique_email_index := exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'participants_event_human_email_unique_idx'
  );

  v_ok :=
    coalesce((v_contract->>'ok')::boolean, false)
    and v_participant_unique_email_index;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '045_participant_unique_email',
      'participantUniqueEmailIndex', v_participant_unique_email_index,
      'ok', v_ok
    );
end;
$$;

revoke execute on function update_participant_profile_tx(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function update_participant_profile_tx(uuid, text, text, text, text) to service_role;
revoke execute on function readiness_contract_tx_v044() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v044() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
