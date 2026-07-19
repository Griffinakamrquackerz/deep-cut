import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reactToTake } from "@/lib/takes";

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

  const ok = await reactToTake(supabaseAdmin(), user.id, parsed.data.takeId, parsed.data.kind);
  if (!ok) return NextResponse.json({ error: "react_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
