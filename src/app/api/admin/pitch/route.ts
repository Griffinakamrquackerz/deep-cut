import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentCycle } from "@/lib/fund";

// Pitches on the slate: add one, edit one, take one off.
//
// The fields mirror what a director already has hosted — a one-sheet, a deck, a
// link to their last film. Links rather than uploads, deliberately: holding
// other people's PDFs is a storage and takedown problem with no upside, and
// every director on earth already has a Drive link.

export const dynamic = "force-dynamic";

/** An https link, or nothing. Empty strings become null rather than "". */
const link = z
  .string()
  .trim()
  .max(600)
  .refine((s) => s === "" || /^https:\/\//i.test(s), "must be an https link")
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional();

const PitchInput = z.object({
  /** Present when editing; absent when adding. */
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  director: z.string().trim().min(1).max(120),
  // One sentence. The schema comment says "if it doesn't fit, the pitch isn't
  // ready" — 300 characters is roughly that, enforced rather than hoped for.
  logline: z.string().trim().min(1).max(300),
  synopsis: z.string().trim().min(1).max(4000),
  genre: z.string().trim().max(80).optional(),
  comps: z.string().trim().max(200).optional(),
  oneSheetUrl: link,
  deckUrl: link,
  priorWorkUrl: link,
  directorPhotoUrl: link,
  position: z.number().int().min(0).max(999).optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = PitchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const p = parsed.data;
  const db = supabaseAdmin();
  const cycle = currentCycle();

  // A pitch can only be added to a round that exists — the foreign key would
  // reject it anyway, but "open the round first" is a far better answer than a
  // constraint violation.
  const { data: round } = await db.from("film_rounds").select("id").eq("id", cycle).maybeSingle();
  if (!round) {
    return NextResponse.json(
      { error: "no_round", note: `No round exists for cycle "${cycle}". Open it first.` },
      { status: 409 },
    );
  }

  const row = {
    round_id: cycle,
    title: p.title,
    director: p.director,
    logline: p.logline,
    synopsis: p.synopsis,
    genre: p.genre || null,
    comps: p.comps || null,
    one_sheet_url: p.oneSheetUrl ?? null,
    deck_url: p.deckUrl ?? null,
    prior_work_url: p.priorWorkUrl ?? null,
    director_photo_url: p.directorPhotoUrl ?? null,
    position: p.position ?? 0,
  };

  const res = p.id
    ? await db.from("film_pitches").update(row).eq("id", p.id).select("id").maybeSingle()
    : await db.from("film_pitches").insert(row).select("id").maybeSingle();

  if (res.error) {
    console.error("pitch write failed", res.error.message);
    return NextResponse.json({ error: "write_failed", note: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: res.data?.id ?? p.id });
}

const DeleteInput = z.object({ id: z.string().uuid() });

/**
 * Take a pitch off the slate.
 *
 * Deleting cascades to film_votes, which means every vote anyone placed on it
 * is released rather than stranded — their budget frees up and they can spend
 * it again. That is the correct behaviour and it is worth stating out loud,
 * because the alternative (votes locked against a pitch that no longer exists)
 * would be invisible and infuriating.
 */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = DeleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { error } = await supabaseAdmin().from("film_pitches").delete().eq("id", parsed.data.id);
  if (error) {
    console.error("pitch delete failed", error.message);
    return NextResponse.json({ error: "delete_failed", note: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
