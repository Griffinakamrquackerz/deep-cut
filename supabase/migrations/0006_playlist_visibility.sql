-- Public/private mixtapes. Optional as always: until this is applied, the app
-- falls back to storing visibility as "playlist_visibility" rows in the events
-- table (latest wins). Existing tapes stay public, preserving today's behavior.
alter table public.playlists add column if not exists is_public boolean not null default true;
create index if not exists playlists_owner_public_idx on public.playlists (owner_id, is_public);
