-- Run in the Supabase SQL Editor (Updates / messages on each task)
alter table tasks add column if not exists updates jsonb not null default '[]'::jsonb;
