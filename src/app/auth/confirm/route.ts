import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where invite and magic-link emails land.
 *
 * Not the same thing as /auth/callback, and the difference is the whole reason
 * invites didn't work. A link minted server-side by generateLink() sends the
 * session back in the URL *fragment* (#access_token=…), which browsers never
 * transmit to the server — so /auth/callback, a route handler looking for a
 * `?code=` query param, saw an empty request and bounced every invited person
 * to /login. That flow is for PKCE links the browser itself started (password
 * reset, OAuth), and it stays as it is.
 *
 * This route takes the `hashed_token` that generateLink() returns alongside the
 * link, verifies it here, and sets the session cookie from the server. Nothing
 * depends on JavaScript reading a fragment, and the address in the email is
 * thedeepcut.xyz rather than a supabase.co URL — which is both more credible to
 * the person clicking it and better for the domain's sending reputation.
 */

const TYPES: EmailOtpType[] = ["invite", "magiclink", "signup", "recovery", "email"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");

  if (!tokenHash || !type || !TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/login?e=badlink`);
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Overwhelmingly this is a link that expired or was already used — both of
    // which need a new one, not a retry. The login page says so.
    return NextResponse.redirect(`${origin}/login?e=expired`);
  }

  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return NextResponse.redirect(`${origin}${nextParam}`);
  }

  // A freshly invited person has no taste on file yet, so send them to the
  // onboarding grid rather than an empty Tonight screen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?e=expired`);

  const { count } = await supabase
    .from("loved_movies")
    .select("movie_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.redirect(`${origin}${count && count >= 8 ? "/" : "/welcome"}`);
}
