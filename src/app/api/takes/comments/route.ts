import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createComment, deleteComment, listComments, TAKE_MAX } from "@/lib/takes";
import { checkAndIncrement } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin";
import { track } from "@/lib/analytics";

/** The banter under a take — public read, same as the wall. */
export async function GET(req: Request) {
  const takeId = new URL(req.url).searchParams.get("takeId");
  if (!takeId) return NextResponse.json({ error: "missing_take" }, { status: 400 });
  const user = await currentUser();
  const comments = await listComments(supabaseAdmin(), takeId, user?.id ?? null);
  return NextResponse.json({ comments });
}

const Input = z.object({
  takeId: z.string().uuid(),
  body: z.string().trim().min(1).max(TAKE_MAX),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (!isAdminEmail(user.email)) {
    const allowed = await checkAndIncrement(user.id, "take_comment", 60);
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const created = await createComment(supabaseAdmin(), user.id, parsed.data.takeId, parsed.data.body);
  if (!created) return NextResponse.json({ error: "take_gone_or_failed" }, { status: 404 });

  await track(user.id, "take_comment_posted", { takeId: parsed.data.takeId });
  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const ok = await deleteComment(supabaseAdmin(), id, user.id, isAdminEmail(user.email));
  if (!ok) return NextResponse.json({ error: "not_found_or_not_yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
