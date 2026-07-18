// Style storage with a zero-migration fallback: preferred home is the
// users.profile_theme / users.signature_movie_id columns (migration 0004),
// but installs that haven't run it store style as "profile_style" rows in
// the events table — latest row wins. Reads overlay the fallback, so picks
// survive either way and nothing requires the user to touch SQL.

import { supabaseAdmin } from "./supabase/admin";

const EVENT = "profile_style";

export interface ProfileStyle {
  theme: string | null;
  signatureMovieId: number | null;
}

export async function readStyleFallback(userId: string): Promise<ProfileStyle> {
  const { data } = await supabaseAdmin()
    .from("events")
    .select("props")
    .eq("user_id", userId)
    .eq("name", EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = (data?.props ?? {}) as Record<string, unknown>;
  return {
    theme: typeof p.theme === "string" ? p.theme : null,
    signatureMovieId: typeof p.signature_movie_id === "number" ? p.signature_movie_id : null,
  };
}

/** Merge a patch over the latest fallback row and append the result. */
export async function writeStyleFallback(
  userId: string,
  patch: { theme?: string; signatureMovieId?: number | null },
): Promise<boolean> {
  const current = await readStyleFallback(userId);
  const merged = {
    theme: patch.theme ?? current.theme,
    signature_movie_id:
      patch.signatureMovieId === undefined ? current.signatureMovieId : patch.signatureMovieId,
  };
  const { error } = await supabaseAdmin()
    .from("events")
    .insert({ user_id: userId, name: EVENT, props: merged });
  return !error;
}

/**
 * Column values win when they carry a real pick; otherwise consult the
 * events fallback. A bare "marquee" column is the post-migration default —
 * not proof of a choice — so it defers to the fallback too (writes keep the
 * fallback in sync, so an intentional marquee pick still resolves right).
 */
export async function resolveStyle(
  userId: string,
  row: { profile_theme?: string | null; signature_movie_id?: number | null } | null,
): Promise<ProfileStyle> {
  const colTheme = row?.profile_theme ?? null;
  const colSig = row?.signature_movie_id ?? null;
  if ((colTheme && colTheme !== "marquee") || colSig) {
    return { theme: colTheme, signatureMovieId: colSig };
  }
  const fallback = await readStyleFallback(userId);
  return {
    theme: fallback.theme ?? colTheme,
    signatureMovieId: fallback.signatureMovieId ?? colSig,
  };
}
