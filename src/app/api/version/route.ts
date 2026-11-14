import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { fundProgress } from "@/lib/fund";
import { signupsOpen } from "@/lib/signups";
import {
  ADSENSE_CLIENT,
  ADSENSE_SLOT,
  ADSENSE_CLIENT_MALFORMED,
  ADSENSE_SLOT_MALFORMED,
} from "@/lib/adsense";

// Deploy marker — bump BUILD when shipping a fix so the live version is
// verifiable from outside (no more guessing whether a deploy has landed).
const BUILD = "taste-blend-v268";

export const dynamic = "force-dynamic";

/**
 * Does this table exist and can it be read?
 *
 * Deliberately NOT a `head: true` request any more, and this is the whole
 * reason the check exists. PostgREST answers a HEAD with an empty body, so
 * when the table is missing there is no error payload for supabase-js to
 * parse and it hands back `error: null` — a missing table reported as
 * present. That false positive is exactly the failure this endpoint is
 * supposed to catch, and it caused one: fund_contributions read as true on a
 * database that has never had it, so the migration got skipped.
 *
 * A real GET with `limit(0)` returns no rows either but does carry an error
 * body when there is one.
 */
async function tableExists(name: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin().from(name).select("*").limit(0);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Does this table have this column?
 *
 * Selecting one named column and asking for no rows makes PostgREST resolve the
 * name against the schema and nothing else. A column that isn't there comes
 * back as an error rather than as nulls, which is the distinction that matters:
 * `users.email` missing is invisible from every query that reads it — the read
 * fails, the caller sees an empty list, and the feature quietly does nothing.
 */
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    // Same reason as tableExists above: a GET, never a HEAD.
    const { error } = await supabaseAdmin().from(table).select(column).limit(0);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Can the Fund ledger actually be READ, and if not, why?
 *
 * `fundContributions: true` says the table is there, which turned out not to be
 * the same thing: /api/fund was returning ready:false on a database where the
 * table plainly existed. A table that exists but whose real query fails is
 * exactly the gap this endpoint is for — and "the bar is hidden" is not a
 * diagnosis. Postgres's own message, truncated; schema detail, never a row.
 */
async function fundReadable(): Promise<true | string> {
  try {
    await fundProgress(supabaseAdmin());
    return true;
  } catch (e) {
    return String(e instanceof Error ? e.message : e).slice(0, 160);
  }
}

/** How many films are currently on the bill. 0 means the seed hasn't run. */
async function showingCount(): Promise<number | null> {
  try {
    const { count, error } = await supabaseAdmin()
      .from("shorts")
      .select("*", { count: "exact", head: true })
      .eq("status", "showing");
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

export async function GET() {
  // Which migrations have actually been applied to THIS deployment's database.
  // Same reason as `configured` below: a feature that silently does nothing
  // because a table is missing should be one curl to diagnose, not a session
  // of guessing. Table names and counts only — never a row, never a person.
  const [
    notifications,
    tonight,
    shorts,
    emailOptouts,
    fundContributions,
    filmRounds,
    filmSubmissions,
    usersEmail,
    usersRegion,
    submissionReplies,
    fundCurrencyCol,
    fundRead,
    showing,
    openSignups,
  ] = await Promise.all([
    tableExists("notifications"),
    tableExists("tonight"),
    tableExists("shorts"),
    tableExists("email_optouts"),
    tableExists("fund_contributions"),
    tableExists("film_rounds"),
    tableExists("film_submissions"),
    columnExists("users", "email"),
    columnExists("users", "region"),
    columnExists("film_submissions", "replied_at"),
    columnExists("fund_contributions", "currency"),
    fundReadable(),
    showingCount(),
    // 0 = don't serve a cached answer to the health check. The landing page is
    // happy with a minute-old value; a diagnostic endpoint answering "is the
    // door open?" should not be.
    signupsOpen(0),
  ]);

  return NextResponse.json({
    build: BUILD,
    schema: {
      // 0012_social.sql — the inbox and what you're watching tonight.
      notifications,
      tonight,
      // 0006-ish onward — the Theatre programme itself.
      shorts,
      // 0013_email_prefs.sql. False means the monthly programme cron refuses
      // to run, on purpose: there'd be no way for anyone to opt out.
      emailOptouts,
      // 0016_fund.sql — the ledger. False means /api/fund throws and the bar
      // stays hidden, which is the intended behaviour rather than a bar
      // confidently reading $0 on a table that isn't there.
      fundContributions,
      // 0017_voting.sql — rounds, pitches, ballots.
      filmRounds,
      // 0019_submissions.sql — the open pile filmmakers submit into. False
      // means /submit takes a pitch and drops it, which is worse than the
      // page not existing.
      filmSubmissions,
      // 0018_users_email.sql. This one is a COLUMN, not a table, and it's the
      // reason this check exists at all: the monthly programme cron selects
      // id and email from public.users, and with no email column that query
      // errors, reads back as an empty list, and reports a healthy run that
      // mailed nobody. False here means that is happening right now.
      usersEmail,
      // 0022_user_region.sql. False means every recommendation is still being
      // computed against the American catalogue for everybody, which is the
      // bug the column exists to fix — the fallback is deliberate but it is
      // still the wrong answer outside the US.
      usersRegion,
      // 0023_submission_replies.sql. False means marking a pitch passed or
      // showcased tells the filmmaker nothing, which makes the promise in
      // every submission receipt — "you'll hear back either way" — untrue.
      submissionReplies,
      // 0024_fund_currency.sql. False means the ledger cannot tell one
      // currency from another, so a non-USD charge would sum into a dollar
      // total as if it were dollars. Safe today because every charge is USD;
      // the column is the prerequisite for that ever changing.
      fundCurrencyCol,
      // true, or the reason the ledger query fails. A table that exists but
      // can't be queried hides the fund bar with nothing to explain it.
      fundReadable: fundRead,
      // 0009/0010/0011 fill the fourteen channels; a low number here means a
      // seed migration is missing even though the table is present.
      filmsShowing: showing,
      // null = couldn't ask. false = invite-only: nobody new can sign
      // themselves up, whatever the free tier offers.
      signupsOpen: openSignups,
    },
    // Which integrations are actually wired in this deployment. Booleans only —
    // never a key, never a fragment of one. This exists because a missing
    // RESEND_API_KEY silently disabled every waitlist confirmation email and
    // there was no way to tell from outside; "is the env var even set in
    // Vercel?" should be one curl, not a support thread.
    configured: {
      resend: !!process.env.RESEND_API_KEY,
      llm: !!process.env.LLM_API_KEY,
      tmdb: !!process.env.TMDB_API_KEY,
      omdb: !!process.env.OMDB_API_KEY,
      supabaseAdmin: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      // Both halves, because premiumConfigured() needs both and a missing
      // price id fails at the checkout button rather than at boot — the
      // upgrade path looks fine right up until somebody taps it.
      stripePriceId: !!process.env.STRIPE_PRICE_ID,
      // The one that strands a paying customer. Without it the webhook 503s,
      // which means skip-the-line takes the money and never seats anybody —
      // and the checkout itself works perfectly right up to that point, so
      // there is nothing on the outside to see. Now there is.
      stripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      // This flag used to be an invitation. The cron routes were written
      // `if (secret) { ...check... }`, so an unset secret meant no auth at
      // all — and publishing the flag here told anyone who asked which
      // deployments were open. Read it, then drive /api/cron/friday-deal in a
      // loop.
      //
      // The routes now fail closed, which inverts the meaning: false means
      // the crons are DEAD (no Friday push, no monthly programme, no waitlist
      // trickle), not that they are open. That is worth publishing — it's the
      // difference between "nobody is being seated" and "the door is
      // unlocked", and only one of those is a secret.
      cronSecret: !!process.env.CRON_SECRET,
      // Browser push. False means the VAPID keys aren't set, so every web
      // notification silently no-ops and the Settings toggle hides itself —
      // which looks exactly like "notifications don't work" from the outside.
      // Generate a pair with: npx web-push generate-vapid-keys
      webPush: pushConfigured(),
      // Ads need BOTH halves. A client id on its own renders an empty box
      // instead of an advert — the unit id is what AdSense actually keys on.
      // Either missing means every placement stays a house ad, which is the
      // right failure but looks identical to "AdSense hasn't approved us".
      //
      // These report the PARSED values, not merely whether the env vars are
      // set. A publisher id pasted without its `ca-` prefix, or with the
      // newline a browser copy brings along, used to read True here while
      // every tag built from it was wrong — a health check confirming a broken
      // configuration. The Malformed flags are how "somebody set this and got
      // a character wrong" tells itself apart from "nobody has set it yet".
      adsenseClient: !!ADSENSE_CLIENT,
      adsenseSlot: !!ADSENSE_SLOT,
      adsenseClientMalformed: ADSENSE_CLIENT_MALFORMED,
      adsenseSlotMalformed: ADSENSE_SLOT_MALFORMED,
      // Theatre tab catalogue search — optional. Paste-a-link add works with
      // neither key set; these only unlock typing a title and browsing results.
      // Apple Universal Links. False means /.well-known/apple-app-site-association
      // 404s, which means a tapped invite email opens Safari instead of the
      // app and an App Store install can never be activated. The team id
      // belongs to the Apple developer account, so this is the one piece of
      // launch config that isn't ours to set.
      appleTeamId: /^[A-Z0-9]{10}$/.test((process.env.APPLE_TEAM_ID || "").trim()),
      vimeoSearch: !!process.env.VIMEO_ACCESS_TOKEN,
      youtubeSearch: !!process.env.YOUTUBE_API_KEY,
      emailFrom: process.env.EMAIL_FROM || "Deep Cut <tickets@thedeepcut.xyz>",
      // 0 means the daily trickle is paused and nobody is being seated.
      waitlistDaily: Number(process.env.WAITLIST_DAILY ?? 25),
    },
  });
}
