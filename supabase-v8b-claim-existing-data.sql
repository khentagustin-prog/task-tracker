-- STEP B - give the data you already have to your Google account.
-- Run it right after you have signed in to the Google-login app at least once, and again at cutover.
-- (Rows created before Google login have no owner, so nobody can see them until this runs.)
-- Your old settings (statuses, boards, colors) replace the empty defaults the new app saved on first login.

do $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = 'khent.agustin@247ga.co';
  if uid is null then
    raise exception 'Sign in to the app with Google once first, then run this again.';
  end if;

  insert into public.app_settings (owner, key, value)
    select uid, key, value from public.app_settings where owner is null
    on conflict (owner, key) do update set value = excluded.value, updated_at = now();
  delete from public.app_settings where owner is null;

  update public.tasks set owner = uid where owner is null;
end $$;
