import { redirect } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import TonightScreen from "@/components/TonightScreen";
import Landing from "@/components/Landing";
import type { Service } from "@/lib/services";
import { isPremium } from "@/lib/premium";

export default async function TonightPage() {
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
  return <TonightScreen myServices={myServices} premium={premium} />;
}
