import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentCycle } from "@/lib/fund";
import { countPile, listSubmissions, promoteToSlate } from "@/lib/submissions";
import { signAttachments } from "@/lib/attachments";
import { countOwed, sendSubmissionReply } from "@/lib/submission-replies";

// The reading pile, from the admin side. List it, mark things read or passed,
// leave private notes, and promote the ones worth making onto the ballot.

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const cycle = currentCycle();
  try {
    const db = supabaseAdmin();
    const submissions = await listSubmissions(db, cycle);
    // Signed at read time, an hour at a time. The bucket is private, so this is
    // the only way the console can open a script — and a link that expires is
    // the difference between "the reader can see it" and "an unreleased
    // screenplay is on a URL forever".
    const withFiles = await Promise.all(
      submissions.map(async (sub) => ({
        ...sub,
        attachments: await signAttachments(db, sub.attachments),
      })),
    );
    return NextResponse.json({
      cycle,
      submissions: withFiles,
      counts: {
        ...countPile(submissions),
        // Decided but not yet told. Surfaced as a number because an obligation
        // you can see the size of is one that actually gets cleared;
        // "remember to email people" is not a mechanism.
        owed: countOwed(submissions),
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "submissions_table_missing",
        note: "Run supabase/migrations/0019_submissions.sql.",
        detail: String(e).slice(0, 200),
      },
      { status: 500 },
    );
  }
}

const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    // Deliberately excludes "showcased": that is what promotion is for, and
    // setting it by hand would put a film on the ballot with no pitch row.
    status: z.enum(["new", "read", "passed"]),
  }),
  z.object({ action: z.literal("notes"), id: z.string().uuid(), notes: z.string().max(4000) }),
  z.object({ action: z.literal("promote"), id: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const body = parsed.data;
  const db = supabaseAdmin();

  if (body.action === "promote") {
    const res = await promoteToSlate(db, body.id);
    if (!res.ok) {
      const status = res.reason === "failed" ? 500 : 409;
      return NextResponse.json({ error: res.reason, note: res.note }, { status });
    }
    return NextResponse.json({ ok: true, pitchId: res.pitchId });
  }

  const patch =
    body.action === "status"
      ? { status: body.status, updated_at: new Date().toISOString() }
      : { notes: body.notes, updated_at: new Date().toISOString() };

  const { error } = await db.from("film_submissions").update(patch).eq("id", body.id);
  if (error) {
    console.error("submission update failed", error.message);
    return NextResponse.json({ error: "write_failed", note: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
