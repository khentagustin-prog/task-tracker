-- STEP C - lock everything down. Run it at cutover, AFTER the Google-login app is live and step B has run.
-- It removes the old open access: after this, only signed-in company users can reach their own data.
-- (The old shared-key app stops working - that is intended.)

begin;

drop policy if exists "anon all" on public.tasks;
drop policy if exists "anon all" on public.app_settings;
revoke all on public.tasks from anon;
revoke all on public.app_settings from anon;

-- Files become private (the app opens them through short-lived signed links).
update storage.buckets set public = false where id = 'task-files';
drop policy if exists "task-files anon read" on storage.objects;
drop policy if exists "task-files anon insert" on storage.objects;
drop policy if exists "task-files anon delete" on storage.objects;

commit;
