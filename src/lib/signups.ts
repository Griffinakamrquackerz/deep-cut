// Can a stranger let themselves in right now?
//
// The answer lives in Supabase Auth settings, not in this codebase — there is a
// single "Allow new users to sign up" toggle and the velvet rope in
// lib/waitlist.ts only holds while it is OFF. That split is a trap: the day the
// toggle flips, three places on the landing page keep saying "invite only" and
// the founder's note keeps saying "anyone can use it", and which of those is
// true depends on a dashboard nobody looking at the page can see.
//
// So the page asks. Supabase exposes its own settings unauthenticated at
// /auth/v1/settings, which is the same probe /api/version already used to
// report signupsOpen — lifted here so the health endpoint and the front door
// read one source rather than two copies of the same fetch.

/**
 * true = anyone can sign up. false = invite-only, the waitlist is the door.
 * null = we couldn't ask, so don't claim either — callers should fall back to
 * the invite-only wording, because promising an open door that isn't is worse
 * than under-promising an open one.
 *
 * Cached for a minute by default. This is a setting that changes roughly once
 * in a product's life, and the landing page is the most-requested route on the
 * site; an uncached round-trip to Supabase on every render would be a real cost
 * for an answer that is effectively constant.
 */
export async function signupsOpen(revalidateSeconds = 60): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { disable_signup?: boolean };
    // Read the negative deliberately: a response missing the field entirely
    // would coerce to "open" under a truthiness check, which is the one wrong
    // answer that puts a broken signup button in front of everybody.
    return d.disable_signup === false;
  } catch {
    return null; // unknown beats guessing
  }
}
