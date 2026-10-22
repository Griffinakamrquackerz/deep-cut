-- Deep Cut — record what a filmmaker agreed to when they submitted.
--
-- The pile opened in 0019 with no terms attached to it. The terms now exist
-- (src/lib/submission-terms.ts), and a release nobody can prove was shown is
-- worth very little — so the version on screen at the moment of submission gets
-- stored on the row, along with when it was accepted.
--
-- Versioned rather than boolean on purpose. "They ticked a box" is not the
-- useful record; "they ticked a box next to THIS wording" is, and the wording
-- will change. A submission from an earlier version can then be read against
-- the terms that were actually in front of that director.
--
-- Both columns are nullable: rows already in the pile arrived before any terms
-- existed and cannot be retro-fitted with a consent that never happened. A null
-- here means exactly that, and should stay readable as such.

alter table public.film_submissions
  add column if not exists terms_version text,
  add column if not exists terms_agreed_at timestamptz;

comment on column public.film_submissions.terms_version is
  'SUBMISSION_TERMS_VERSION shown at submission. Null = submitted before terms existed.';
