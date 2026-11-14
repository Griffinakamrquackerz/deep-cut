-- Deep Cut Theatre — Off the Rails: archiving Kung Fury and adding a real
-- third film in its place.
--
-- Kung Fury is confirmed, permanently unplayable here: YouTube age-restricts
-- it, and an age-gated video refuses to load in any embedded player,
-- including ours, with no workaround on our end. This statement is a no-op
-- if you already archived it by hand from the Theatre tab.
--
-- Its replacement is hosted on YouTube rather than Vimeo — the new default —
-- because it's an NFB production, and NFB's own distribution is nfb.ca and
-- their official YouTube channel, not Vimeo (their Vimeo presence is a small,
-- largely inactive account from years ago, not where they actually publish).
-- Confirmed via yt-dlp before writing this: age_limit 0, no restriction.

update public.shorts set status = 'archived', archived_at = now()
where id = 'kung-fury' and status = 'showing';

insert into public.shorts
  (id, title, director, year, runtime_sec, source, video_id, channels, pedigree, synopsis, thumb)
values
  ('the-cat-came-back', 'The Cat Came Back', 'Cordell Barker', 1988, 461, 'youtube', 'FJl_4IsQJ2g', ARRAY['rails']::text[], 'Academy Award nomination, Best Animated Short Film, 1989 (61st Academy Awards, lost to Tin Toy) · Genie Award, Best Animated Short Film (won), 1989', 'An old man''s increasingly violent, slapstick attempts to get rid of an indestructible yellow cat only ever end one way — with the cat coming back.', 'https://i.ytimg.com/vi/FJl_4IsQJ2g/hqdefault.jpg')
on conflict (id) do nothing;
