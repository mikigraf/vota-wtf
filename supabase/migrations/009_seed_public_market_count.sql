update markets
set
  status = 'open',
  opened_at = coalesce(opened_at, now()),
  show_on_stage = false,
  updated_at = now()
where id = '00000000-0000-4000-8000-000000000103'
  and status = 'draft';
