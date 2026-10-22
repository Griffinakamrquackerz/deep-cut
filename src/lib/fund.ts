import type { SupabaseClient } from "@supabase/supabase-js";

// The Fund — a share of what the house takes in, pointed at financing a feature.
//
// Vocabulary is deliberate throughout this file and should stay that way:
// members SUPPORT, they earn POINTS, points are VOTES, and a backer gets a
// CREDIT. Nobody invests, nothing is a share, and no point has a cash value.
// Reward-based crowdfunding is ordinary and legal precisely because of that
// line; a point that entitled somebody to profit would be a security.
//
// The goal is a SPENDING threshold, not an escrow. Members buy a subscription;
// the house chooses to allocate part of it. Nothing is held in trust for a
// specific film, so a goal that takes a year to reach owes nobody a refund.

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * The currency the fund is denominated in.
 *
 * The goal, the bar and the vote budget are all in this. Contributions in any
 * other currency are recorded but NOT summed into the bar, because adding
 * 2,500 euro-cents to a dollar total produces a number that means nothing and
 * announces nothing.
 */
export function fundCurrency(): string {
  return (process.env.FUND_CURRENCY || "usd").toLowerCase();
}

/** Which film points count toward. Bump when a round closes. */
export function currentCycle(): string {
  return process.env.FUND_CYCLE || "film-01";
}

/** What has to be in the pot before a film gets commissioned. */
export function goalCents(): number {
  // $250,000 — the floor of a real feature, not a short. The range Deep Cut
  // is aiming at is $250k-$1M, and the goal is set at the bottom of it so the
  // first picture is genuinely reachable rather than aspirational.
  return envInt("FUND_GOAL_CENTS", 25_000_000);
}

/** Share of each payment earmarked for the Fund, as a percentage. */
export function sharePct(): number {
  return Math.min(100, envInt("FUND_SHARE_PCT", 60));
}

/**
 * Most votes one person can hold in a round.
 *
 * Not a limit on generosity — you can give whatever you like, and it all
 * counts toward the goal and toward your perks. It's a limit on how much of the
 * OUTCOME any one wallet can buy. Without it the film is chosen by whoever is
 * richest, which is the thing this is supposed to be an alternative to.
 *
 * Set at 1,000 to land exactly where the credit tiers begin ($1,000 =
 * Co-Producer). Below that your votes track your money one for one; above it
 * you're buying credits and access, not influence. The two ladders meeting at
 * the same rung is deliberate — it makes the rule legible without a paragraph.
 */
export function pointCap(): number {
  return envInt("FUND_POINT_CAP", 1_000);
}

/** A dollar given is a point earned, then capped. */
export function pointsFor(grossCents: number): number {
  return Math.min(Math.floor(Math.max(0, grossCents) / 100), pointCap());
}

/**
 * How long a ONE-TIME contribution unlocks the full app for.
 *
 * The landing page says a donation does more than unlock the app, which was
 * true of the monthly plan and quietly false of every one-time payment: those
 * seated the member and earned them votes, and never touched premium_until.
 * Somebody who put in $25 got ads.
 *
 * A fiver a month is the rate, matching the Ticket Holder tier, so every $5
 * buys a month and the floor is one month. Legible in a sentence, which is the
 * test any pricing rule has to pass.
 */
export function premiumMonthsFor(grossCents: number): number {
  return Math.max(1, Math.floor(Math.max(0, grossCents) / 500));
}

/** That window as a timestamp, extending whatever they already have. */
export function premiumUntilFor(grossCents: number, from?: string | null): string {
  // Extend rather than replace: a member who supports twice in a month should
  // end up with two months, not have the second payment overwrite the first.
  const base = from ? new Date(from).getTime() : 0;
  const start = Number.isFinite(base) && base > Date.now() ? base : Date.now();
  return new Date(start + premiumMonthsFor(grossCents) * 30 * 24 * 60 * 60 * 1000).toISOString();
}

/** The Fund's cut of a payment. Rounded down — never over-promise the pot. */
export function fundCutCents(grossCents: number): number {
  return Math.floor((Math.max(0, grossCents) * sharePct()) / 100);
}

export type ContributionKind = "subscription" | "lifetime" | "donation" | "adjustment";

/**
 * Record a payment against the Fund.
 *
 * Idempotent on stripeRef, because Stripe delivers webhooks more than once by
 * design — that is the contract, not a bug — and counting somebody's money
 * twice would inflate both the bar and their votes.
 */
export async function recordContribution(
  db: SupabaseClient,
  input: {
    userId: string;
    grossCents: number;
    kind: ContributionKind;
    stripeRef?: string | null;
    cycle?: string;
    /** ISO 4217 as Stripe reports it. Defaults to the fund's own currency —
     *  every charge to date is in it, and the callers all pass Stripe's value. */
    currency?: string | null;
  },
): Promise<boolean> {
  const gross = Math.floor(input.grossCents);
  if (!Number.isFinite(gross) || gross === 0) return false;

  const currency = (input.currency ?? fundCurrency()).toLowerCase();
  if (currency !== fundCurrency()) {
    // Recorded, but it will not reach the bar. Logged loudly because the
    // alternative is a total that silently drifts from the money taken.
    console.error(
      `contribution in ${currency} recorded but excluded from the ${fundCurrency()} bar — user ${input.userId}, ref ${input.stripeRef}`,
    );
  }

  const { error } = await db.from("fund_contributions").insert({
    user_id: input.userId,
    gross_cents: gross,
    fund_cents: fundCutCents(gross),
    kind: input.kind,
    cycle: input.cycle ?? currentCycle(),
    stripe_ref: input.stripeRef ?? null,
    currency,
  });

  if (error) {
    // 23505 is a unique violation: this payment is already in the ledger,
    // which is the idempotency working rather than a failure.
    if ((error as { code?: string }).code === "23505") return true;
    console.error("recordContribution failed", error.message);
    return false;
  }
  return true;
}

export interface FundProgress {
  cycle: string;
  /** In the pot for this cycle. */
  raisedCents: number;
  goalCents: number;
  /** 0-100, clamped — a bar that renders past its own end looks broken. */
  percent: number;
  /** Has the threshold been cleared? */
  funded: boolean;
  backers: number;
}

/**
 * Throws when the ledger can't be read, and that matters.
 *
 * The first version destructured only `data` and returned zeros on failure, so
 * a missing migration produced a fully-formed answer reading "$0 of $25,000" —
 * a bar claiming to work, on a table that didn't exist. The caller has to be
 * able to tell "nobody has given anything yet" apart from "we cannot see the
 * ledger", because only one of those is worth putting on a landing page.
 */
export async function fundProgress(db: SupabaseClient): Promise<FundProgress> {
  const cycle = currentCycle();
  const goal = goalCents();

  // Two attempts, and the fallback is deliberate rather than lazy: selecting a
  // column migration 0024 hasn't added yet is an error, and the first read
  // failing must not take the bar off a public page during the window between
  // deploy and somebody running SQL. Every existing row is in the fund's
  // currency anyway, so the fallback total is correct — it just can't prove it.
  let rows: Array<{ fund_cents: number; user_id: string }>;
  const scoped = await db
    .from("fund_contributions")
    .select("fund_cents, user_id")
    .eq("cycle", cycle)
    .eq("currency", fundCurrency());

  if (scoped.error) {
    const all = await db
      .from("fund_contributions")
      .select("fund_cents, user_id")
      .eq("cycle", cycle);
    if (all.error) throw new Error(`fund ledger unreadable: ${all.error.message}`);
    rows = (all.data ?? []) as Array<{ fund_cents: number; user_id: string }>;
  } else {
    rows = (scoped.data ?? []) as Array<{ fund_cents: number; user_id: string }>;
  }

  const raised = rows.reduce((sum, r) => sum + (Number(r.fund_cents) || 0), 0);

  return {
    cycle,
    raisedCents: raised,
    goalCents: goal,
    percent: goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0,
    funded: raised >= goal,
    backers: new Set(rows.map((r) => r.user_id)).size,
  };
}

export interface MyStanding {
  cycle: string;
  /** What this person has given this cycle. */
  givenCents: number;
  points: number;
  pointCap: number;
  /** True once they've hit the cap — worth saying so rather than silently
   *  swallowing further votes they think they're earning. */
  atCap: boolean;
}

export async function myStanding(db: SupabaseClient, userId: string): Promise<MyStanding> {
  const cycle = currentCycle();
  // Same two-attempt shape as fundProgress, and for the same reason. Votes
  // must not be earned by a foreign-currency contribution counted as if it
  // were dollars — a €25 payment is more money than $25 and would otherwise
  // buy the same 25 votes.
  let paid: Array<{ gross_cents: number }>;
  const scoped = await db
    .from("fund_contributions")
    .select("gross_cents")
    .eq("user_id", userId)
    .eq("cycle", cycle)
    .eq("currency", fundCurrency());

  if (scoped.error) {
    const all = await db
      .from("fund_contributions")
      .select("gross_cents")
      .eq("user_id", userId)
      .eq("cycle", cycle);
    if (all.error) throw new Error(`fund ledger unreadable: ${all.error.message}`);
    paid = (all.data ?? []) as Array<{ gross_cents: number }>;
  } else {
    paid = (scoped.data ?? []) as Array<{ gross_cents: number }>;
  }

  const given = paid.reduce((sum, r) => sum + (Number(r.gross_cents) || 0), 0);
  const points = pointsFor(given);

  return { cycle, givenCents: given, points, pointCap: pointCap(), atCap: points >= pointCap() };
}
