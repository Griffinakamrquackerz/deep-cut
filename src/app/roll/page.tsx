import type { Metadata } from "next";
import RollChannel from "./RollChannel";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Service } from "@/lib/services";
import { isPremium } from "@/lib/premium";

// Public lean-back mode — no account needed, like Settle It. Signed-in viewers
// also get the "only on my platforms" filter, so we read their services here.
export const metadata: Metadata = {
  title: "Just Roll It — a channel of deep cuts",
  description:
    "Pick a channel and lean back: Deep Cut rolls trailers for films you haven't seen until one grabs you. No decisions required.",
};

export default async function RollPage() {
  const user = await currentUser();
  // Signed-out viewers see the ad — Roll is public, and that's the trade. A
  // paying member never should, on any screen.
  const premium = user ? await isPremium(user.id) : false;
  let myServices: Service[] = [];
  if (user) {
    const { data } = await supabaseAdmin()
      .from("user_services")
      .select("service")
      .eq("user_id", user.id);
    myServices = (data ?? []).map((r) => r.service as Service);
  }
  return <RollChannel myServices={myServices} premium={premium} />;
}
