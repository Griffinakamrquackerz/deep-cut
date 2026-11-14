-- Deep Cut — put the email address where the app already thinks it is.
--
-- public.users has never had an email column. auth.users has one, but that
-- schema isn't reachable from PostgREST, so every server query that wanted an
-- address had nowhere to get it — and one of them didn't know that.
--
-- The monthly programme cron selects "id, email" from public.users. That query
-- errors, the route reads the result as an empty list, and the run reports
-- ok: true with sent: 0. It would have mailed nobody on the 1st, monthly,
-- while looking perfectly healthy from the outside.

alter table public.users add column if not exists email text;

-- Everyone who already exists.
update public.users u
   set email = a.email
  from auth.users a
 where a.id = u.id
   and u.email is distinct from a.email;

create index if not exists users_email_idx on public.users (lower(email));

-- Everyone who arrives from now on. The original trigger copied the display
-- name out of the auth record and left the address behind.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- And anyone who changes theirs. Without this the mirror drifts the first time
-- somebody updates their address, and the drift is invisible until mail starts
-- going to an inbox they abandoned.
create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_user_email();
