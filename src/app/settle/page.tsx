import type { Metadata } from "next";
import SettleFlow from "./SettleFlow";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Service } from "@/lib/services";

export const metadata: Metadata = {
  title: "Settle It — Deep Cut",
  description: "Two of you, one phone, one movie. Nobody compromises out loud.",
};

// Standalone couch-standoff mode: no auth required, one shared phone. A
// signed-in host also gets the "only on my platforms" filter, so we read their
// services here (signed-out visitors just don't see the toggle).
export default async function SettlePage() {
  const user = await currentUser();
  let myServices: Service[] = [];
  if (user) {
    const { data } = await supabaseAdmin()
      .from("user_services")
      .select("service")
      .eq("user_id", user.id);
    myServices = (data ?? []).map((r) => r.service as Service);
  }
  return <SettleFlow myServices={myServices} />;
}
