create extension if not exists "pgcrypto";

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status text not null default 'live' check (status in ('draft', 'live', 'paused', 'finished')),
  starter_credits integer not null default 1000,
  emergency_paused boolean not null default false,
  stage_mode text not null default 'join' check (stage_mode in ('join', 'live', 'role_battle', 'humans_vs_agents', 'leaderboard', 'resolution')),
  featured_market_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_type text not null default 'human' check (participant_type in ('human', 'house_agent', 'external_agent')),
  nickname text not null,
  role text not null default 'other' check (role in ('builder', 'sponsor', 'investor', 'other')),
  avatar_url text,
  is_avatar_hidden boolean not null default false,
  is_banned boolean not null default false,
  oracle_score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists participant_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  guard_key_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table participant_sessions
  add column if not exists guard_key_hash text;

create unique index if not exists participant_sessions_guard_key_hash_idx
  on participant_sessions(event_id, guard_key_hash)
  where guard_key_hash is not null;

create table if not exists markets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  description text not null,
  category text not null,
  image_url text,
  status text not null default 'draft' check (status in ('draft', 'open', 'locked', 'resolved', 'voided')),
  resolution_rule text not null,
  resolved_outcome_id uuid,
  resolution_note text,
  show_on_stage boolean not null default true,
  fair_launch_override boolean not null default false,
  fair_launch_people_threshold integer not null default 25 check (fair_launch_people_threshold > 0),
  fair_launch_signal_credits_threshold integer not null default 5000 check (fair_launch_signal_credits_threshold >= 100),
  max_action_stake integer not null default 250,
  allow_switching boolean not null default true,
  opened_at timestamptz,
  locked_at timestamptz,
  resolved_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table markets
  add column if not exists fair_launch_people_threshold integer not null default 25 check (fair_launch_people_threshold > 0),
  add column if not exists fair_launch_signal_credits_threshold integer not null default 5000 check (fair_launch_signal_credits_threshold >= 100);

create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  label text not null,
  image_url text,
  icon text,
  unique (market_id, id)
);

alter table events
  add constraint events_featured_market_fk
  foreign key (featured_market_id) references markets(id) deferrable initially deferred;

alter table markets
  add constraint markets_resolved_outcome_fk
  foreign key (resolved_outcome_id) references outcomes(id) deferrable initially deferred;

alter table markets
  add constraint markets_resolved_outcome_same_market_fk
  foreign key (id, resolved_outcome_id) references outcomes(market_id, id) deferrable initially deferred;

create table if not exists wallets (
  participant_id uuid primary key references participants(id) on delete cascade,
  balance_credits integer not null default 0 check (balance_credits >= 0),
  total_issued_credits integer not null default 0,
  total_committed_credits integer not null default 0
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  outcome_id uuid not null references outcomes(id),
  raw_credits integer not null default 0,
  signal_credits integer not null default 0,
  fee_credits integer not null default 0,
  last_action_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, market_id)
);

alter table positions
  add constraint positions_outcome_same_market_fk
  foreign key (market_id, outcome_id) references outcomes(market_id, id) deferrable initially deferred;

create table if not exists prediction_actions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  market_id uuid not null references markets(id),
  outcome_id uuid not null references outcomes(id),
  action_type text not null check (action_type in ('initial', 'add', 'switch', 'admin_void')),
  amount_credits integer not null,
  signal_credits integer not null,
  fee_credits integer not null,
  people_signal_snapshot jsonb not null default '{}'::jsonb,
  credit_signal_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table prediction_actions
  add constraint prediction_actions_outcome_same_market_fk
  foreign key (market_id, outcome_id) references outcomes(market_id, id) deferrable initially deferred;

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  type text not null check (type in ('starter_credit', 'prediction_commit', 'test_checkout_credit', 'void_refund', 'resolution_credit')),
  amount_credits integer not null,
  reason text not null,
  market_id uuid references markets(id),
  purchase_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists market_aggregates (
  market_id uuid primary key references markets(id) on delete cascade,
  total_people integer not null default 0,
  total_signal_credits integer not null default 0,
  outcome_people_counts jsonb not null default '{}'::jsonb,
  outcome_credit_totals jsonb not null default '{}'::jsonb,
  role_breakdown jsonb not null default '{}'::jsonb,
  agent_breakdown jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  status text not null default 'pending' check (status in ('pending', 'paid', 'credited', 'failed', 'canceled')),
  amount_eur numeric(8, 2) not null default 1.00,
  currency text not null default 'EUR',
  credits integer not null default 100,
  mollie_payment_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  credited_at timestamptz
);

alter table ledger_entries
  add constraint ledger_purchase_fk foreign key (purchase_id) references purchases(id) deferrable initially deferred;

create unique index if not exists one_checkout_credit_per_purchase
  on ledger_entries (purchase_id)
  where type = 'test_checkout_credit' and purchase_id is not null;

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create table if not exists agent_profiles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  name text not null,
  strategy text not null check (strategy in ('builder_bias', 'sponsor_bias', 'investor_bias', 'skeptic', 'chaos')),
  created_at timestamptz not null default now()
);

create unique index if not exists agent_profiles_event_name_idx
  on agent_profiles(event_id, name);

create unique index if not exists agent_profiles_participant_id_idx
  on agent_profiles(participant_id);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_profile_id uuid not null references agent_profiles(id) on delete cascade,
  market_id uuid not null references markets(id),
  outcome_id uuid references outcomes(id),
  status text not null check (status in ('planned', 'placed', 'skipped', 'failed')),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table agent_runs
  add constraint agent_runs_outcome_same_market_fk
  foreign key (market_id, outcome_id) references outcomes(market_id, id) deferrable initially deferred;

create table if not exists mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create unique index if not exists mcp_tokens_token_hash_idx
  on mcp_tokens(token_hash);

alter table events enable row level security;
alter table participants enable row level security;
alter table participant_sessions enable row level security;
alter table markets enable row level security;
alter table outcomes enable row level security;
alter table positions enable row level security;
alter table prediction_actions enable row level security;
alter table wallets enable row level security;
alter table ledger_entries enable row level security;
alter table market_aggregates enable row level security;
alter table purchases enable row level security;
alter table admin_audit_logs enable row level security;
alter table agent_profiles enable row level security;
alter table agent_runs enable row level security;
alter table mcp_tokens enable row level security;

drop policy if exists public_read_events on events;
drop policy if exists public_read_participants on participants;
drop policy if exists public_read_markets on markets;
drop policy if exists public_read_outcomes on outcomes;
drop policy if exists public_read_market_aggregates on market_aggregates;

create policy public_read_events on events for select using (true);
create policy public_read_markets on markets for select using (status <> 'draft');
create policy public_read_outcomes on outcomes for select using (
  exists (
    select 1
    from markets
    where markets.id = outcomes.market_id
      and markets.status <> 'draft'
  )
);
create policy public_read_market_aggregates on market_aggregates for select using (
  exists (
    select 1
    from markets
    where markets.id = market_aggregates.market_id
      and markets.status <> 'draft'
  )
);

grant select on events, markets, outcomes, market_aggregates to anon, authenticated;
revoke all privileges on table
  participants,
  participant_sessions,
  wallets,
  positions,
  prediction_actions,
  ledger_entries,
  purchases,
  admin_audit_logs,
  agent_profiles,
  agent_runs,
  mcp_tokens
from public, anon, authenticated;

do $$
declare
  v_table text;
  v_policy record;
  v_private_tables text[] := array[
    'participants',
    'participant_sessions',
    'wallets',
    'positions',
    'prediction_actions',
    'ledger_entries',
    'purchases',
    'admin_audit_logs',
    'agent_profiles',
    'agent_runs',
    'mcp_tokens'
  ];
begin
  foreach v_table in array v_private_tables loop
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;
  end loop;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array v_private_tables loop
      if exists (
        select 1
        from pg_publication_rel pr
        join pg_publication p on p.oid = pr.prpubid
        join pg_class c on c.oid = pr.prrelid
        join pg_namespace n on n.oid = c.relnamespace
        where p.pubname = 'supabase_realtime'
          and n.nspname = 'public'
          and c.relname = v_table
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', v_table);
      end if;
    end loop;
    foreach v_table in array array['events', 'markets', 'outcomes', 'market_aggregates'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end $$;

insert into events (id, slug, name, status, starter_credits)
values ('00000000-0000-4000-8000-000000000001', 'megathon-2026', 'MEGATHON 2026', 'live', 1000)
on conflict (slug) do nothing;

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
  opened_at
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Who wins MEGATHON?',
    'Call the team the room thinks will take the final announcement.',
    'Finals',
    '/stage-gradient.svg',
    'open',
    'Official final winner announced by the MEGATHON judges on stage.',
    true,
    false,
    25,
    5000,
    250,
    true,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'Will a live demo fail on stage?',
    'Any demo that needs an emergency restart, visible fallback, or presenter apology counts.',
    'Chaos',
    '/demo-signal.svg',
    'open',
    'Resolved by organizer observation during the final ceremony.',
    true,
    false,
    25,
    5000,
    250,
    true,
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'Which role predicts best?',
    'The room calls whether Builders, Sponsors, Investors, or Other guests top Oracle Score.',
    'Role battle',
    '/role-battle.svg',
    'draft',
    'Resolved from final role leaderboard after judging.',
    false,
    false,
    25,
    5000,
    250,
    true,
    null
  )
on conflict (id) do nothing;

insert into outcomes (id, market_id, label, icon)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Team Orbit', 'O'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Team Nova', 'N'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 'Team Atlas', 'A'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000101', 'Other', '?'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000102', 'Yes, chaos wins', '!'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000102', 'No, clean demos', 'OK'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000103', 'Builders', 'B'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000103', 'Sponsors', 'S'),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-000000000103', 'Investors', 'I'),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000103', 'Other', '*')
on conflict (id) do nothing;

update events
set featured_market_id = '00000000-0000-4000-8000-000000000101'
where id = '00000000-0000-4000-8000-000000000001' and featured_market_id is null;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('market-images', 'market-images', true)
on conflict (id) do update set public = true;
