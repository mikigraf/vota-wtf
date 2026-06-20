create or replace function init_participant_session_tx(p_event_slug text, p_guard_key_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event events%rowtype;
  v_session participant_sessions%rowtype;
  v_participant participants%rowtype;
  v_wallet wallets%rowtype;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(724118991043);

  select * into v_event
  from events
  where slug = p_event_slug
  for update;
  if not found then
    raise exception 'Unknown event: %', p_event_slug;
  end if;

  if p_guard_key_hash is not null and trim(p_guard_key_hash) <> '' then
    select * into v_session
    from participant_sessions
    where event_id = v_event.id
      and guard_key_hash = p_guard_key_hash
    order by created_at desc
    limit 1
    for update;

    if found then
      update participant_sessions
      set expires_at = v_now + interval '48 hours'
      where id = v_session.id
      returning * into v_session;

      select * into v_participant from participants where id = v_session.participant_id;
      select * into v_wallet from wallets where participant_id = v_session.participant_id;
      return jsonb_build_object(
        'session', to_jsonb(v_session),
        'participant', to_jsonb(v_participant),
        'wallet', to_jsonb(v_wallet)
      );
    end if;
  end if;

  insert into participants (event_id, participant_type, nickname, role, is_avatar_hidden, is_banned, oracle_score, created_at)
  values (v_event.id, 'human', 'oracle', 'other', false, false, 0, v_now)
  returning * into v_participant;

  insert into wallets (participant_id, balance_credits, total_issued_credits, total_committed_credits)
  values (v_participant.id, coalesce(v_event.starter_credits, 1000), coalesce(v_event.starter_credits, 1000), 0)
  returning * into v_wallet;

  insert into participant_sessions (participant_id, event_id, guard_key_hash, created_at, expires_at)
  values (v_participant.id, v_event.id, nullif(trim(coalesce(p_guard_key_hash, '')), ''), v_now, v_now + interval '48 hours')
  returning * into v_session;

  insert into ledger_entries (participant_id, type, amount_credits, direction, balance_after, reason, metadata, created_at)
  values (
    v_participant.id,
    'starter_credit',
    v_wallet.balance_credits,
    'credit',
    v_wallet.balance_credits,
    'Starter MegaBucks for joining MEGATHON',
    jsonb_build_object('eventId', v_event.id),
    v_now
  );

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'participant', to_jsonb(v_participant),
    'wallet', to_jsonb(v_wallet)
  );
end;
$$;

revoke execute on function init_participant_session_tx(text, text) from public, anon, authenticated;
grant execute on function init_participant_session_tx(text, text) to service_role;
