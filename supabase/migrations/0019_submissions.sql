-- Deep Cut — the open submissions pile.
--
-- The Fund page has told filmmakers "if you have a script and a reel, you can
-- pitch" since it shipped, and there has never been anywhere to do it. This is
-- that: an inbox anyone can put a pitch into, which is a different table from
-- the ballot on purpose.
--
-- Two tables, not one. film_pitches is the SLATE — the nine we chose, that
-- members vote on. This is everything that arrived. Keeping them apart is the
-- whole editorial model: the crowd chooses between films we have already read,
-- and nobody votes on the raw pile. Promoting a submission copies it across;
-- the submission stays here with a status so the same film can't be showcased
-- twice and a director can be told where they stand.

create table if not exists public.film_submissions (
  id uuid primary key default gen_random_uuid(),

  -- Which cycle they're submitting for. A pitch that misses this round should
  -- be considered for the next one rather than deleted.
  cycle text not null,

  -- Who to write back to. This is the only personal data here and it exists
  -- solely so somebody can be told yes or no.
  director text not null,
  email text not null,
  -- Optional: if they're already a member, their account.
  user_id uuid references public.users(id) on delete set null,

  title text not null,
  logline text not null,
  synopsis text not null,
  genre text,
  comps text,
  -- Roughly what they think it costs. Not binding, but a director who says
  -- $4M has not read the page, and that is worth knowing before reading 90
  -- pages of screenplay.
  budget_cents integer,

  -- Links, never uploads. Every director already has these hosted, and holding
  -- other people's PDFs is a storage and takedown problem with no upside.
  deck_url text,
  prior_work_url text,
  one_sheet_url text,

  -- new → read → showcased (on the slate) / passed. Nothing is ever deleted:
  -- a pile you can't look back through is a pile you can't be fair with.
  status text not null default 'new'
    check (status in ('new', 'read', 'showcased', 'passed')),
  -- Private. Never leaves the admin console.
  notes text,

  -- Set when this submission becomes a pitch on the slate, so the two rows
  -- stay tied together and the same film can't be showcased twice.
  pitch_id uuid references public.film_pitches(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin queue reads by cycle, newest first, filtered by status.
create index if not exists film_submissions_cycle_idx
  on public.film_submissions (cycle, status, created_at desc);

-- One submission per film per cycle per director. A resubmit should update
-- their entry rather than quietly stack four copies in the pile.
create unique index if not exists film_submissions_dedupe_idx
  on public.film_submissions (cycle, lower(email), lower(title));

alter table public.film_submissions enable row level security;

-- No policies: submissions arrive through an API route that rate-limits and
-- validates, and are only ever read by the admin console through the service
-- role. A submission contains an email address and an unreleased film's
-- synopsis — neither should be world-readable, which is exactly what an
-- RLS-enabled table with no policy guarantees.
