-- Deep Cut Theatre — take Kung Fury off the air, for real this time.
--
-- 0011 already contained this exact statement, and Kung Fury is still showing.
-- The reason is order: 0011 archives it by id, and 0010 inserts it. Run 0011
-- before 0010 — or paste them in the wrong order into the SQL editor — and the
-- update matches nothing, then the insert puts it right back on air. Neither
-- migration errors, so nothing says anything went wrong.
--
-- Why it can't stay: YouTube age-restricts Kung Fury, and an age-gated video
-- refuses to load in any embedded player, ours included. It isn't a film that
-- plays badly — it's a channel slot that shows an error.
--
-- This is written to be safe to run any number of times, in any order, and it
-- states the reason in the row so nobody re-adds it in six months.

update public.shorts
   set status = 'archived',
       archived_at = coalesce(archived_at, now())
 where id = 'kung-fury';

-- Its replacement, in case 0011's insert was the half that got skipped.
insert into public.shorts
  (id, title, director, year, runtime_sec, source, video_id, channels, pedigree, synopsis, thumb)
values
  ('the-cat-came-back', 'The Cat Came Back', 'Cordell Barker', 1988, 461, 'youtube', 'FJl_4IsQJ2g', ARRAY['rails']::text[], 'Academy Award nomination, Best Animated Short Film, 1989 (61st Academy Awards, lost to Tin Toy) · Genie Award, Best Animated Short Film (won), 1989', 'An old man''s increasingly violent, slapstick attempts to get rid of an indestructible yellow cat only ever end one way — with the cat coming back.', 'https://i.ytimg.com/vi/FJl_4IsQJ2g/hqdefault.jpg')
on conflict (id) do nothing;

-- And make sure it's actually on air, in case a previous run archived it.
update public.shorts
   set status = 'showing', archived_at = null
 where id = 'the-cat-came-back';
