insert into events (id, slug, name, status, starter_credits, emergency_paused, stage_mode)
values
  ('00000000-0000-4000-8000-000000000901', 'megathon', 'megathon', 'live', 1000, false, 'join'),
  ('00000000-0000-4000-8000-000000000902', 'testingmiki', 'testingmiki', 'live', 1000, false, 'join')
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
      '00000000-0000-4000-8000-000000001001'::uuid,
      'megathon',
      'Who wins Megathon?',
      'Pick the team the room thinks will win the final announcement.',
      'Finals',
      '/stage-gradient.svg',
      'open',
      'Official final winner announced by the Megathon judges on stage.',
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
      '00000000-0000-4000-8000-000000001002'::uuid,
      'megathon',
      'Will a live demo need a rescue?',
      'Any visible restart, emergency fallback, or presenter apology counts.',
      'Demo',
      '/demo-signal.svg',
      'open',
      'Resolved by organizer observation during the Megathon ceremony.',
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
      '00000000-0000-4000-8000-000000001003'::uuid,
      'megathon',
      'Which moment gets the loudest reaction?',
      'Call the ceremony moment that makes the audience erupt first.',
      'Audience pulse',
      '/demo-signal.svg',
      'open',
      'Resolved by the host based on the loudest in-room reaction.',
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
      '00000000-0000-4000-8000-000000001101'::uuid,
      'testingmiki',
      'Who wins testingmiki?',
      'Test room market for rehearsing the full participant and admin flow.',
      'Testing',
      '/stage-gradient.svg',
      'open',
      'Resolved by the test admin during rehearsal.',
      true,
      true,
      1,
      100,
      500,
      true,
      false,
      1,
      10,
      now(),
      now()
    ),
    (
      '00000000-0000-4000-8000-000000001102'::uuid,
      'testingmiki',
      'Will testingmiki resolve cleanly?',
      'A rehearsal card for lock, resolve, leaderboard, and receipt checks.',
      'Testing',
      '/demo-signal.svg',
      'open',
      'Resolved by the test admin after verifying the rehearsal flow.',
      true,
      true,
      1,
      100,
      500,
      true,
      false,
      1,
      10,
      now(),
      now()
    ),
    (
      '00000000-0000-4000-8000-000000001103'::uuid,
      'testingmiki',
      'Which testingmiki signal moves fastest?',
      'Rehearsal card for odds movement, blind launch, and stage momentum checks.',
      'Testing',
      '/demo-signal.svg',
      'open',
      'Resolved by the test admin after watching the rehearsal odds timeline.',
      true,
      true,
      1,
      100,
      500,
      true,
      false,
      1,
      10,
      now(),
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
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000001001', 'Team Orbit', 'O'),
  ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000001001', 'Team Nova', 'N'),
  ('00000000-0000-4000-8000-000000001013', '00000000-0000-4000-8000-000000001001', 'Team Atlas', 'A'),
  ('00000000-0000-4000-8000-000000001014', '00000000-0000-4000-8000-000000001001', 'Other', '?'),
  ('00000000-0000-4000-8000-000000001021', '00000000-0000-4000-8000-000000001002', 'Yes, rescue needed', '!'),
  ('00000000-0000-4000-8000-000000001022', '00000000-0000-4000-8000-000000001002', 'No, clean demos', 'OK'),
  ('00000000-0000-4000-8000-000000001031', '00000000-0000-4000-8000-000000001003', 'Winner reveal', 'WR'),
  ('00000000-0000-4000-8000-000000001032', '00000000-0000-4000-8000-000000001003', 'Demo surprise', 'DS'),
  ('00000000-0000-4000-8000-000000001033', '00000000-0000-4000-8000-000000001003', 'Founder cameo', 'FC'),
  ('00000000-0000-4000-8000-000000001111', '00000000-0000-4000-8000-000000001101', 'Team Orbit', 'O'),
  ('00000000-0000-4000-8000-000000001112', '00000000-0000-4000-8000-000000001101', 'Team Nova', 'N'),
  ('00000000-0000-4000-8000-000000001113', '00000000-0000-4000-8000-000000001101', 'Team Atlas', 'A'),
  ('00000000-0000-4000-8000-000000001121', '00000000-0000-4000-8000-000000001102', 'Yes', 'Y'),
  ('00000000-0000-4000-8000-000000001122', '00000000-0000-4000-8000-000000001102', 'No', 'N'),
  ('00000000-0000-4000-8000-000000001131', '00000000-0000-4000-8000-000000001103', 'Orbit surge', 'OS'),
  ('00000000-0000-4000-8000-000000001132', '00000000-0000-4000-8000-000000001103', 'Demo rescue', 'DR'),
  ('00000000-0000-4000-8000-000000001133', '00000000-0000-4000-8000-000000001103', 'Crowd flip', 'CF')
on conflict (id) do update
set market_id = excluded.market_id,
    label = excluded.label,
    icon = excluded.icon;

insert into market_aggregates (market_id)
values
  ('00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000001003'),
  ('00000000-0000-4000-8000-000000001101'),
  ('00000000-0000-4000-8000-000000001102'),
  ('00000000-0000-4000-8000-000000001103')
on conflict (market_id) do nothing;

update events
set featured_market_id = '00000000-0000-4000-8000-000000001001'
where slug = 'megathon'
  and featured_market_id is null;

update events
set featured_market_id = '00000000-0000-4000-8000-000000001101'
where slug = 'testingmiki'
  and featured_market_id is null;

alter function readiness_contract_tx() rename to readiness_contract_tx_v040;

create or replace function readiness_contract_tx()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract jsonb;
  v_rooms_seeded boolean;
begin
  select readiness_contract_tx_v040() into v_contract;

  select
    exists (
      select 1
      from events
      where slug = 'megathon'
    )
    and exists (
      select 1
      from events
      where slug = 'testingmiki'
    )
    and (
      select count(*)
      from markets m
      join events e on e.id = m.event_id
      where e.slug = 'megathon'
        and m.id in (
          '00000000-0000-4000-8000-000000001001',
          '00000000-0000-4000-8000-000000001002',
          '00000000-0000-4000-8000-000000001003'
        )
    ) >= 3
    and (
      select count(*)
      from markets m
      join events e on e.id = m.event_id
      where e.slug = 'testingmiki'
        and m.id in (
          '00000000-0000-4000-8000-000000001101',
          '00000000-0000-4000-8000-000000001102',
          '00000000-0000-4000-8000-000000001103'
        )
    ) >= 3
    and (
      select count(*)
      from outcomes
      where market_id in (
        '00000000-0000-4000-8000-000000001001',
        '00000000-0000-4000-8000-000000001002',
        '00000000-0000-4000-8000-000000001003',
        '00000000-0000-4000-8000-000000001101',
        '00000000-0000-4000-8000-000000001102',
        '00000000-0000-4000-8000-000000001103'
      )
    ) >= 17
    and (
      select count(*)
      from market_aggregates
      where market_id in (
        '00000000-0000-4000-8000-000000001001',
        '00000000-0000-4000-8000-000000001002',
        '00000000-0000-4000-8000-000000001003',
        '00000000-0000-4000-8000-000000001101',
        '00000000-0000-4000-8000-000000001102',
        '00000000-0000-4000-8000-000000001103'
      )
    ) = 6
  into v_rooms_seeded;

  return v_contract || jsonb_build_object(
    'contractVersion', '041_seed_megathon_testingmiki_markets',
    'megathonTestingmikiMarketsSeeded', v_rooms_seeded,
    'ok', coalesce((v_contract->>'ok')::boolean, false) and v_rooms_seeded
  );
end;
$$;

revoke execute on function readiness_contract_tx_v040() from public, anon, authenticated;
grant execute on function readiness_contract_tx_v040() to service_role;
revoke execute on function readiness_contract_tx() from public, anon, authenticated;
grant execute on function readiness_contract_tx() to service_role;
