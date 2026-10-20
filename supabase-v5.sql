-- Run in the Supabase SQL Editor (groups inside a board)
alter table tasks add column if not exists section text;
