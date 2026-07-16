import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Server-side only; used for the movies
// cache, taste_profiles, recommendations writes, rate limits, and logs.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
