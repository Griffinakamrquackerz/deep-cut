import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveStyle } from "@/lib/profile-style";
import { getMovieStills } from "@/lib/tmdb";

export const maxDuration = 30;

// The member card, as one payload — powers the native You tab (the web builds
// this server-side in (tabs)/you/page.tsx; native clients need it over HTTP).
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();

  // Style columns arrive with migration 0004 — retry with the legacy shape so
  // the signature film still resolves (via the events fallback) pre-migration.
  const styleCols = "handle, display_name, avatar_url, profile_theme, signature_movie_id";
  const legacyCols = "handle, display_name, avatar_url";
  let meRes = await db.from("users").select(styleCols).eq("id", user.id).maybeSingle();
  if (meRes.error) meRes = await db.from("users").select(legacyCols).eq("id", user.id).maybeSingle();
  const me = meRes.data as {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    profile_theme?: string | null;
    signature_movie_id?: number | null;
  } | null;

  const [style, profile, lovedCount, followerCount, followingCount] = await Promise.all([
    resolveStyle(user.id, me),
    db.from("taste_profiles").select("threads").eq("user_id", user.id).maybeSingle(),
    db.from("loved_movies").select("movie_id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id),
  ]);

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

  return NextResponse.json({
    person: {
      handle: me?.handle ?? null,
      display_name: me?.display_name ?? null,
      avatar_url: me?.avatar_url ?? null,
    },
    signature: sigMovie
      ? {
          id: sigMovie.id as number,
          title: sigMovie.title as string,
          year: (sigMovie.year as number | null) ?? null,
          posterPath: (sigMovie.poster_path as string | null) ?? null,
          stills: sigStills,
        }
      : null,
    themeMusic: style.themeMusic,
    threads: (profile.data?.threads ?? []) as Array<{ title: string; line: string }>,
    lovedCount: lovedCount.count ?? 0,
    followerCount: followerCount.count ?? 0,
    followingCount: followingCount.count ?? 0,
  });
}
