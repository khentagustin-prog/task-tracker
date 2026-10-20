-- STEP A - prepare Google sign-in + private data per user.
-- Safe to run any time: it only ADDS things. The current app keeps working exactly as before.
-- Run it in the Supabase SQL Editor before you test the Google-login version.

begin;

-- Only company accounts count. Change the domain here if needed.
create or replace function public.is_company_user() returns boolean
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@247ga.co'
$$;

-- Every row belongs to the user who created it (rows created by the old app have no owner yet).
alter table public.tasks add column if not exists owner uuid default auth.uid() references auth.users (id) on delete cascade;
alter table public.app_settings add column if not exists owner uuid default auth.uid() references auth.users (id) on delete cascade;
create index if not exists tasks_owner_idx on public.tasks (owner);

-- Settings: one row per (owner, key) instead of one row per key.
alter table public.app_settings drop constraint if exists app_settings_pkey;
create unique index if not exists app_settings_owner_key on public.app_settings (owner, key);

-- Signed-in company users can use ONLY their own rows.
alter table public.tasks enable row level security;
alter table public.app_settings enable row level security;
drop policy if exists "tasks own rows" on public.tasks;
drop policy if exists "settings own rows" on public.app_settings;

create policy "tasks own rows" on public.tasks for all to authenticated
  using (owner = auth.uid() and public.is_company_user())
  with check (owner = auth.uid() and public.is_company_user());

create policy "settings own rows" on public.app_settings for all to authenticated
  using (owner = auth.uid() and public.is_company_user())
  with check (owner = auth.uid() and public.is_company_user());

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

-- Files: new files live in <user id>/<task id>/...; older files live in <task id>/... and stay
-- reachable by the owner of that task.
drop policy if exists "task-files own read" on storage.objects;
drop policy if exists "task-files own insert" on storage.objects;
drop policy if exists "task-files own delete" on storage.objects;

create policy "task-files own read" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_company_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.owner = auth.uid())));

create policy "task-files own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_company_user() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "task-files own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.is_company_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.owner = auth.uid())));

commit;
