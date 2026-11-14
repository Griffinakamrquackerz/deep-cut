import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

// Turn an incoming auth link into a Supabase session. Three flows, so it
// survives supabase-js version changes and covers every link we actually send:
//  • token_hash + type — the INVITE and magic-link emails (see below)
//  • implicit — access_token / refresh_token in the query or #fragment
//  • PKCE — a ?code= we exchange for a session
// Returns true when a session was established; false for non-auth links.

/** Types Supabase's generateLink can mint. Same list as the web route. */
const OTP_TYPES: EmailOtpType[] = ["invite", "magiclink", "signup", "recovery", "email"];

export async function createSessionFromUrl(url: string): Promise<boolean> {
  const parsed = Linking.parse(url);
  const qp = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
  const frag = parseFragment(url);

  const errorDescription = qp.error_description ?? frag.error_description;
  if (errorDescription) throw new Error(errorDescription);

  // ── The invite email ──
  //
  // This branch is why an App Store install could not be activated. Every
  // link we mail is built by generateLink(), which returns a `token_hash` and
  // a `type` — not an access token and not a PKCE code. The web route at
  // ../src/app/auth/confirm/route.ts has always verified it server-side
  // and set a cookie; nothing here knew that shape at all.
  //
  // So even once iOS was told it could open thedeepcut.xyz links, the app
  // would have opened, found no token it recognised, returned false, and shown
  // the login wall to somebody who had just tapped their own invite. Universal
  // Links without this is a redirect into the same dead end.
  //
  // The token is single-use: whichever side verifies it first gets the
  // session. On a phone with the app installed that is now the app, which is
  // the right outcome — the person tapped a link on the device they want to
  // be signed in on.
  const tokenHash = qp.token_hash ?? frag.token_hash;
  const type = (qp.type ?? frag.type) as EmailOtpType | undefined;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) throw error;
    return true;
  }

  const access_token = qp.access_token ?? frag.access_token;
  const refresh_token = qp.refresh_token ?? frag.refresh_token;
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return true;
  }

  const code = qp.code ?? frag.code;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }
  return false;
}

/** Params in a URL hash fragment (expo-linking's parse only reads the query). */
function parseFragment(url: string): Record<string, string> {
  const hash = url.split("#")[1];
  if (!hash) return {};
  const out: Record<string, string> = {};
  for (const pair of hash.split("&")) {
    const [k, v] = pair.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}
