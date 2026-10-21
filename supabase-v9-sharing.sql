-- SHARING: let an account share a board with other accounts.
-- Run ONCE in the Supabase SQL Editor (after supabase-v8-go-live.sql). Safe to run again.
-- Everything runs in a single transaction: if anything fails, nothing is changed.
--
-- What it does:
--   1. adds the table board_shares (who shared which board with whom)
--   2. lets the people a board is shared with view, add, edit and delete the tasks in that board
--      (and open its files); nothing else of the owner is visible
--   3. adds small helper functions: people (search accounts), shared_boards (boards shared with me)
-- The deployed app works without this script (the Share buttons just say sharing is not set up yet).

begin;

-- ===== helpers =====
create or replace function public.is_allowed_uid(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users x join public.allowed_users a on lower(x.email) = a.email where x.id = u)
$$;
revoke all on function public.is_allowed_uid(uuid) from public;
grant execute on function public.is_allowed_uid(uuid) to authenticated;

-- ===== the shares =====
create table if not exists public.board_shares (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board text not null,
  shared_with uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, board, shared_with),
  check (owner <> shared_with)
);
create index if not exists board_shares_with_idx on public.board_shares (shared_with);
alter table public.board_shares enable row level security;
drop policy if exists "shares owner" on public.board_shares;
drop policy if exists "shares recipient read" on public.board_shares;
drop policy if exists "shares recipient leave" on public.board_shares;

-- The owner manages the shares of their own boards (and can only pick real accounts).
create policy "shares owner" on public.board_shares for all to authenticated
  using (owner = auth.uid() and public.is_allowed_user())
  with check (owner = auth.uid() and public.is_allowed_user() and public.is_allowed_uid(shared_with));
-- The other person can see that a board was shared with them and can leave it.
create policy "shares recipient read" on public.board_shares for select to authenticated
  using (shared_with = auth.uid() and public.is_allowed_user());
create policy "shares recipient leave" on public.board_shares for delete to authenticated
  using (shared_with = auth.uid() and public.is_allowed_user());
grant select, insert, update, delete on public.board_shares to authenticated;

-- Does the signed-in user have this board shared with them?
create or replace function public.has_board_access(o uuid, b text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_shares s
                 where s.owner = o and s.board = coalesce(b, 'Main') and s.shared_with = auth.uid())
$$;
revoke all on function public.has_board_access(uuid, text) from public;
grant execute on function public.has_board_access(uuid, text) to authenticated;

-- ===== tasks: own rows + rows of boards shared with me =====
drop policy if exists "tasks own rows" on public.tasks;
drop policy if exists "tasks own or shared" on public.tasks;
create policy "tasks own or shared" on public.tasks for all to authenticated
  using (public.is_allowed_user() and (owner = auth.uid() or public.has_board_access(owner, group_name)))
  with check (public.is_allowed_user() and (owner = auth.uid() or public.has_board_access(owner, group_name)));

-- A task always stays with the account that owns the board (nobody can take it over).
create or replace function public.tasks_keep_owner() returns trigger
language plpgsql as $$
begin
  if new.owner is distinct from old.owner then
    raise exception 'The owner of a task cannot be changed.';
  end if;
  return new;
end $$;
drop trigger if exists tasks_keep_owner on public.tasks;
create trigger tasks_keep_owner before update on public.tasks for each row execute function public.tasks_keep_owner();

-- ===== files of shared tasks =====
-- A file is reachable when its task is reachable (own task, or a task in a board shared with me).
-- New files live in <user id>/<task id>/...; older ones in <task id>/...
drop policy if exists "task-files own read" on storage.objects;
drop policy if exists "task-files own insert" on storage.objects;
drop policy if exists "task-files own delete" on storage.objects;
drop policy if exists "task-files read" on storage.objects;
drop policy if exists "task-files insert" on storage.objects;
drop policy if exists "task-files delete" on storage.objects;

create policy "task-files read" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_allowed_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text in ((storage.foldername(name))[1], (storage.foldername(name))[2]))));

create policy "task-files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_allowed_user() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "task-files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.is_allowed_user() and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.tasks t where t.id::text in ((storage.foldername(name))[1], (storage.foldername(name))[2]))));

-- ===== who can I share with? (search) =====
create or replace function public.people() returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select u.id, split_part(lower(u.email), '@', 1)
  from auth.users u join public.allowed_users a on lower(u.email) = a.email
  where public.is_allowed_user() and u.id <> auth.uid()
  order by 2
$$;
revoke all on function public.people() from public;
grant execute on function public.people() to authenticated;

-- ===== boards shared with me (with the owner's name, groups and colour) =====
create or replace function public.shared_boards()
returns table (owner uuid, owner_name text, board text, sections jsonb, color text)
language sql stable security definer set search_path = public as $$
  select s.owner, split_part(lower(u.email), '@', 1), s.board,
         coalesce(st.value -> 'sections' -> s.board, '[]'::jsonb),
         st.value -> 'colors' ->> s.board
  from public.board_shares s
  join auth.users u on u.id = s.owner
  left join public.app_settings st on st.owner = s.owner and st.key = 'boards'
  where public.is_allowed_user() and s.shared_with = auth.uid()
  order by 2, 3
$$;
revoke all on function public.shared_boards() from public;
grant execute on function public.shared_boards() to authenticated;

commit;
