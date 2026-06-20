create table if not exists admin_login_attempts (
  key_hash text primary key,
  failure_count integer not null default 0,
  reset_at timestamptz not null
);

alter table admin_login_attempts enable row level security;

create or replace function check_admin_login_throttle(
  p_key_hash text,
  p_max_attempts integer default 8,
  p_window_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt admin_login_attempts%rowtype;
  v_now timestamptz := now();
begin
  delete from admin_login_attempts where reset_at < v_now;
  select * into v_attempt from admin_login_attempts where key_hash = p_key_hash;
  return jsonb_build_object(
    'allowed', coalesce(v_attempt.failure_count, 0) < p_max_attempts,
    'failureCount', coalesce(v_attempt.failure_count, 0),
    'resetAt', coalesce(v_attempt.reset_at, v_now + make_interval(secs => p_window_seconds))
  );
end;
$$;

create or replace function record_admin_login_failure(
  p_key_hash text,
  p_max_attempts integer default 8,
  p_window_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt admin_login_attempts%rowtype;
  v_now timestamptz := now();
begin
  insert into admin_login_attempts (key_hash, failure_count, reset_at)
  values (p_key_hash, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update
  set failure_count = case
        when admin_login_attempts.reset_at < v_now then 1
        else admin_login_attempts.failure_count + 1
      end,
      reset_at = case
        when admin_login_attempts.reset_at < v_now then v_now + make_interval(secs => p_window_seconds)
        else admin_login_attempts.reset_at
      end
  returning * into v_attempt;

  return jsonb_build_object(
    'allowed', v_attempt.failure_count < p_max_attempts,
    'failureCount', v_attempt.failure_count,
    'resetAt', v_attempt.reset_at
  );
end;
$$;

create or replace function clear_admin_login_failures(p_key_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from admin_login_attempts where key_hash = p_key_hash;
$$;

revoke execute on function check_admin_login_throttle(text, integer, integer) from public, anon, authenticated;
revoke execute on function record_admin_login_failure(text, integer, integer) from public, anon, authenticated;
revoke execute on function clear_admin_login_failures(text) from public, anon, authenticated;

grant execute on function check_admin_login_throttle(text, integer, integer) to service_role;
grant execute on function record_admin_login_failure(text, integer, integer) to service_role;
grant execute on function clear_admin_login_failures(text) to service_role;
