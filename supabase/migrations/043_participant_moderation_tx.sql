create or replace function moderate_participant_tx(
  p_participant_id uuid,
  p_event_slug text default null,
  p_action text default null,
  p_nickname text default null,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_event events%rowtype;
  v_market_id uuid;
  v_market_ids uuid[] := array[]::uuid[];
  v_nickname text;
  v_previous_nickname text;
  v_previous_is_avatar_hidden boolean;
  v_previous_is_banned boolean;
begin
  if coalesce(p_action, '') not in ('rename', 'hide_avatar', 'show_avatar', 'ban', 'unban') then
    raise exception 'Unknown participant action.';
  end if;
  if nullif(trim(coalesce(p_event_slug, '')), '') is null then
    raise exception 'Event context is required.';
  end if;

  select * into v_participant
  from participants
  where id = p_participant_id
  for update;
  if not found then
    raise exception 'Participant not found.';
  end if;

  select * into v_event
  from events
  where slug = trim(p_event_slug)
  for update;
  if not found or v_event.id <> v_participant.event_id then
    raise exception 'Participant does not belong to this event.';
  end if;

  v_previous_nickname := v_participant.nickname;
  v_previous_is_avatar_hidden := v_participant.is_avatar_hidden;
  v_previous_is_banned := v_participant.is_banned;

  if p_action = 'rename' then
    v_nickname := trim(coalesce(nullif(p_nickname, ''), v_participant.nickname));
    if v_nickname = '' or lower(v_nickname) = 'oracle' then
      raise exception 'Enter a stage name before joining.';
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
    update participants
    set nickname = v_nickname
    where id = v_participant.id
    returning * into v_participant;
  elsif p_action = 'hide_avatar' then
    update participants
    set is_avatar_hidden = true
    where id = v_participant.id
    returning * into v_participant;
  elsif p_action = 'show_avatar' then
    update participants
    set is_avatar_hidden = false
    where id = v_participant.id
    returning * into v_participant;
  elsif p_action = 'ban' then
    update participants
    set is_banned = true
    where id = v_participant.id
    returning * into v_participant;
  elsif p_action = 'unban' then
    update participants
    set is_banned = false
    where id = v_participant.id
    returning * into v_participant;
  end if;

  select coalesce(array_agg(distinct p.market_id order by p.market_id), array[]::uuid[])
  into v_market_ids
  from positions p
  where p.participant_id = v_participant.id;

  foreach v_market_id in array v_market_ids loop
    perform recompute_market_aggregate(v_market_id);
  end loop;

  insert into admin_audit_logs (action, entity_type, entity_id, details, ip)
  values (
    'participant_' || p_action,
    'participant',
    v_participant.id::text,
    jsonb_build_object(
      'nickname', v_participant.nickname,
      'previousNickname', v_previous_nickname,
      'isAvatarHidden', v_participant.is_avatar_hidden,
      'previousIsAvatarHidden', v_previous_is_avatar_hidden,
      'isBanned', v_participant.is_banned,
      'previousIsBanned', v_previous_is_banned,
      'affectedMarketIds', to_jsonb(v_market_ids)
    ),
    p_ip
  );

  return jsonb_build_object(
    'participant', to_jsonb(v_participant),
    'affectedMarketIds', to_jsonb(v_market_ids)
  );
end;
$$;

revoke execute on function moderate_participant_tx(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function moderate_participant_tx(uuid, text, text, text, text) to service_role;

alter function readiness_contract_tx() rename to readiness_contract_tx_v042;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_moderation_rpc boolean;
begin
  select readiness_contract_tx_v042() into v_contract;
  v_moderation_rpc := to_regprocedure('moderate_participant_tx(uuid,text,text,text,text)') is not null;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '043_participant_moderation_tx',
      'participantModerationRpc', v_moderation_rpc,
      'ok', coalesce((v_contract ->> 'ok')::boolean, false) and v_moderation_rpc
    );
end;
$$;

revoke execute on function readiness_contract_tx_v042() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v042() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
