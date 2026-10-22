import type { SupabaseClient } from "@supabase/supabase-js";
import { currentCycle } from "./fund";
import { toAttachments, type Attachment } from "./attachments";

// The open submissions pile, and the gate between it and the ballot.
//
// The editorial model this file exists to enforce: anyone can submit, we read
// everything, and a fixed number reach the ballot. Members choose between films
// that have already been read — never out of the raw pile. That is the whole
// difference between this and crowd-sourced development, which has been tried
// at scale and closed.

/**
 * How many pitches make the slate.
 *
 * Nine because a ballot has to be readable in one sitting. Every pitch carries
 * a deck, a reel and a synopsis; thirty of those is not a decision, it's a
 * chore, and a chore gets abandoned or skimmed — and a skimmed ballot is won by
 * whatever is easiest to summarise. Capping the slate is what keeps the vote a
 * genuine comparison rather than a scroll.
 */
export function showcaseSlots(): number {
  const v = Number(process.env.FUND_SHOWCASE_SLOTS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 9;
}

export type SubmissionStatus = "new" | "read" | "showcased" | "passed";

export interface Submission {
  id: string;
  cycle: string;
  director: string;
  email: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string | null;
  comps: string | null;
  budgetCents: number | null;
  deckUrl: string | null;
  priorWorkUrl: string | null;
  oneSheetUrl: string | null;
  status: SubmissionStatus;
  /** When the director was told the outcome. Null on a decided submission
   *  means a reply is owed — see lib/submission-replies.ts. */
  repliedAt: string | null;
  /** Private storage paths — signed at read time, never public. */
  attachments: Attachment[];
  notes: string | null;
  pitchId: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;

function toSubmission(r: Row): Submission {
  return {
    id: String(r.id),
    cycle: String(r.cycle),
    director: String(r.director),
    email: String(r.email),
    title: String(r.title),
    logline: String(r.logline),
    synopsis: String(r.synopsis),
    genre: (r.genre as string | null) ?? null,
    comps: (r.comps as string | null) ?? null,
    attachments: toAttachments(r.attachments),
    budgetCents: r.budget_cents == null ? null : Number(r.budget_cents),
    deckUrl: (r.deck_url as string | null) ?? null,
    priorWorkUrl: (r.prior_work_url as string | null) ?? null,
    oneSheetUrl: (r.one_sheet_url as string | null) ?? null,
    status: r.status as SubmissionStatus,
    repliedAt: (r.replied_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    pitchId: (r.pitch_id as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export interface SubmissionInput {
  director: string;
  email: string;
  title: string;
  logline: string;
  synopsis: string;
  genre?: string | null;
  comps?: string | null;
  budgetCents?: number | null;
  deckUrl?: string | null;
  priorWorkUrl?: string | null;
  oneSheetUrl?: string | null;
  userId?: string | null;
  /** Which version of the submission terms was on screen when they agreed. */
  termsVersion?: string | null;
  /** Already uploaded to the private bucket by the time we get here. */
  attachments?: Attachment[] | null;
}

export type SubmitResult =
  | { ok: true; updated: boolean }
  | { ok: false; reason: "failed" };

/**
 * Take a pitch in.
 *
 * A resubmit UPDATES rather than stacking a second copy — the unique index on
 * (cycle, email, title) makes that the database's rule rather than a hope. A
 * director who spots a typo in their logline an hour later should be able to
 * fix it, and the alternative is a pile with four versions of the same film in
 * it and no way to tell which one is current.
 *
 * A submission already showcased is NOT reopened for edit: it is on the ballot
 * and members are voting on what they read. Changing it underneath them would
 * be changing the thing being voted on.
 */
export async function submitPitch(
  db: SupabaseClient,
  input: SubmissionInput,
): Promise<SubmitResult> {
  const cycle = currentCycle();
  const email = input.email.trim().toLowerCase();

  const row = {
    cycle,
    director: input.director.trim(),
    email,
    user_id: input.userId ?? null,
    title: input.title.trim(),
    logline: input.logline.trim(),
    synopsis: input.synopsis.trim(),
    genre: input.genre?.trim() || null,
    comps: input.comps?.trim() || null,
    budget_cents: input.budgetCents ?? null,
    deck_url: input.deckUrl || null,
    prior_work_url: input.priorWorkUrl || null,
    one_sheet_url: input.oneSheetUrl || null,
    updated_at: new Date().toISOString(),
  };

  // Everything added after the table shipped, kept apart from `row`.
  //
  // The write has to survive a deploy that reaches production before its
  // migration does — 0020 added the consent columns and 0021 added attachments,
  // and a missing column on either would otherwise take the whole submissions
  // door down. Losing a version stamp for a few minutes is a far smaller
  // failure than a director hitting an error on a pitch they spent a week on,
  // especially since the terms box is enforced at the API either way.
  const later: Record<string, unknown> = {
    // Replaces rather than appends: a resubmit is the director correcting
    // themselves, and silently keeping the first draft of a script they meant
    // to replace is the wrong kind of helpful.
    attachments: input.attachments ?? [],
  };
  if (input.termsVersion != null) {
    later.terms_version = input.termsVersion;
    later.terms_agreed_at = new Date().toISOString();
  }

  /** True when Postgres/PostgREST is telling us one of those isn't there yet. */
  const missingColumn = (msg: string) =>
    /terms_version|terms_agreed_at|attachments/.test(msg) &&
    /(column|schema cache|does not exist|could not find)/i.test(msg);

  const { data: existing } = await db
    .from("film_submissions")
    .select("id, status")
    .eq("cycle", cycle)
    .ilike("email", email)
    .ilike("title", row.title)
    .maybeSingle();

  if (existing?.id) {
    if (existing.status === "showcased") {
      // Already on the ballot. Report success — from the director's side the
      // pitch is in, which is the true answer — but don't rewrite it.
      return { ok: true, updated: true };
    }
    let { error } = await db
      .from("film_submissions")
      .update({ ...row, ...later })
      .eq("id", existing.id);
    if (error && missingColumn(error.message)) {
      console.warn("newer submission columns missing — run 0020 and 0021");
      ({ error } = await db.from("film_submissions").update(row).eq("id", existing.id));
    }
    if (error) {
      console.error("submission update failed", error.message);
      return { ok: false, reason: "failed" };
    }
    return { ok: true, updated: true };
  }

  let { error } = await db.from("film_submissions").insert({ ...row, ...later });
  if (error && missingColumn(error.message)) {
    console.warn("newer submission columns missing — run 0020 and 0021");
    ({ error } = await db.from("film_submissions").insert(row));
  }
  if (error) {
    console.error("submission insert failed", error.message);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, updated: false };
}

export async function listSubmissions(
  db: SupabaseClient,
  cycle: string,
): Promise<Submission[]> {
  const { data, error } = await db
    .from("film_submissions")
    .select("*")
    .eq("cycle", cycle)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`submissions unreadable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toSubmission);
}

export interface PileCounts {
  new: number;
  read: number;
  showcased: number;
  passed: number;
  total: number;
  slots: number;
  slotsLeft: number;
}

export function countPile(subs: Submission[]): PileCounts {
  const c = { new: 0, read: 0, showcased: 0, passed: 0 };
  for (const s of subs) c[s.status] += 1;
  const slots = showcaseSlots();
  return {
    ...c,
    total: subs.length,
    slots,
    slotsLeft: Math.max(0, slots - c.showcased),
  };
}

export type PromoteResult =
  | { ok: true; pitchId: string }
  | { ok: false; reason: "no_round" | "slate_full" | "already_showcased" | "failed"; note?: string };

/**
 * Move a submission onto the ballot.
 *
 * The slot cap is enforced HERE rather than in the UI, because "we showcase
 * nine" is a promise made on a public page and a promise a disabled button
 * doesn't keep. Counting showcased rows at the moment of promotion is what
 * makes it true.
 */
export async function promoteToSlate(
  db: SupabaseClient,
  submissionId: string,
): Promise<PromoteResult> {
  const cycle = currentCycle();

  const { data: subRow, error: subErr } = await db
    .from("film_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr || !subRow) return { ok: false, reason: "failed", note: subErr?.message };

  const sub = toSubmission(subRow as Row);
  if (sub.status === "showcased" && sub.pitchId) {
    return { ok: false, reason: "already_showcased" };
  }

  const { data: round } = await db.from("film_rounds").select("id").eq("id", cycle).maybeSingle();
  if (!round) return { ok: false, reason: "no_round" };

  const { count, error: countErr } = await db
    .from("film_submissions")
    .select("id", { count: "exact", head: false })
    .eq("cycle", cycle)
    .eq("status", "showcased");
  if (countErr) return { ok: false, reason: "failed", note: countErr.message };
  if ((count ?? 0) >= showcaseSlots()) return { ok: false, reason: "slate_full" };

  const { data: pitch, error: pitchErr } = await db
    .from("film_pitches")
    .insert({
      round_id: cycle,
      title: sub.title,
      director: sub.director,
      logline: sub.logline,
      synopsis: sub.synopsis,
      genre: sub.genre,
      comps: sub.comps,
      one_sheet_url: sub.oneSheetUrl,
      deck_url: sub.deckUrl,
      prior_work_url: sub.priorWorkUrl,
      position: (count ?? 0) + 1,
    })
    .select("id")
    .maybeSingle();

  if (pitchErr || !pitch?.id) {
    return { ok: false, reason: "failed", note: pitchErr?.message };
  }

  const { error: markErr } = await db
    .from("film_submissions")
    .update({ status: "showcased", pitch_id: pitch.id, updated_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (markErr) {
    // The pitch is on the ballot but the submission doesn't know it, which
    // would let the same film be promoted twice. Roll the pitch back rather
    // than leave the two out of step.
    await db.from("film_pitches").delete().eq("id", pitch.id);
    return { ok: false, reason: "failed", note: markErr.message };
  }

  return { ok: true, pitchId: String(pitch.id) };
}
