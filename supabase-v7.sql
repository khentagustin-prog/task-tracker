-- I-run sa Supabase SQL Editor (para sa Updates / mga mensahe sa bawat task)
alter table tasks add column if not exists updates jsonb not null default '[]'::jsonb;
