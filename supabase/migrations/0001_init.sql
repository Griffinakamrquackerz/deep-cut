-- Deep Cut — initial schema
-- Runs against Supabase Postgres. Auth users live in auth.users; public.users mirrors profile data.

create type streaming_service as enum (
  'netflix','max','hulu','prime','criterion','tubi','disney','peacock','paramount','apple','mubi','shudder'
);
create type reaction_kind as enum ('loved','fine','not_for_me','loved_ironically');
create type reaction_why as enum ('vibe','story','performances','chaos');
create type rec_status as enum ('active','watchlisted','seen','dismissed');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.user_services (
  user_id uuid not null references public.users(id) on delete cascade,
  service streaming_service not null,
  primary key (user_id, service)
);

-- TMDB cache. id IS the tmdb_id.
create table public.movies (
  id integer primary key,
  title text not null,
  year integer,
  runtime integer,
  poster_path text,
  overview text,
  genres text[] not null default '{}',
  popularity numeric,
  vote_count integer not null default 0,
  providers jsonb not null default '{}'::jsonb, -- {service: true} per our enum, from TMDB /watch/providers
  providers_refreshed_at timestamptz,
  cached_at timestamptz not null default now()
);

create table public.loved_movies (
  user_id uuid not null references public.users(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  added_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create table public.watch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  reaction reaction_kind not null,
  why reaction_why,
  note text,
  watched_at timestamptz not null default now()
);
create index watch_logs_user_idx on public.watch_logs (user_id, watched_at desc);

create table public.taste_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  threads jsonb not null default '[]'::jsonb, -- [{title, line}]
  version integer not null default 1,
  generated_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  reason text not null,
  obscurity smallint not null check (obscurity between 1 and 5),
  status rec_status not null default 'active',
  batch integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, movie_id) -- exclusion enforced in SQL, not just the prompt
);
create index recommendations_user_status_idx on public.recommendations (user_id, status, created_at desc);

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  recipient_name text,
  recipient_user_id uuid references public.users(id),
  share_slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  position integer not null default 0,
  crossed_off boolean not null default false,
  reaction reaction_kind,
  note text,
  unique (playlist_id, movie_id)
);
create index playlist_items_playlist_idx on public.playlist_items (playlist_id, position);

create table public.takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  movie_id integer not null references public.movies(id),
  body text not null check (char_length(body) <= 300),
  created_at timestamptz not null default now()
);
create index takes_user_idx on public.takes (user_id, created_at desc);
create index takes_movie_idx on public.takes (movie_id, created_at desc);

create table public.take_likes (
  take_id uuid not null references public.takes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (take_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.users(id) on delete cascade,
  followee_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- External article links on a film's page (title + URL only)
create table public.external_reads (
  id uuid primary key default gen_random_uuid(),
  movie_id integer not null references public.movies(id),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);

-- MVP rate limiting: 1 profile regen + 3 rec batches per user per day
create table public.usage_counters (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  kind text not null, -- 'profile_regen' | 'rec_batch'
  count integer not null default 0,
  primary key (user_id, day, kind)
);

-- Raw Claude output log for prompt tuning (first ~100 users)
create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  stage text not null, -- 'profile' | 'recs'
  raw text not null,
  created_at timestamptz not null default now()
);

-- M6 instrumentation
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_idx on public.events (name, created_at desc);

-- auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.user_services enable row level security;
alter table public.movies enable row level security;
alter table public.loved_movies enable row level security;
alter table public.watch_logs enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.recommendations enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.takes enable row level security;
alter table public.take_likes enable row level security;
alter table public.follows enable row level security;
alter table public.external_reads enable row level security;
alter table public.usage_counters enable row level security;
alter table public.ai_logs enable row level security;
alter table public.events enable row level security;

-- public read of profile-ish + content tables (social app)
create policy "users readable" on public.users for select using (true);
create policy "users self-update" on public.users for update using (auth.uid() = id);
create policy "movies readable" on public.movies for select using (true);
create policy "takes readable" on public.takes for select using (true);
create policy "take_likes readable" on public.take_likes for select using (true);
create policy "follows readable" on public.follows for select using (true);
create policy "reads readable" on public.external_reads for select using (true);
create policy "loved readable" on public.loved_movies for select using (true);
create policy "logs readable" on public.watch_logs for select using (true);
create policy "profiles readable" on public.taste_profiles for select using (true);
-- playlists: readable by anyone (public share slugs); items too
create policy "playlists readable" on public.playlists for select using (true);
create policy "playlist_items readable" on public.playlist_items for select using (true);
-- recs are private
create policy "recs own" on public.recommendations for select using (auth.uid() = user_id);
create policy "services own" on public.user_services for select using (auth.uid() = user_id);

-- writes: owners only
create policy "services write" on public.user_services for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loved write" on public.loved_movies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs write" on public.watch_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "takes write" on public.takes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "take_likes write" on public.take_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "follows write" on public.follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy "reads write" on public.external_reads for insert with check (auth.uid() = user_id);
create policy "playlists write" on public.playlists for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "recs update own" on public.recommendations for update using (auth.uid() = user_id);
-- playlist_items: owner manages; recipient (or logged-out via server) crosses off through API using service role
create policy "playlist_items owner write" on public.playlist_items for all
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));
-- movies cache, taste_profiles, recommendations inserts, usage_counters, ai_logs, events:
-- written exclusively by the server with the service-role key (bypasses RLS).
