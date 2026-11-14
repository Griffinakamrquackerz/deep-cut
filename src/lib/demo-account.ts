import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovies } from "@/lib/tmdb";
import { STARTER_GRID } from "@/lib/starter-grid";
import { setPremium } from "@/lib/premium";
import { LIFETIME_UNTIL } from "@/lib/stripe";
import { regenerateProfile, dealRecs } from "@/lib/engine";
import { DEFAULT_REGION } from "@/lib/region";
import type { Service } from "@/lib/services";

// The account App Review signs in with.
//
// Apple's reviewers get one pass at the app and no way to ask questions. Three
// things have to be true before they open it, and all three are easy to get
// wrong:
//
//  1. A REAL PASSWORD. Deep Cut signs people in with magic links, and a
//     reviewer cannot receive email at an address they don't own. An app whose
//     only door is a magic link is rejected under 2.1 as incomplete — the
//     reviewer literally cannot get in. So this account is created with
//     password auth and email_confirm already set, bypassing the link.
//
//  2. EIGHT LOVED FILMS. src/app/index.tsx in the native app redirects to
//     /onboarding while lovedCount < 8. A reviewer landing in an onboarding
//     grid sees a film-picker, not a product, and everything the app is for
//     sits behind it.
//
//  3. RECOMMENDATIONS ALREADY DEALT. Tonight is the main screen. Empty, it
//     reads as broken. The deal is an LLM call that can take a while, and a
//     reviewer tapping "deal me a film" and waiting is a worse first
//     impression than one who never has to.
//
// Provisioning is IDEMPOTENT and re-runnable, on purpose: App Review sometimes
// comes back days later, and a reviewer who has swiped through the whole feed
// needs it topped up rather than a new account with new credentials in the
// submission form.

/** Films the reviewer will appear to love. Enough breadth that the taste
 *  profile isn't a single genre, and all cached by the starter grid already. */
const DEMO_PICK_COUNT = 12;

/** Every major service, so the availability filter never empties the feed. */
const DEMO_SERVICES: Service[] = ["netflix", "prime", "disney", "apple", "mubi"];

export function demoEmail(): string {
  return (process.env.DEMO_ACCOUNT_EMAIL || "appreview@thedeepcut.xyz").trim().toLowerCase();
}

/**
 * A password a reviewer can actually type off a form.
 *
 * No ambiguous characters, because this gets copied into App Store Connect by
 * hand and read off a screen by somebody else. Long enough to be a real
 * password; not clever.
 */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

export interface DemoState {
  email: string;
  exists: boolean;
  userId: string | null;
  /** Can they sign in with a password, or is this a magic-link-only account? */
  hasPassword: boolean;
  lovedCount: number;
  servicesCount: number;
  activeRecs: number;
  premiumUntil: string | null;
  /** Everything a reviewer needs is in place. */
  ready: boolean;
  /** What's missing, in words. */
  blockers: string[];
}

async function findUser(email: string): Promise<{ id: string; hasPassword: boolean } | null> {
  const db = supabaseAdmin();
  // listUsers rather than a filter: the admin API has no get-by-email, and
  // paging 200 at a time is fine at this size.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) {
      // Supabase doesn't expose "has a password" directly. An account created
      // by magic link has no identity of provider "email" with a password set,
      // but it DOES have an email identity — so the only honest signal we can
      // read here is whether we ourselves set one, recorded below.
      const meta = (hit.user_metadata ?? {}) as { demo_password_set?: unknown };
      return { id: hit.id, hasPassword: meta.demo_password_set === true };
    }
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function demoState(): Promise<DemoState> {
  const email = demoEmail();
  const db = supabaseAdmin();
  const found = await findUser(email);

  if (!found) {
    return {
      email,
      exists: false,
      userId: null,
      hasPassword: false,
      lovedCount: 0,
      servicesCount: 0,
      activeRecs: 0,
      premiumUntil: null,
      ready: false,
      blockers: ["The account doesn't exist yet."],
    };
  }

  const [loved, services, recs, row] = await Promise.all([
    db.from("loved_movies").select("movie_id", { count: "exact", head: true }).eq("user_id", found.id),
    db.from("user_services").select("service", { count: "exact", head: true }).eq("user_id", found.id),
    db
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", found.id)
      .eq("status", "active"),
    db.from("users").select("premium_until").eq("id", found.id).maybeSingle(),
  ]);

  const lovedCount = loved.count ?? 0;
  const activeRecs = recs.count ?? 0;
  const premiumUntil = (row.data?.premium_until as string | null) ?? null;
  const premiumLive = !!premiumUntil && new Date(premiumUntil).getTime() > Date.now();

  const blockers: string[] = [];
  if (!found.hasPassword) blockers.push("No password set — a reviewer can't receive a magic link.");
  if (lovedCount < 8) blockers.push(`Only ${lovedCount} loved films; under 8 the app opens onboarding.`);
  if (activeRecs === 0) blockers.push("No recommendations dealt — Tonight would be empty.");
  if (!premiumLive) blockers.push("Premium isn't granted, so the paid surface is hidden.");

  return {
    email,
    exists: true,
    userId: found.id,
    hasPassword: found.hasPassword,
    lovedCount,
    servicesCount: services.count ?? 0,
    activeRecs,
    premiumUntil,
    ready: blockers.length === 0,
    blockers,
  };
}

export interface ProvisionResult {
  email: string;
  /** Returned ONCE, on the call that set it. Nothing stores it in plain text. */
  password: string;
  userId: string;
  created: boolean;
  lovedSeeded: number;
  recsDealt: number;
  notes: string[];
}

/**
 * Create or repair the review account. Safe to run repeatedly.
 *
 * Order matters and follows the same path a real person takes, so the reviewer
 * lands in the same state a real member would: love some films, pick your
 * services, get a taste profile, get dealt a night.
 */
export async function provisionDemoAccount(password?: string): Promise<ProvisionResult> {
  const db = supabaseAdmin();
  const email = demoEmail();
  const pw = password?.trim() || generatePassword();
  const notes: string[] = [];

  // ── 1. The account, with a password ──
  const existing = await findUser(email);
  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
    const { error } = await db.auth.admin.updateUserById(userId, {
      password: pw,
      email_confirm: true,
      user_metadata: { demo_password_set: true, demo_account: true },
    });
    if (error) throw new Error(`couldn't set the password: ${error.message}`);
    notes.push("Account already existed — password reset and data topped up.");
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: pw,
      // Skips the confirmation email entirely. Without this the reviewer is
      // sent a link they can't open and the account stays unusable.
      email_confirm: true,
      user_metadata: { demo_password_set: true, demo_account: true },
    });
    if (error || !data?.user) throw new Error(`couldn't create the account: ${error?.message}`);
    userId = data.user.id;
    created = true;
  }

  // The public.users row is created by a trigger on auth.users, which the
  // insert above races. Give it a name and a region rather than leaving a
  // reviewer looking at a blank profile.
  await db
    .from("users")
    .upsert({
      id: userId,
      display_name: "App Review",
      handle: "appreview",
      region: DEFAULT_REGION,
    })
    .then(({ error }) => {
      // Not fatal: handle has a unique constraint and a second run will
      // collide with itself harmlessly.
      if (error) notes.push(`Profile row not updated: ${error.message}`);
    });

  // ── 2. Loved films (the onboarding gate) ──
  const picks = STARTER_GRID.slice(0, DEMO_PICK_COUNT).map((f) => f.tmdbId);
  const cached = await cacheMovies(picks);
  if (cached.length < 8) {
    throw new Error(
      `only ${cached.length} of ${picks.length} starter films could be fetched from TMDB — the account would land in onboarding. Check TMDB_API_KEY.`,
    );
  }
  const { error: lovedErr } = await db
    .from("loved_movies")
    .upsert(cached.map((m) => ({ user_id: userId, movie_id: m.id })));
  if (lovedErr) throw new Error(`couldn't save loved films: ${lovedErr.message}`);

  // ── 3. Services (so the availability filter never empties the feed) ──
  await db.from("user_services").delete().eq("user_id", userId);
  const { error: svcErr } = await db
    .from("user_services")
    .insert(DEMO_SERVICES.map((service) => ({ user_id: userId, service })));
  if (svcErr) notes.push(`Services not saved: ${svcErr.message}`);

  // ── 4. Premium (so the reviewer sees the paid surface, and no ads) ──
  const ok = await setPremium(userId, LIFETIME_UNTIL, null);
  if (!ok) notes.push("Premium flag not saved — the reviewer will see the free tier.");

  // ── 5. A taste profile, then an actual night dealt ──
  await regenerateProfile(userId).catch((e) => {
    notes.push(`Taste profile not generated: ${String(e).slice(0, 120)}`);
  });

  let recsDealt = 0;
  try {
    // Obscurity floor of 2 is the house default, and myServicesOnly false so a
    // thin provider cache can't hand a reviewer an empty screen.
    const dealt = await dealRecs(userId, {
      obscurityMin: 2,
      obscurityMax: 5,
      myServicesOnly: false,
      region: DEFAULT_REGION,
    });
    recsDealt = dealt.length;
  } catch (e) {
    notes.push(`Couldn't deal recommendations: ${String(e).slice(0, 160)}`);
  }
  if (recsDealt === 0) {
    notes.push(
      "No recommendations were dealt, so Tonight will be empty until someone taps deal. Run this again — the deal depends on the LLM and TMDB.",
    );
  }

  return {
    email,
    password: pw,
    userId,
    created,
    lovedSeeded: cached.length,
    recsDealt,
    notes,
  };
}
