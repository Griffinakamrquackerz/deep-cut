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

/** Each whole dollar contributed in the current cycle earns one vote. */
export function pointsFor(grossCents: number): number {
  return Math.floor(Math.max(0, grossCents) / 100);
}

/** A one-time points purchase over $5 grants 30 days of premium. */
export function premiumMonthsFor(grossCents: number): number {
  return grossCents > 500 ? 1 : 0;
}

/** The Fund's cut of a payment. Rounded down — never over-promise the pot. */
export function fundCutCents(grossCents: number): number {
  return Math.floor((Math.max(0, grossCents) * sharePct()) / 100);
}

export type ContributionKind = "subscription" | "lifetime" | "donation" | "adjustment" | "points";

/** Record a paid donation and its premium entitlement atomically. */
export async function recordDonation(
  db: SupabaseClient,
  input: { userId: string; grossCents: number; stripeRef: string; currency: string | undefined },
): Promise<void> {
  if (input.currency !== "usd" || fundCurrency() !== "usd") {
    throw new Error("donation currency does not match the USD fund");
  }
  const { data, error } = await db.rpc("record_fund_donation", {
    p_user_id: input.userId,
    p_gross_cents: input.grossCents,
    p_fund_cents: fundCutCents(input.grossCents),
    p_cycle: currentCycle(),
    p_stripe_ref: input.stripeRef,
    p_currency: input.currency,
  });
  if (error || data !== true) throw new Error(`donation recording failed: ${error?.message ?? "unknown error"}`);
}

/** Record a paid points purchase and its premium entitlement atomically. */
export async function recordPointsPurchase(
  db: SupabaseClient,
  input: { userId: string; grossCents: number; stripeRef: string; currency: string | undefined },
): Promise<void> {
  if (input.currency !== "usd" || fundCurrency() !== "usd") {
    throw new Error("points purchase currency does not match the USD fund");
  }
  const { data, error } = await db.rpc("record_fund_points", {
    p_user_id: input.userId,
    p_gross_cents: input.grossCents,
    p_fund_cents: fundCutCents(input.grossCents),
    p_cycle: currentCycle(),
    p_stripe_ref: input.stripeRef,
    p_currency: input.currency,
  });
  if (error || data !== true) throw new Error(`points recording failed: ${error?.message ?? "unknown error"}`);
}

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

  return { cycle, givenCents: given, points };
}
