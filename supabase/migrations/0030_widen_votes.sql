-- Allow a member to put more than a 32-bit integer's worth of votes on one pitch.
alter table public.film_votes alter column votes type bigint;
