import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reactToTake } from "@/lib/takes";
import { recordTasteSignal } from "@/lib/signals";

const Input = z.object({
  takeId: z.string().uuid(),
  kind: z.enum(["fire", "fight"]).nullable(), // null clears your reaction
});

/** 🔥 agree or 🥊 fight me — one stance per member per take, latest wins. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = supabaseAdmin();
  const ok = await reactToTake(db, user.id, parsed.data.takeId, parsed.data.kind);
  if (!ok) return NextResponse.json({ error: "react_failed" }, { status: 500 });

  // Agreeing with a take is a soft spark for that film's place in your taste.
  if (parsed.data.kind === "fire") {
    const { data: take } = await db
      .from("events")
      .select("props")
      .eq("id", parsed.data.takeId)
      .eq("name", "hot_take")
      .maybeSingle();
    const mid = Number((take?.props as Record<string, unknown> | null)?.movie_id);
    if (Number.isFinite(mid) && mid > 0) {
      await recordTasteSignal(db, user.id, mid, "take_fire");
    }
  }
  return NextResponse.json({ ok: true });
}
