import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import SettingsScreen from "@/components/SettingsScreen";
import type { Service } from "@/lib/services";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  const [me, services] = await Promise.all([
    db.from("users").select("handle").eq("id", user.id).maybeSingle(),
    db.from("user_services").select("service").eq("user_id", user.id),
  ]);

  return (
    <SettingsScreen
      handle={me.data?.handle ?? null}
      services={(services.data ?? []).map((r) => r.service as Service)}
    />
  );
}
