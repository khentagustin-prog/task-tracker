-- Run in the Supabase SQL Editor (subitems)
alter table tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
