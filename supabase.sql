create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date date,
  notes text,
  group_name text not null default 'Main',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Allow the publishable (anon) key to use the table (this is a personal app)
alter table tasks enable row level security;
drop policy if exists "anon all" on tasks;
create policy "anon all" on tasks for all to anon using (true) with check (true);
grant select, insert, update, delete on tasks to anon;
