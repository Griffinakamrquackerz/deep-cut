import type { SupabaseClient } from "@supabase/supabase-js";
import { currentCycle, myStanding } from "./fund";

// Greenlighting: spending the votes you earned on the pitch you want made.
//
// Votes are a BUDGET, not a choice. You hold however many you earned and can
// put them all behind one pitch or split them across several. That difference
// is most of the fun — a poll asks which film is best, a budget asks how
// strongly you feel and what your second favourite is.
//
// The rule that has to hold no matter what a client sends: nobody spends more
// votes than they earned. That total is derived from the fund ledger on the
// server every time a ballot is saved, because a vote budget is exactly the
// kind of thing a browser would happily lie about.

export interface Pitch {
  id: string;
  title: string;
  director: string;
  logline: string;
  synopsis: string;
  genre: string | null;
  comps: string | null;
  oneSheetUrl: string | null;
  deckUrl: string | null;
  priorWorkUrl: string | null;
  directorPhotoUrl: string | null;
}

export type RoundStatus = "collecting" | "voting" | "greenlit" | "closed";

export interface Round {
  id: string;
  title: string;
  status: RoundStatus;
  opensAt: string | null;
  closesAt: string | null;
  winnerPitchId: string | null;
}

type Row = Record<string, unknown>;

function toPitch(r: Row): Pitch {
  return {
    id: String(r.id),
    title: String(r.title),
    director: String(r.director),
    logline: String(r.logline),
    synopsis: String(r.synopsis),
    genre: (r.genre as string | null) ?? null,
    comps: (r.comps as string | null) ?? null,
    oneSheetUrl: (r.one_sheet_url as string | null) ?? null,
    deckUrl: (r.deck_url as string | null) ?? null,
    priorWorkUrl: (r.prior_work_url as string | null) ?? null,
    directorPhotoUrl: (r.director_photo_url as string | null) ?? null,
  };
}

/** The round matching the fund's current cycle, or null if none exists yet. */
export async function currentRound(db: SupabaseClient): Promise<Round | null> {
  const { data, error } = await db
    .from("film_rounds")
    .select("*")
    .eq("id", currentCycle())
    .maybeSingle();

  if (error) throw new Error(`rounds unreadable: ${error.message}`);
  if (!data) return null;

  const r = data as Row;
  return {
    id: String(r.id),
    title: String(r.title),
    status: r.status as RoundStatus,
    opensAt: (r.opens_at as string | null) ?? null,
    closesAt: (r.closes_at as string | null) ?? null,
    winnerPitchId: (r.winner_pitch_id as string | null) ?? null,
  };
}

export async function pitchesFor(db: SupabaseClient, roundId: string): Promise<Pitch[]> {
  const { data, error } = await db
    .from("film_pitches")
    .select("*")
    .eq("round_id", roundId)
    .order("position", { ascending: true });

  if (error) throw new Error(`pitches unreadable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toPitch);
}

export interface Tally {
  pitchId: string;
  votes: number;
  backers: number;
}

/** Where the round stands. Totals only — never who voted for what. */
export async function tallies(db: SupabaseClient, roundId: string): Promise<Tally[]> {
  const { data, error } = await db
    .from("film_votes")
    .select("pitch_id, votes, user_id")
    .eq("round_id", roundId);

  if (error) throw new Error(`votes unreadable: ${error.message}`);

  const byPitch = new Map<string, { votes: number; voters: Set<string> }>();
  for (const r of (data ?? []) as Array<{ pitch_id: string; votes: number; user_id: string }>) {
    const key = String(r.pitch_id);
    const entry = byPitch.get(key) ?? { votes: 0, voters: new Set<string>() };
    entry.votes += Number(r.votes) || 0;
    entry.voters.add(String(r.user_id));
    byPitch.set(key, entry);
  }

  return [...byPitch.entries()]
    .map(([pitchId, v]) => ({ pitchId, votes: v.votes, backers: v.voters.size }))
    .sort((a, b) => b.votes - a.votes);
}

/** What one person has already spent, pitch by pitch. */
export async function myBallot(
  db: SupabaseClient,
  userId: string,
  roundId: string,
): Promise<Record<string, number>> {
  const { data, error } = await db
    .from("film_votes")
    .select("pitch_id, votes")
    .eq("user_id", userId)
    .eq("round_id", roundId);

  if (error) throw new Error(`ballot unreadable: ${error.message}`);

  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ pitch_id: string; votes: number }>) {
    out[String(r.pitch_id)] = Number(r.votes) || 0;
  }
  return out;
}

export type CastResult =
  | { ok: true; spent: number; budget: number }
  | { ok: false; reason: "no_round" | "not_voting" | "over_budget" | "unknown_pitch" | "failed"; budget?: number };

/**
 * Replace somebody's whole ballot for a round.
 *
 * Whole-ballot rather than one-vote-at-a-time on purpose: the client sends the
 * allocation it wants to end up with, the server checks it against the budget
 * once, and the result is idempotent. Incremental "+1 vote" calls would need
 * their own concurrency story and could half-apply.
 */
export async function castBallot(
  db: SupabaseClient,
  userId: string,
  allocation: Record<string, number>,
): Promise<CastResult> {
  const round = await currentRound(db).catch(() => null);
  if (!round) return { ok: false, reason: "no_round" };
  if (round.status !== "voting") return { ok: false, reason: "not_voting" };

  // The budget comes from the ledger, never from the request.
  const standing = await myStanding(db, userId).catch(() => null);
  const budget = standing?.points ?? 0;

  const pitches = await pitchesFor(db, round.id).catch(() => []);
  const valid = new Set(pitches.map((p) => p.id));

  const clean: Array<{ pitchId: string; votes: number }> = [];
  let spent = 0;
  for (const [pitchId, raw] of Object.entries(allocation)) {
    const votes = Math.floor(Number(raw));
    if (!Number.isFinite(votes) || votes <= 0) continue; // zero means "remove"
    if (!valid.has(pitchId)) return { ok: false, reason: "unknown_pitch" };
    clean.push({ pitchId, votes });
    spent += votes;
  }

  if (spent > budget) return { ok: false, reason: "over_budget", budget };

  // Clear then write: the incoming allocation is the complete new ballot, so
  // anything not in it has been withdrawn. Deleting first is what makes a
  // pitch you removed actually disappear rather than lingering at its old count.
  const del = await db.from("film_votes").delete().eq("user_id", userId).eq("round_id", round.id);
  if (del.error) {
    console.error("castBallot clear failed", del.error.message);
    return { ok: false, reason: "failed" };
  }

  if (clean.length) {
    const { error } = await db.from("film_votes").insert(
      clean.map((c) => ({
        user_id: userId,
        pitch_id: c.pitchId,
        round_id: round.id,
        votes: c.votes,
      })),
    );
    if (error) {
      console.error("castBallot write failed", error.message);
      return { ok: false, reason: "failed" };
    }
  }

  return { ok: true, spent, budget };
}

/**
 * Deterministic per-viewer shuffle of the ballot.
 *
 * Whatever is printed first on a ballot wins votes it didn't earn — that's a
 * measured effect, not a theory. Every viewer gets a different order, and the
 * SAME different order every time they look, so the page doesn't reshuffle
 * under them mid-decision.
 */
export function shuffleForViewer<T extends { id: string }>(items: T[], seed: string): T[] {
  const score = (id: string) => {
    // A small stable string hash. Not cryptographic — it only has to be
    // arbitrary and repeatable.
    let h = 2166136261;
    for (const ch of `${seed}:${id}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...items].sort((a, b) => score(a.id) - score(b.id));
}
