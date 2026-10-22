-- Deep Cut — somewhere to post things to, and somewhere to put a script.
--
-- Two gaps that only became urgent the day the door opened and money could
-- actually arrive.
--
-- 1. Four perk tiers promise physical goods — an enamel pin at $250, a signed
--    one-sheet at $500, a screen-used prop at $25,000 — and there has never
--    been anywhere to record where those go. A promise of goods with no address
--    field is the kind of thing that reads as fraud long before anybody meant
--    it that way, and non-delivery is where consumer-protection regulators
--    actually turn up in this sector.
--
-- 2. Submissions were links-only, on the deliberate reasoning that every
--    director already has a deck on Drive and a reel on Vimeo, and that hosting
--    other people's films is a takedown problem with no upside. That reasoning
--    still holds for VIDEO — reels stay links. It does not hold for a PDF: a
--    first-time director with a script and a one-sheet on their laptop and no
--    Drive habit is exactly the person this door was opened for, and telling
--    them to go and host a file first is a step where they leave.

-- ── Where physical perks go ────────────────────────────────────────────────
--
-- One row per member, not per order: somebody who reaches three physical tiers
-- over a year is one person at one address, and asking them three times is
-- asking them to make a mistake. Every field is nullable except the owner —
-- this gets filled in over two sittings more often than one, and a half-entered
-- address is more useful than a rejected form.
create table if not exists public.delivery_details (
  user_id uuid primary key references public.users(id) on delete cascade,

  -- Who it's addressed to. Not necessarily their display name, and not
  -- necessarily their legal name — it's whatever the courier should read.
  recipient text,

  line_1 text,
  line_2 text,
  city text,
  -- State, province, county. Named region because a third of the world has
  -- none of those and a form that demands "State" is a form they abandon.
  region text,
  postcode text,
  -- ISO 3166-1 alpha-2. Stored uppercase; two characters keeps a free-text
  -- country field from producing "USA", "U.S.A." and "united states" in the
  -- same column.
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),

  -- Couriers ask for one on international shipments and a missing number is a
  -- held parcel. Optional, and never used for anything else.
  phone text,

  updated_at timestamptz not null default now()
);

alter table public.delivery_details enable row level security;

-- No policies, deliberately — the same posture as film_submissions. A home
-- address is the most sensitive thing in this database and it is only ever
-- read through an API route holding the service role: by the member editing
-- their own, and by the house when something actually ships.

-- ── Attachments on a submission ────────────────────────────────────────────
--
-- Storage paths, never URLs. The bucket is private, so what the admin console
-- renders is a short-lived signed link generated at read time — a permanent
-- public URL to an unreleased screenplay is the thing this must not become.
--
-- jsonb rather than a child table: attachments are read only with their
-- submission, never queried across, and a five-row join for something that is
-- always fetched as a whole is a table nobody thanks you for.
-- Shape: [{ "path": "...", "name": "...", "size": 123, "type": "application/pdf" }]
alter table public.film_submissions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.film_submissions.attachments is
  'Private storage paths in the submissions bucket. Signed at read time, never public.';

-- ── The bucket ─────────────────────────────────────────────────────────────
--
-- Private. Uploads arrive on a signed upload URL minted server-side after the
-- route has checked the file's type and size, which means the browser never
-- holds a credential that could write anything else — and the file never
-- passes through the app, so the ceiling is Supabase's rather than the 4.5MB
-- a serverless function body will carry.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  104857600, -- 100MB. A feature screenplay is under 2MB; a deck with stills
             -- runs 20-60MB; this leaves room without inviting a raw camera
             -- master, which is what the reel link is for.
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf',
    'application/zip'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;
