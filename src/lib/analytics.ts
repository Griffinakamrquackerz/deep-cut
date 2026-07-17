// M6 instrumentation — every product metric funnels through this one helper.
// Event names (keep stable, dashboards key off them):
//   onboarding_completed, profile_generated, rec_batch_dealt,
//   rec_watchlisted, rec_seen, rec_dismissed, reason_tapped,
//   playlist_created, playlist_shared, playlist_item_crossed,
//   taste_card_shared, follow_created
import { supabaseAdmin } from "./supabase/admin";

export async function track(
  userId: string | null,
  name: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin().from("events").insert({ user_id: userId, name, props });
  } catch {
    // Analytics must never break product flows.
  }
}
