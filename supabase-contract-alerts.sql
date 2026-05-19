-- ── Contract Alert Schedule ───────────────────────────────────────────────────
-- Run this in Supabase SQL Editor AFTER deploying the Edge Function.
-- Requires pg_cron (enabled by default on Supabase).

-- Schedule: every day at 9am UTC
select cron.schedule(
  'contract-alerts-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select 'https://' || (select value from vault.decrypted_secrets where name = 'project_ref') || '.supabase.co/functions/v1/contract-alerts'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To unschedule:
-- select cron.unschedule('contract-alerts-daily');

-- To check scheduled jobs:
-- select * from cron.job;
