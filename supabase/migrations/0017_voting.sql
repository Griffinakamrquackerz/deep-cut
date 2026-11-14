-- Deep Cut — greenlighting. Rounds, pitches, and ballots.
--
-- When the Fund clears its goal, a round opens: a handful of directors put up a
-- pitch, and backers spend the votes they earned. Most votes wins the money.
--
-- The mechanic that makes this a game rather than a poll is that votes are
-- SPENDABLE and DIVISIBLE. You hold 47 and can put all 47 behind one pitch or
-- spread them across three. A single-choice poll asks "which is best"; a budget
-- asks "how strongly, and what's your second favourite" — which is a far more
-- interesting question and produces a far more considered result.

-- ── Rounds ───────────────────────────────────────────────────────────
create table if not exists public.film_rounds (
  id text primary key,                 -- 'film-01', matching the fund cycle
  title text not null,                 -- "The First Deep Cut Original"
  status text not null default 'collecting'
    check (status in ('collecting', 'voting', 'greenlit', 'closed')),
  -- Set when voting opens and closes. A round with no close date is open until
  -- somebody closes it, which is fine for the first one.
  opens_at timestamptz,
  closes_at timestamptz,
  -- The pitch that won, once it has.
  winner_pitch_id uuid,
  created_at timestamptz not null default now()
);

-- ── Pitches ──────────────────────────────────────────────────────────
-- A director and the film they want to make. Everything a backer needs to
-- judge it, because "vote on the script and the director" is only meaningful
-- if you can actually read the script's pitch and see the director's work.
create table if not exists public.film_pitches (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.film_rounds(id) on delete cascade,

  title text not null,
  director text not null,
  -- One sentence. If it doesn't fit, the pitch isn't ready.
  logline text not null,
  synopsis text not null,
  -- Genre + the comparison titles every pitch deck opens with anyway.
  genre text,
  comps text,

  -- The one-sheet image and the full deck. Links rather than uploads: a
  -- director already has these hosted, and holding PDFs is a storage problem
  -- with no upside.
  one_sheet_url text,
  deck_url text,
  -- Their reel or previous film. The single most persuasive thing in the pitch.
  prior_work_url text,
  director_photo_url text,

  -- Ordering on the ballot. Randomised per viewer in the UI so position
  -- doesn't decide the vote, but a stable number is useful for admin.
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists film_pitches_round_idx
  on public.film_pitches (round_id, position);

-- ── Ballots ──────────────────────────────────────────────────────────
-- One row per person per pitch: how many of their votes they've put behind it.
-- The primary key does the work of "you can't vote twice for the same pitch" —
-- changing your mind is an update, not a second row.
create table if not exists public.film_votes (
  user_id uuid not null references public.users(id) on delete cascade,
  pitch_id uuid not null references public.film_pitches(id) on delete cascade,
  round_id text not null references public.film_rounds(id) on delete cascade,
  votes integer not null check (votes > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pitch_id)
);

-- Tallying reads every ballot in a round; a member's own ballot reads their rows.
create index if not exists film_votes_round_idx on public.film_votes (round_id);
create index if not exists film_votes_user_round_idx on public.film_votes (user_id, round_id);

alter table public.film_rounds enable row level security;
alter table public.film_pitches enable row level security;
alter table public.film_votes enable row level security;

-- No policies: everything goes through the service-role client behind routes
-- that have already checked who is asking. The vote total a person is allowed
-- to spend is derived from the fund ledger server-side, which is exactly the
-- kind of rule a client must never be trusted with.
