import { redirect } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import TonightScreen from "@/components/TonightScreen";
import type { Service } from "@/lib/services";

export default async function TonightPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

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
  return <TonightScreen myServices={myServices} />;
}
