create or replace function public_leaderboard_tx(p_event_slug text)
returns table (
  id uuid,
  nickname text,
  role text,
  participant_type text,
  avatar_url text,
  oracle_score integer,
  predictions integer,
  correct_markets integer,
  efficiency numeric,
  early_score integer,
  contrarian_score integer
)
language sql
stable
security definer
set search_path = public
as $$
with event_scope as (
  select id
  from events
  where slug = p_event_slug
),
participant_scope as (
  select p.*
  from participants p
  join event_scope e on e.id = p.event_id
  where not p.is_banned
),
prediction_counts as (
  select pa.participant_id, count(*)::integer as predictions
  from prediction_actions pa
  join participant_scope p on p.id = pa.participant_id
  where pa.action_type <> 'admin_void'
  group by pa.participant_id
),
correct_positions as (
  select pos.participant_id, pos.market_id
  from positions pos
  join participant_scope p on p.id = pos.participant_id
  join markets m on m.id = pos.market_id
  where m.status = 'resolved'
    and m.resolved_outcome_id is not null
    and pos.outcome_id = m.resolved_outcome_id
),
correct_counts as (
  select participant_id, count(*)::integer as correct_markets
  from correct_positions
  group by participant_id
),
base_actions as (
  select
    pa.*,
    m.opened_at,
    m.created_at as market_created_at,
    m.resolved_at,
    m.resolved_outcome_id,
    max(pa.created_at) filter (
      where pa.action_type = 'switch'
        and pa.outcome_id = m.resolved_outcome_id
    ) over (partition by pa.participant_id, pa.market_id) as last_switch_to_winner
  from prediction_actions pa
  join correct_positions cp on cp.participant_id = pa.participant_id and cp.market_id = pa.market_id
  join markets m on m.id = pa.market_id
  where pa.action_type <> 'admin_void'
),
scoreable_actions as (
  select
    participant_id,
    signal_credits,
    least(
      1,
      greatest(
        0,
        extract(epoch from (created_at - coalesce(opened_at, market_created_at))) * 1000
        / nullif(greatest(60000, extract(epoch from (coalesce(resolved_at, now()) - coalesce(opened_at, market_created_at))) * 1000), 0)
      )
    ) as progress,
    least(
      1,
      greatest(
        0,
        coalesce(
          (stage_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          (people_signal_snapshot ->> resolved_outcome_id::text)::numeric,
          0
        )
      )
    ) as popularity
  from base_actions
  where outcome_id = resolved_outcome_id
    and signal_credits > 0
    and (last_switch_to_winner is null or created_at >= last_switch_to_winner)
),
score_sums as (
  select
    participant_id,
    round(sum(signal_credits * (1 - progress)))::integer as early_score,
    round(sum(signal_credits * (1 - popularity)))::integer as contrarian_score
  from scoreable_actions
  group by participant_id
)
select
  p.id,
  p.nickname,
  p.role,
  p.participant_type,
  case when p.is_avatar_hidden then null else p.avatar_url end as avatar_url,
  p.oracle_score,
  coalesce(pc.predictions, 0)::integer as predictions,
  coalesce(cc.correct_markets, 0)::integer as correct_markets,
  case
    when coalesce(w.total_committed_credits, 0) > 0 then p.oracle_score::numeric / w.total_committed_credits
    else p.oracle_score::numeric
  end as efficiency,
  coalesce(ss.early_score, 0)::integer as early_score,
  coalesce(ss.contrarian_score, 0)::integer as contrarian_score
from participant_scope p
left join wallets w on w.participant_id = p.id
left join prediction_counts pc on pc.participant_id = p.id
left join correct_counts cc on cc.participant_id = p.id
left join score_sums ss on ss.participant_id = p.id
order by p.oracle_score desc, efficiency desc, p.nickname asc;
$$;

revoke execute on function public_leaderboard_tx(text) from public, anon, authenticated;
grant execute on function public_leaderboard_tx(text) to service_role;
