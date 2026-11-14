-- Deep Cut — indexes for the house feed.
--
-- The Lobby used to read only the people you follow, so watch_logs was always
-- queried with a user_id filter and watch_logs_user_idx (user_id, watched_at
-- desc) served it perfectly.
--
-- The house feed for new members drops that filter: somebody following nobody
-- sees the most recent activity from anyone. A composite index leading with
-- user_id can't serve an unfiltered "newest first" scan, so that query sorts
-- the whole table. Invisible on a small table and steadily worse on a big one
-- — and it runs on the FIRST Lobby load of every new member, which is the
-- worst possible place to put a slow query.

create index if not exists watch_logs_recent_idx
  on public.watch_logs (watched_at desc);

-- Same story for the mixtape half of that feed.
create index if not exists playlists_recent_idx
  on public.playlists (created_at desc);
