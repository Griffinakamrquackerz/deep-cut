import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import YouScreen from "./YouScreen";
import type { Service } from "@/lib/services";

export default async function YouPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  const [profile, me, services, watchlist, loved, history] = await Promise.all([
    db.from("taste_profiles").select("threads, version, generated_at").eq("user_id", user.id).maybeSingle(),
    db.from("users").select("handle, display_name").eq("id", user.id).maybeSingle(),
    db.from("user_services").select("service").eq("user_id", user.id),
    db
      .from("recommendations")
      .select("id, reason, obscurity, movies(id, title, year, poster_path, genres, providers)")
      .eq("user_id", user.id)
      .eq("status", "watchlisted")
      .order("created_at", { ascending: false }),
    db
      .from("loved_movies")
      .select("movie_id, movies(id, title, year, poster_path, genres)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false }),
    db
      .from("watch_logs")
      .select("id, reaction, why, note, watched_at, movies(id, title, year, poster_path, genres)")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <YouScreen
      threads={(profile.data?.threads ?? []) as Array<{ title: string; line: string }>}
      version={profile.data?.version ?? 0}
      handle={me.data?.handle ?? null}
      displayName={me.data?.display_name ?? null}
      services={(services.data ?? []).map((r) => r.service as Service)}
      watchlist={JSON.parse(JSON.stringify(watchlist.data ?? []))}
      loved={JSON.parse(JSON.stringify(loved.data ?? []))}
      history={JSON.parse(JSON.stringify(history.data ?? []))}
    />
  );
}
