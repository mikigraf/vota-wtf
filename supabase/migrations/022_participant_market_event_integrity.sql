create or replace function assert_participant_market_same_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_event_id uuid;
  v_market_event_id uuid;
begin
  select event_id into v_participant_event_id
  from participants
  where id = new.participant_id;
  if not found then
    raise exception 'Participant not found for market event integrity check.';
  end if;

  select event_id into v_market_event_id
  from markets
  where id = new.market_id;
  if not found then
    raise exception 'Market not found for market event integrity check.';
  end if;

  if v_participant_event_id <> v_market_event_id then
    raise exception 'Participant and market must belong to the same event.';
  end if;

  return new;
end;
$$;

drop trigger if exists positions_participant_market_same_event on positions;
create trigger positions_participant_market_same_event
before insert or update of participant_id, market_id on positions
for each row
execute function assert_participant_market_same_event();

drop trigger if exists prediction_actions_participant_market_same_event on prediction_actions;
create trigger prediction_actions_participant_market_same_event
before insert or update of participant_id, market_id on prediction_actions
for each row
execute function assert_participant_market_same_event();

revoke execute on function assert_participant_market_same_event() from public, anon, authenticated;
