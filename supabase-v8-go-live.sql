-- GO LIVE: username + password accounts, private data per user, old open access removed.
-- ONE script, run ONCE in the Supabase SQL Editor, right after the new version of the app is deployed.
-- Everything runs in a single transaction: if anything fails, nothing is changed.
--
-- What it does:
--   1. creates the accounts   admin1 / admin2 / admin3   (password 123 - see the note below)
--   2. makes every task, setting and file private to the account that owns it
--   3. gives ALL the data you already have to admin1 (change the email in part 3 to use another account)
--   4. removes the old open access (the old shared-key app stops working - that is intended)
--
-- Note on the password: Supabase needs 6+ characters, so the app silently sends "123" as "123#taskflow".
-- Passwords of 6+ characters are used exactly as typed.

begin;

-- ===== 1 + 2. accounts and per-user privacy =====
-- Who may use the app. Add a row here (and create the account) to let somebody else in.
create table if not exists public.allowed_users (email text primary key);
alter table public.allowed_users enable row level security;      -- no policies: not readable through the API
revoke all on public.allowed_users from anon, authenticated;
insert into public.allowed_users (email) values
  ('admin1@taskflow.local'), ('admin2@taskflow.local'), ('admin3@taskflow.local')
  on conflict do nothing;

create or replace function public.is_allowed_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

-- Used by the n8n image workflow to check who is calling.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', public.is_allowed_user(), 'email', auth.jwt() ->> 'email')
$$;
revoke all on function public.whoami() from public;
grant execute on function public.whoami() to authenticated;

-- Every row belongs to the user who created it (rows created by the old app have no owner yet).
alter table public.tasks add column if not exists owner uuid default auth.uid() references auth.users (id) on delete cascade;
alter table public.app_settings add column if not exists owner uuid default auth.uid() references auth.users (id) on delete cascade;
create index if not exists tasks_owner_idx on public.tasks (owner);

-- Settings: one row per (owner, key) instead of one row per key.
alter table public.app_settings drop constraint if exists app_settings_pkey;
create unique index if not exists app_settings_owner_key on public.app_settings (owner, key);

-- Signed-in users can use ONLY their own rows.
alter table public.tasks enable row level security;
alter table public.app_settings enable row level security;
drop policy if exists "tasks own rows" on public.tasks;
drop policy if exists "settings own rows" on public.app_settings;

create policy "tasks own rows" on public.tasks for all to authenticated
  using (owner = auth.uid() and public.is_allowed_user())
  with check (owner = auth.uid() and public.is_allowed_user());

create policy "settings own rows" on public.app_settings for all to authenticated
  using (owner = auth.uid() and public.is_allowed_user())
  with check (owner = auth.uid() and public.is_allowed_user());

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

-- Files: new files live in <user id>/<task id>/...; older files live in <task id>/... and stay
-- reachable by the owner of that task.
drop policy if exists "task-files own read" on storage.objects;
drop policy if exists "task-files own insert" on storage.objects;
drop policy if exists "task-files own delete" on storage.objects;

create policy "task-files own read" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_allowed_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.owner = auth.uid())));

create policy "task-files own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_allowed_user() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "task-files own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.is_allowed_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.owner = auth.uid())));

-- The three accounts (skipped if they already exist).
do $$
declare r record; new_id uuid;
begin
  for r in select email from public.allowed_users where email in ('admin1@taskflow.local', 'admin2@taskflow.local', 'admin3@taskflow.local') loop
    if not exists (select 1 from auth.users where lower(auth.users.email) = r.email) then
      new_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', r.email,
              crypt('123#taskflow', gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), new_id::text, new_id,
              jsonb_build_object('sub', new_id::text, 'email', r.email, 'email_verified', true), 'email', now(), now(), now());
    end if;
  end loop;
end $$;

-- ===== 3. give the existing data to admin1 =====
do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = 'admin1@taskflow.local';
  if uid is null then
    raise exception 'The account does not exist yet. Run step A (supabase-v8a-accounts-prepare.sql) first.';
  end if;

  insert into public.app_settings (owner, key, value)
    select uid, key, value from public.app_settings where owner is null
    on conflict (owner, key) do update set value = excluded.value, updated_at = now();
  delete from public.app_settings where owner is null;

  update public.tasks set owner = uid where owner is null;
end $$;

-- ===== 4. lock down the old open access =====
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
