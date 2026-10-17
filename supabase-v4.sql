-- I-run sa Supabase SQL Editor (para sa subitems)
alter table tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
