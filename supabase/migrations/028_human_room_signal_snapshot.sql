create or replace function market_signal_snapshot(p_market_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with outcome_base as (
  select
    o.id::text as outcome_id,
    coalesce(c.people_count, 0)::numeric as people_count,
    coalesce(c.signal_total, 0)::numeric as credit_total
  from outcomes o
  left join (
    select
      p.outcome_id,
      count(*)::int as people_count,
      coalesce(sum(p.signal_credits), 0)::int as signal_total
    from positions p
    join participants par on par.id = p.participant_id
    where p.market_id = p_market_id
      and p.signal_credits > 0
      and not par.is_banned
      and par.participant_type = 'human'
    group by p.outcome_id
  ) c on c.outcome_id = o.id
  where o.market_id = p_market_id
),
totals as (
  select
    *,
    sum(people_count) over () as total_people,
    sum(credit_total) over () as total_signal,
    ln(1 + greatest(credit_total, 0)) as conviction_weight
  from outcome_base
),
weighted as (
  select *, sum(conviction_weight) over () as total_weight
  from totals
),
signals as (
  select
    outcome_id,
    case when total_people > 0 then people_count / total_people else 0 end as people_signal,
    case when total_signal > 0 then credit_total / total_signal else 0 end as credit_signal,
    case when total_weight > 0 then conviction_weight / total_weight else 0 end as conviction_signal
  from weighted
)
select jsonb_build_object(
  'people', coalesce(jsonb_object_agg(outcome_id, people_signal), '{}'::jsonb),
  'credit', coalesce(jsonb_object_agg(outcome_id, credit_signal), '{}'::jsonb),
  'conviction', coalesce(jsonb_object_agg(outcome_id, conviction_signal), '{}'::jsonb),
  'stage', coalesce(jsonb_object_agg(outcome_id, 0.65 * people_signal + 0.35 * conviction_signal), '{}'::jsonb)
)
from signals;
$$;

revoke execute on function market_signal_snapshot(uuid) from public, anon, authenticated;
grant execute on function market_signal_snapshot(uuid) to service_role;
