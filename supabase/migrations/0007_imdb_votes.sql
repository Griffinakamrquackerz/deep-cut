-- Deep Cut — IMDb vote count, the honest fame signal.
--
-- TMDB vote counts are what obscurity was built on, and they mislead badly for
-- streaming-native releases: TMDB's voters skew cinephile and barely log big
-- straight-to-platform titles. Spirited (2022, ~$75m, Ferrell/Reynolds, Apple
-- TV+) carries 786 TMDB votes — under the 800 threshold — so it scored as a
-- maximum-obscurity "RARE FIND" while sitting on tens of thousands of IMDb
-- votes. IMDb's count is the closest thing to "how many people have actually
-- met this film", and unlike TMDB `popularity` it doesn't decay as buzz fades.

alter table public.movies add column if not exists imdb_votes integer;
