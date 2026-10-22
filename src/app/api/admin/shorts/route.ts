import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createShort, listAllShorts } from "@/lib/shorts-admin";
import { CHANNEL_KEYS } from "@/lib/shorts";

// The Projection Booth's Theatre tab — the whole inventory (showing and
// archived), and manual creation. GET lists; POST adds one, whether the admin
// typed it from scratch or the form was prefilled from a link lookup or a
// catalogue search first.

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const shorts = await listAllShorts().catch(() => null);
  if (shorts === null) {
    // The likeliest cause, by far: migration 0008 hasn't been run yet.
    return NextResponse.json(
      { error: "shorts_table_missing", note: "Run supabase/migrations/0008_shorts_programme.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ shorts });
}

const Input = z.object({
  title: z.string().trim().min(1).max(200),
  director: z.string().trim().min(1).max(120),
  year: z.number().int().min(1888).max(new Date().getFullYear() + 1),
  runtimeSec: z.number().int().min(1).max(3 * 60 * 60),
  source: z.enum(["vimeo", "youtube"]),
  videoId: z.string().trim().min(1).max(60),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1),
  pedigree: z.string().trim().max(400),
  synopsis: z.string().trim().max(800),
  thumb: z.string().trim().max(500),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }

  const created = await createShort({ ...parsed.data, addedBy: admin.email ?? "" }).catch(
    (e: unknown) => e as Error,
  );
  if (created instanceof Error) {
    return NextResponse.json({ error: "create_failed", note: created.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, short: created });
}
