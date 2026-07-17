import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import SettingsScreen from "@/components/SettingsScreen";
import type { Service } from "@/lib/services";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  // Style columns arrive with migration 0004 — fall back to the legacy shape.
  let { data: me } = await db
    .from("users")
    .select("handle, avatar_url, profile_theme, signature_movie_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) {
    const legacy = await db
      .from("users")
      .select("handle, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    me = legacy.data ? { ...legacy.data, profile_theme: "marquee", signature_movie_id: null } : null;
  }

  const [services, sig] = await Promise.all([
    db.from("user_services").select("service").eq("user_id", user.id),
    me?.signature_movie_id
      ? db.from("movies").select("id, title, year").eq("id", me.signature_movie_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SettingsScreen
      handle={me?.handle ?? null}
      services={(services.data ?? []).map((r) => r.service as Service)}
      avatarUrl={me?.avatar_url ?? null}
      theme={me?.profile_theme ?? "marquee"}
      signatureMovie={sig.data ?? null}
    />
  );
}
