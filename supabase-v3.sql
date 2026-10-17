-- I-run sa Supabase SQL Editor (para sa settings: statuses, boards, kulay)
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists "anon all" on app_settings;
create policy "anon all" on app_settings for all to anon using (true) with check (true);
grant select, insert, update, delete on app_settings to anon;
