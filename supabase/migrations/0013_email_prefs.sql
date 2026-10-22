-- Deep Cut — who doesn't want the post.
--
-- Everything sent so far has been transactional: you asked for a magic link,
-- you got one. The monthly programme is the first mail that arrives because
-- time passed rather than because somebody did something, and mail like that
-- has to carry a working way out. Not as a courtesy — an unsubscribe link is
-- required of commercial email, and it has to work without signing in, because
-- somebody who has given up on an app will not log in to escape its emails.
--
-- Presence means opted OUT. The default is therefore "send", with no row to
-- write when somebody signs up, and no backfill for the people already here.
create table if not exists public.email_optouts (
  user_id uuid not null references public.users(id) on delete cascade,
  -- Which kind of mail. Separate rows so leaving the programme list doesn't
  -- also stop a password reset, which is not something anyone can opt out of.
  kind text not null check (kind in ('programme')),
  opted_out_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.email_optouts enable row level security;

-- No policies: every read and write goes through the service-role client
-- behind a route that has already checked who is asking, same as the rest of
-- this app's tables. RLS is on so a future anon-key query fails closed.
