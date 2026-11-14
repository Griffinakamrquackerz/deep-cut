-- Deep Cut — where the member actually is.
--
-- The recommendation engine asked TMDB for AMERICAN streaming availability in
-- three hardcoded places. For anybody outside the US that made the core promise
-- of the product — "on a service you already pay for" — confidently wrong: a
-- film reported as on Netflix when it isn't, and the films that are on their
-- Netflix never surfaced at all.
--
-- Nothing in the schema knew where anyone was. There is a country_code on
-- delivery_details, but that is a shipping address for perks and has no
-- business driving a catalogue query — somebody can have a parcel sent to a
-- different country from the one they watch in.
--
-- Deliberately nullable with no default. NULL means "never asked", which the
-- app treats as US for continuity while showing the member a prompt to
-- confirm. Defaulting every existing row to 'US' would have been a silent
-- assertion about people we have never asked, and indistinguishable afterwards
-- from an answer they gave.

alter table public.users
  add column if not exists region text
    check (region is null or region ~ '^[A-Z]{2}$');

comment on column public.users.region is
  'ISO 3166-1 alpha-2, uppercase. Drives TMDB watch_region and which streaming '
  'services are offered. NULL = never asked; the app falls back to US.';
