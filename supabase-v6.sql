-- I-run sa Supabase SQL Editor (para sa Archive)
alter table tasks add column if not exists archived boolean not null default false;
