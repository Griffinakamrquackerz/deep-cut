import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { deleteShort, updateShort } from "@/lib/shorts-admin";
import { CHANNEL_KEYS } from "@/lib/shorts";

// One title: edit its fields, archive it off the bill, restore it, reorder it,
// or delete the record outright. Archive is the normal end of a run — the
// title stays on file and can come back. Delete is for a mistaken entry.

const Edit = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  director: z.string().trim().min(1).max(120).optional(),
  year: z
    .number()
    .int()
    .min(1888)
    .max(new Date().getFullYear() + 1)
    .optional(),
  runtimeSec: z
    .number()
    .int()
    .min(1)
    .max(3 * 60 * 60)
    .optional(),
  source: z.enum(["vimeo", "youtube"]).optional(),
  videoId: z.string().trim().min(1).max(60).optional(),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1).optional(),
  pedigree: z.string().trim().max(400).optional(),
  synopsis: z.string().trim().max(800).optional(),
  thumb: z.string().trim().max(500).optional(),
  status: z.enum(["showing", "archived"]).optional(),
  position: z.number().int().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = Edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "empty_edit" }, { status: 400 });
  }

  const updated = await updateShort(id, parsed.data).catch((e: unknown) => e as Error);
  if (updated instanceof Error) {
    return NextResponse.json({ error: "update_failed", note: updated.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, short: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const err = await deleteShort(id)
    .then(() => null)
    .catch((e: unknown) => e as Error);
  if (err) return NextResponse.json({ error: "delete_failed", note: err.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
