import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import YouScreen from "./YouScreen";
import type { Service } from "@/lib/services";
import { computeTasteStats } from "@/lib/rank";
import { computeStreak } from "@/lib/streak";
import { resolveStyle } from "@/lib/profile-style";
import { getMovieStills } from "@/lib/tmdb";

export default async function YouPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();

  // Style columns arrive with migration 0004 — retry with the legacy shape so
  // the signature film still resolves (via the events fallback) pre-migration.
  const styleCols = "handle, display_name, avatar_url, profile_theme, signature_movie_id";
  const legacyCols = "handle, display_name, avatar_url";
  let meRes = await db.from("users").select(styleCols).eq("id", user.id).maybeSingle();
  if (meRes.error) meRes = await db.from("users").select(legacyCols).eq("id", user.id).maybeSingle();
  const me = { data: meRes.data as {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    profile_theme?: string | null;
    signature_movie_id?: number | null;
  } | null };

  const [profile, services, watchlist, loved, history] = await Promise.all([
    db.from("taste_profiles").select("threads, version, generated_at").eq("user_id", user.id).maybeSingle(),
    db.from("user_services").select("service").eq("user_id", user.id),
    db
      .from("recommendations")
      .select("id, reason, obscurity, movies(id, title, year, poster_path, genres, providers)")
      .eq("user_id", user.id)
      .eq("status", "watchlisted")
      .order("created_at", { ascending: false }),
    db
      .from("loved_movies")
      .select("movie_id, movies(id, title, year, poster_path, genres, vote_count)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false }),
    db
      .from("watch_logs")
      .select("id, reaction, why, note, watched_at, movies(id, title, year, poster_path, genres, vote_count)")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(200),
  ]);

  const votes = [...(loved.data ?? []), ...(history.data ?? [])]
    .map((r) => r.movies as unknown as { id: number; vote_count: number | null } | null)
    .filter((m): m is { id: number; vote_count: number | null } => !!m);
  const stats = computeTasteStats(votes);
  const streak = computeStreak(
    (history.data ?? []).map((r) => r.watched_at as string),
    Date.now(),
  );

  // Signature film — the same shrine that fronts your public profile, now on
  // your own tab. Resolves from columns or the events fallback.
  const style = await resolveStyle(user.id, me.data);
  const [{ data: sigMovie }, sigStills] = style.signatureMovieId
    ? await Promise.all([
        db
          .from("movies")
          .select("id, title, year, poster_path")
          .eq("id", style.signatureMovieId)
          .maybeSingle(),
        getMovieStills(style.signatureMovieId).catch(() => [] as string[]),
      ])
    : [{ data: null }, [] as string[]];
  const signature = sigMovie
    ? {
        id: sigMovie.id as number,
        title: sigMovie.title as string,
        year: (sigMovie.year as number | null) ?? null,
        posterPath: (sigMovie.poster_path as string | null) ?? null,
        stills: sigStills,
      }
    : null;

  return (
    <YouScreen
      stats={stats}
      streak={streak}
      signature={signature}
      theme={style.theme}
      threads={(profile.data?.threads ?? []) as Array<{ title: string; line: string }>}
      version={profile.data?.version ?? 0}
      handle={me.data?.handle ?? null}
      avatarUrl={me.data?.avatar_url ?? null}
      displayName={me.data?.display_name ?? null}
      services={(services.data ?? []).map((r) => r.service as Service)}
      watchlist={JSON.parse(JSON.stringify(watchlist.data ?? []))}
      loved={JSON.parse(JSON.stringify(loved.data ?? []))}
      history={JSON.parse(JSON.stringify(history.data ?? []))}
    />
  );
}
