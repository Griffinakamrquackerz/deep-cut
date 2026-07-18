import { redirect } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import TonightScreen from "@/components/TonightScreen";
import Landing from "@/components/Landing";
import type { Service } from "@/lib/services";
import { isPremium } from "@/lib/premium";

export default async function TonightPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Safety net: if a Supabase auth code lands on the homepage (misconfigured
  // Site URL, older email templates), hand it to the real callback instead of
  // stranding the user on the landing page.
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  const user = await currentUser();
  if (!user) {
    // Signed-out front door: sell the fantasy with a wall of real posters.
    const { data } = await supabaseAdmin()
      .from("movies")
      .select("poster_path")
      .not("poster_path", "is", null)
      .order("popularity", { ascending: false })
      .limit(12);
    return <Landing posters={(data ?? []).map((r) => r.poster_path as string)} />;
  }

  const supabase = await supabaseServer();
  const [{ count }, { data: svcRows }] = await Promise.all([
    supabase
      .from("loved_movies")
      .select("movie_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase.from("user_services").select("service").eq("user_id", user.id),
  ]);
  if (!count || count < 8) redirect("/welcome");

  const myServices = (svcRows ?? []).map((r) => r.service as Service);
  const premium = await isPremium(user.id);

  // Morning-after loop: the most recent film we dealt more than 8h ago that you
  // never logged. "Did you watch last night's deal?" closes the loop and feeds
  // the taste engine.
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const { data: maRec } = await supabase
    .from("recommendations")
    .select("id, created_at, movies(id, title, year, poster_path)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .lt("created_at", eightHoursAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maMovie = maRec?.movies as unknown as {
    id: number;
    title: string;
    year: number | null;
    poster_path: string | null;
  } | null;
  const morningAfter = maMovie ? { recId: maRec!.id as string, movie: maMovie } : null;

  return <TonightScreen myServices={myServices} premium={premium} morningAfter={morningAfter} />;
}
