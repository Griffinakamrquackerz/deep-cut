-- Close two holes that let anyone with the published anon key read every
-- member's email address, and let any signed-in member give themselves
-- premium for free.
--
-- ── The root cause ──
--
-- 0001 created public.users holding id, handle, display_name, avatar_url and
-- created_at — genuinely public profile data — and wrote two policies to
-- match:
--
--   create policy "users readable"    ... for select using (true);
--   create policy "users self-update" ... for update using (auth.uid() = id);
--
-- Both were correct for that table. Then five migrations added columns to it:
-- profile_theme and signature_movie_id (public, fine), and then
-- premium_until (0005), stripe_customer_id (0005), email (0018) and region
-- (0022) — every one of which silently inherited a policy written for a table
-- that held no secrets.
--
-- RLS is ROW-level. It has nothing to say about columns, so:
--
--   * `select using (true)` on a table containing `email` means the whole
--     membership list — addresses, paid status, Stripe customer ids — is one
--     unauthenticated PostgREST call away. The anon key is not a secret: it
--     ships in deep-cut-native/app.json and in the web bundle, by design.
--
--   * `update using (auth.uid() = id)` with no column restriction means a
--     member can PATCH their own row and set premium_until to 2099. Free
--     Balcony Seats, ads off, the higher deal limit. They can also rewrite
--     their own `email`, which the monthly programme cron then mails — a
--     branded-mail relay.
--
-- The API routes were never the problem; they're careful. The mistake was
-- assuming all traffic arrives through them.
--
-- ── The fix ──
--
-- Column-level grants, which Postgres checks BEFORE row-level policies. The
-- policies stay exactly as they are; the grants decide which columns those
-- policies are even allowed to see. This is why it needs no application
-- changes: service_role has its own grants and is untouched, so every
-- supabaseAdmin() read keeps working.
--
-- Verified before writing this: no client anywhere reads public.users with a
-- user token. The native app touches only user_services and loved_movies
-- directly (src/app/index.tsx, settings), and every web read of users is
-- server-side through the service role.

-- ── public.users ──

-- Blanket access first, so nothing is left over from 0001's grants.
revoke select, insert, update, delete on public.users from anon, authenticated;

-- Readable by anybody: exactly the profile data that already appears on a
-- public profile page and on a shared taste card. Deliberately NOT email,
-- premium_until, stripe_customer_id or region.
grant select (
  id,
  handle,
  display_name,
  avatar_url,
  created_at,
  profile_theme,
  signature_movie_id
) on public.users to anon, authenticated;

-- Writable by the owner: the things Settings actually edits. The row-level
-- policy still restricts this to auth.uid() = id, so one member cannot write
-- another's profile — this narrows WHICH columns they may write on their own.
--
-- premium_until and stripe_customer_id are absent on purpose: they are
-- billing state, and the only thing entitled to write them is the Stripe
-- webhook running as the service role. email is absent because it is a
-- mirror of auth.users and a forged value would be mailed by the cron.
grant update (
  handle,
  display_name,
  avatar_url,
  profile_theme,
  signature_movie_id,
  region
) on public.users to authenticated;

-- ── public.playlists ──
--
-- Same class of bug, one table over. 0006 added is_public, and the app checks
-- it faithfully in every route that serves a mixtape — but 0001's policy is
-- `using (true)`, so a direct PostgREST read returns private tapes anyway,
-- including the per-item notes the owner believed were hidden. The 62-bit
-- share slug is sound design undone by a read policy.
drop policy if exists "playlists readable" on public.playlists;
create policy "playlists readable" on public.playlists
  for select using (
    is_public
    or owner_id = auth.uid()
    or recipient_user_id = auth.uid()
  );

-- playlist_items has no visibility column of its own; it inherits its
-- parent's. Without this the notes are still readable by playlist_id even
-- once the parent row is hidden.
drop policy if exists "playlist_items readable" on public.playlist_items;
create policy "playlist_items readable" on public.playlist_items
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_items.playlist_id
        and (p.is_public or p.owner_id = auth.uid() or p.recipient_user_id = auth.uid())
    )
  );

-- ── Deliberately NOT changed here ──
--
-- watch_logs and taste_profiles are also `select using (true)`, which makes
-- every member's watch notes and taste threads world-readable. That is
-- arguably intended — public profiles and shareable taste cards are a
-- feature — but it means a 500-character note somebody wrote about a film is
-- public, and nothing in the UI says so. That's a product decision, not a
-- bug to fix silently in a migration, so it is left alone and written down.
