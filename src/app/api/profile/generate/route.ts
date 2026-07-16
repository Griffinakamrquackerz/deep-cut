import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { regenerateProfile } from "@/lib/engine";
import { checkAndIncrement } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // First-ever generation (onboarding) is free; regens are limited to 1/day.
  const { data: existing } = await supabaseAdmin()
    .from("taste_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    const allowed = await checkAndIncrement(user.id, "profile_regen");
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const profile = await regenerateProfile(user.id);
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
