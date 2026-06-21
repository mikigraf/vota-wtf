-- Avatar upload is optional for live joins. The current place_prediction_tx
-- definition already enforces nickname + role completion without requiring
-- avatar_url; later migrations redefine the function explicitly as well.
select 1;
