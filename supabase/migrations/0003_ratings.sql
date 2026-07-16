-- Deep Cut — film ratings (TMDB always; IMDb + Rotten Tomatoes via OMDb when configured)

alter table public.movies add column if not exists tmdb_rating numeric;       -- /10, from TMDB vote_average
alter table public.movies add column if not exists imdb_id text;              -- ttXXXXXXX
alter table public.movies add column if not exists imdb_rating numeric;       -- /10, from OMDb
alter table public.movies add column if not exists rt_rating smallint;        -- 0-100, Rotten Tomatoes % from OMDb
alter table public.movies add column if not exists ratings_refreshed_at timestamptz;
