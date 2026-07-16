import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { logWatch } from "@/lib/engine";
import { WatchLogInput } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = WatchLogInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await logWatch(user.id, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
