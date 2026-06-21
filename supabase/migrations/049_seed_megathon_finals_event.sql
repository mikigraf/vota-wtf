insert into events (id, slug, name, status, starter_credits, emergency_paused, stage_mode)
values
  ('00000000-0000-4000-8000-000000000903', 'megathon-finals', 'Megathon-Finals', 'live', 1000, false, 'join')
on conflict (slug) do update
set name = excluded.name,
    starter_credits = excluded.starter_credits;

insert into markets (
  id,
  event_id,
  title,
  description,
  category,
  image_url,
  status,
  resolution_rule,
  show_on_stage,
  fair_launch_override,
  fair_launch_people_threshold,
  fair_launch_signal_credits_threshold,
  max_action_stake,
  allow_switching,
  blind_launch_enabled,
  blind_launch_prediction_threshold,
  blind_launch_seconds,
  blind_launch_ended_at,
  opened_at
)
select
  seeded.market_id,
  e.id,
  seeded.title,
  seeded.description,
  seeded.category,
  seeded.image_url,
  seeded.status,
  seeded.resolution_rule,
  seeded.show_on_stage,
  seeded.fair_launch_override,
  seeded.fair_launch_people_threshold,
  seeded.fair_launch_signal_credits_threshold,
  seeded.max_action_stake,
  seeded.allow_switching,
  seeded.blind_launch_enabled,
  seeded.blind_launch_prediction_threshold,
  seeded.blind_launch_seconds,
  seeded.blind_launch_ended_at,
  seeded.opened_at
from (
  values
    (
      '00000000-0000-4000-8000-000000001201'::uuid,
      'megathon-finals',
      'Who wins Megathon-Finals?',
      'Pick the finalist the room thinks will win the final announcement.',
      'Finals',
      '/stage-gradient.svg',
      'open',
      'Official final winner announced by the Megathon-Finals judges on stage.',
      true,
      false,
      25,
      5000,
      250,
      true,
      true,
      20,
      120,
      null::timestamptz,
      now()
    ),
    (
      '00000000-0000-4000-8000-000000001202'::uuid,
      'megathon-finals',
      'Will the final demo run cleanly?',
      'Any visible restart, emergency fallback, or presenter apology counts as not clean.',
      'Demo',
      '/demo-signal.svg',
      'open',
      'Resolved by organizer observation during the Megathon-Finals ceremony.',
      true,
      false,
      25,
      5000,
      250,
      true,
      true,
      20,
      120,
      null::timestamptz,
      now()
    ),
    (
      '00000000-0000-4000-8000-000000001203'::uuid,
      'megathon-finals',
      'Which finalist gets the biggest crowd reaction?',
      'Call the finalist that makes the audience react hardest during the final block.',
      'Audience pulse',
      '/demo-signal.svg',
      'open',
      'Resolved by the host based on the strongest in-room reaction.',
      true,
      false,
      25,
      5000,
      250,
      true,
      true,
      20,
      120,
      null::timestamptz,
      now()
    )
) as seeded(
  market_id,
  event_slug,
  title,
  description,
  category,
  image_url,
  status,
  resolution_rule,
  show_on_stage,
  fair_launch_override,
  fair_launch_people_threshold,
  fair_launch_signal_credits_threshold,
  max_action_stake,
  allow_switching,
  blind_launch_enabled,
  blind_launch_prediction_threshold,
  blind_launch_seconds,
  blind_launch_ended_at,
  opened_at
)
join events e on e.slug = seeded.event_slug
on conflict (id) do update
set event_id = excluded.event_id,
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    image_url = excluded.image_url,
    resolution_rule = excluded.resolution_rule,
    show_on_stage = excluded.show_on_stage,
    fair_launch_override = excluded.fair_launch_override,
    fair_launch_people_threshold = excluded.fair_launch_people_threshold,
    fair_launch_signal_credits_threshold = excluded.fair_launch_signal_credits_threshold,
    max_action_stake = excluded.max_action_stake,
    allow_switching = excluded.allow_switching,
    blind_launch_enabled = excluded.blind_launch_enabled,
    blind_launch_prediction_threshold = excluded.blind_launch_prediction_threshold,
    blind_launch_seconds = excluded.blind_launch_seconds,
    updated_at = now();

insert into outcomes (id, market_id, label, icon)
values
  ('00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000001201', 'Team Orbit', 'O'),
  ('00000000-0000-4000-8000-000000001212', '00000000-0000-4000-8000-000000001201', 'Team Nova', 'N'),
  ('00000000-0000-4000-8000-000000001213', '00000000-0000-4000-8000-000000001201', 'Team Atlas', 'A'),
  ('00000000-0000-4000-8000-000000001214', '00000000-0000-4000-8000-000000001201', 'Other', '?'),
  ('00000000-0000-4000-8000-000000001221', '00000000-0000-4000-8000-000000001202', 'Yes, clean run', 'OK'),
  ('00000000-0000-4000-8000-000000001222', '00000000-0000-4000-8000-000000001202', 'No, rescue needed', '!'),
  ('00000000-0000-4000-8000-000000001231', '00000000-0000-4000-8000-000000001203', 'Orbit moment', 'OM'),
  ('00000000-0000-4000-8000-000000001232', '00000000-0000-4000-8000-000000001203', 'Nova moment', 'NM'),
  ('00000000-0000-4000-8000-000000001233', '00000000-0000-4000-8000-000000001203', 'Atlas moment', 'AM')
on conflict (id) do update
set market_id = excluded.market_id,
    label = excluded.label,
    icon = excluded.icon;

insert into market_aggregates (market_id)
values
  ('00000000-0000-4000-8000-000000001201'),
  ('00000000-0000-4000-8000-000000001202'),
  ('00000000-0000-4000-8000-000000001203')
on conflict (market_id) do nothing;

update events
set featured_market_id = '00000000-0000-4000-8000-000000001201'
where slug = 'megathon-finals'
  and featured_market_id is null;

alter function readiness_contract_tx() rename to readiness_contract_tx_v048;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_megathon_finals_seeded boolean := false;
begin
  select readiness_contract_tx_v048() into v_contract;

  select
    exists (
      select 1
      from events
      where slug = 'megathon-finals'
    )
    and (
      select count(*)
      from markets m
      join events e on e.id = m.event_id
      where e.slug = 'megathon-finals'
        and m.id in (
          '00000000-0000-4000-8000-000000001201',
          '00000000-0000-4000-8000-000000001202',
          '00000000-0000-4000-8000-000000001203'
        )
    ) >= 3
    and (
      select count(*)
      from outcomes
      where market_id in (
        '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000001202',
        '00000000-0000-4000-8000-000000001203'
      )
    ) >= 9
    and (
      select count(*)
      from market_aggregates
      where market_id in (
        '00000000-0000-4000-8000-000000001201',
        '00000000-0000-4000-8000-000000001202',
        '00000000-0000-4000-8000-000000001203'
      )
    ) = 3
  into v_megathon_finals_seeded;

  return v_contract
    || jsonb_build_object(
      'contractVersion', '049_seed_megathon_finals_event',
      'megathonFinalsSeeded', v_megathon_finals_seeded,
      'ok', coalesce((v_contract ->> 'ok')::boolean, false) and v_megathon_finals_seeded
    );
end;
$$;

revoke execute on function readiness_contract_tx_v048() from public, anon, authenticated;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;

grant execute on function readiness_contract_tx_v048() to service_role;
grant execute on function readiness_contract_tx() to service_role;
