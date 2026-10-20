-- Run in the Supabase SQL Editor (tags and file uploads)
alter table tasks add column if not exists tags jsonb not null default '[]'::jsonb;
alter table tasks add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Storage bucket for documents
insert into storage.buckets (id, name, public) values ('task-files', 'task-files', true)
on conflict (id) do nothing;

drop policy if exists "task-files anon read" on storage.objects;
drop policy if exists "task-files anon insert" on storage.objects;
drop policy if exists "task-files anon delete" on storage.objects;
create policy "task-files anon read"   on storage.objects for select to anon using (bucket_id = 'task-files');
create policy "task-files anon insert" on storage.objects for insert to anon with check (bucket_id = 'task-files');
create policy "task-files anon delete" on storage.objects for delete to anon using (bucket_id = 'task-files');
