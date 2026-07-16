import { redirect } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

// M1 placeholder — the full Tonight screen (rec cards, obscurity dial,
// service filter) lands in M2.
export default async function TonightPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("loved_movies")
    .select("movie_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count || count < 8) redirect("/welcome");

  return (
    <section>
      <p className="eyebrow">Tonight</p>
      <h1 className="font-display text-4xl text-cream">YOUR RECS ARE COMING</h1>
      <p className="mt-2 text-sm text-dim">The taste engine arrives in the next reel.</p>
    </section>
  );
}
