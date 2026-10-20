-- Run in the Supabase SQL Editor (Archive)
alter table tasks add column if not exists archived boolean not null default false;
