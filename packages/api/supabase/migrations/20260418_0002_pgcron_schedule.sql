-- packages/api/supabase/migrations/20260418_0002_pgcron_schedule.sql

-- Schedule nightly at 03:00 UTC (05:00 Paris en été)
SELECT cron.schedule(
  'buck_nightly_consolidation',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://zconxtmchptchlmeqstu.supabase.co/functions/v1/consolidate-memory',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'EDGE_INVOKE_KEY'),
        'Content-Type', 'application/json'
      )
    );
  $$
);
