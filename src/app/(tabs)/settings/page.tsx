import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import SettingsScreen from "@/components/SettingsScreen";
import type { Service } from "@/lib/services";
import { resolveStyle } from "@/lib/profile-style";
import { getPremium, premiumConfigured } from "@/lib/premium";
import { lifetimeConfigured } from "@/lib/stripe";
import { isAdminEmail } from "@/lib/admin";

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
    // null (not "marquee") so resolveStyle still consults the events fallback.
    me = legacy.data ? { ...legacy.data, profile_theme: null, signature_movie_id: null } : null;
  }

  const style = await resolveStyle(user.id, me);
  const premiumState = await getPremium(user.id);
  const premiumActive =
    !!premiumState.premiumUntil && new Date(premiumState.premiumUntil).getTime() > Date.now();
  const [services, sig] = await Promise.all([
    db.from("user_services").select("service").eq("user_id", user.id),
    style.signatureMovieId
      ? db.from("movies").select("id, title, year").eq("id", style.signatureMovieId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SettingsScreen
      handle={me?.handle ?? null}
      services={(services.data ?? []).map((r) => r.service as Service)}
      avatarUrl={me?.avatar_url ?? null}
      theme={style.theme ?? "marquee"}
      signatureMovie={sig.data ?? null}
      premiumActive={premiumActive}
      premiumUntil={premiumState.premiumUntil}
      hasStripeCustomer={!!premiumState.stripeCustomerId}
      premiumAvailable={premiumConfigured()}
      lifetimeAvailable={lifetimeConfigured()}
      isAdmin={isAdminEmail(user.email)}
    />
  );
}
