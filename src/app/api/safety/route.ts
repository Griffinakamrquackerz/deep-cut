import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { fileReport, setBlocked } from "@/lib/safety";

const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block"),
    targetId: z.string().uuid(),
    blocked: z.boolean(),
  }),
  z.object({
    action: z.literal("report"),
    subjectType: z.enum([
      "user",
      "watch_note",
      "playlist",
      "avatar",
      "hot_take",
      "take_comment",
      // Member-published links on a film page. The backend already accepted
      // reports for notes, playlists and takes; this content type was the one
      // with no way to report it and no way to remove it.
      "external_read",
      "other",
    ]),
    subjectId: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }),
]);

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (parsed.data.action === "block") {
    if (parsed.data.targetId === user.id) {
      return NextResponse.json({ error: "cannot_block_self" }, { status: 400 });
    }
    const ok = await setBlocked(user.id, parsed.data.targetId, parsed.data.blocked);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "block_failed" }, { status: 500 });
  }

  const ok = await fileReport(user.id, {
    subjectType: parsed.data.subjectType,
    subjectId: parsed.data.subjectId,
    reason: parsed.data.reason,
  });
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "report_failed" }, { status: 500 });
}
