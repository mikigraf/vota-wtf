insert into events (id, slug, name, status, starter_credits, emergency_paused, stage_mode)
values
  ('00000000-0000-4000-8000-000000000901', 'megathon', 'megathon', 'live', 1000, false, 'join'),
  ('00000000-0000-4000-8000-000000000902', 'testingmiki', 'testingmiki', 'live', 1000, false, 'join')
on conflict (slug) do update
set name = excluded.name,
    starter_credits = excluded.starter_credits;
