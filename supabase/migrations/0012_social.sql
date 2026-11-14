-- Deep Cut — the social floor: an inbox, and what you're watching tonight.
--
-- Three features asked for one missing piece between them. Tagging someone in
-- a comment is decorative if they never find out, and sending a friend a film
-- has nowhere to land, so both need somewhere a message can wait for you.
-- "Watching tonight" doesn't: it goes on your profile and into the Lobby feed,
-- which is a room people already walk through rather than a tap on the
-- shoulder.

-- ── The inbox ────────────────────────────────────────────────────────
-- One row per thing that happened TO you. actor_id is who did it, props
-- carries whatever that kind needs (a comment id, a film id) rather than a
-- column per kind — the alternative is a migration every time a fourth kind
-- of notification gets invented.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete cascade,
  kind text not null check (kind in ('mention', 'film_sent')),
  props jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The inbox is only ever read newest-first for one person.
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- The unread badge is a count, and it's on every screen — partial so it stays
-- cheap once the read rows outnumber the unread ones a hundred to one.
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- ── What you're watching tonight ─────────────────────────────────────
-- A status, not a log: one row per person, replaced when they change their
-- mind. History lives in watch_logs already, and this is the other thing —
-- what you're about to do, which is only interesting before you've done it.
create table if not exists public.tonight (
  user_id uuid primary key references public.users(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  -- Optional. "finally" and "for the fourth time" are the whole point.
  note text,
  set_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- The feed asks for everyone you follow whose status hasn't gone stale yet.
create index if not exists tonight_live_idx on public.tonight (expires_at);

alter table public.tonight enable row level security;

-- No policies on either: every read and write goes through the service-role
-- client behind an API route that has already checked who is asking, same as
-- the rest of this app's tables. RLS is on so a future anon-key query fails
-- closed rather than quietly returning somebody else's inbox.
