create or replace function recompute_oracle_scores_tx()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_market markets%rowtype;
  v_action prediction_actions%rowtype;
  v_score numeric;
  v_opened timestamptz;
  v_locked timestamptz;
  v_last_switch timestamptz;
  v_entry_signal numeric;
  v_minutes_before_lock numeric;
begin
  update participants set oracle_score = 0 where id is not null;

  for v_participant in select * from participants loop
    v_score := 0;
    for v_market in
      select m.*
      from markets m
      join positions p on p.market_id = m.id
      where p.participant_id = v_participant.id
        and m.status = 'resolved'
        and m.resolved_outcome_id is not null
        and p.outcome_id = m.resolved_outcome_id
    loop
      v_opened := coalesce(v_market.opened_at, v_market.created_at);
      v_locked := coalesce(v_market.locked_at, v_market.resolved_at, now());
      select max(created_at) into v_last_switch
      from prediction_actions
      where participant_id = v_participant.id
        and market_id = v_market.id
        and action_type = 'switch'
        and outcome_id = v_market.resolved_outcome_id;

      for v_action in
        select *
        from prediction_actions
        where participant_id = v_participant.id
          and market_id = v_market.id
          and outcome_id = v_market.resolved_outcome_id
          and action_type <> 'admin_void'
          and signal_credits > 0
          and (v_last_switch is null or created_at >= v_last_switch)
      loop
        v_entry_signal := greatest(
          coalesce((v_action.stage_signal_snapshot ->> v_market.resolved_outcome_id::text)::numeric,
                   (v_action.people_signal_snapshot ->> v_market.resolved_outcome_id::text)::numeric,
                   0),
          0.01
        );
        v_minutes_before_lock := greatest(0, extract(epoch from (v_locked - v_action.created_at)) / 60);
        v_score := v_score + round(
          100
          * sqrt(greatest(v_action.signal_credits, 0)::numeric / 100)
          * least(greatest(1 + v_minutes_before_lock / 60, 1), 2)
          * least(greatest(1 / sqrt(v_entry_signal), 1), 3)
        );
      end loop;
    end loop;
    update participants set oracle_score = v_score::integer where id = v_participant.id;
  end loop;
end;
$$;

revoke execute on function recompute_oracle_scores_tx() from public, anon, authenticated;
grant execute on function recompute_oracle_scores_tx() to service_role;
