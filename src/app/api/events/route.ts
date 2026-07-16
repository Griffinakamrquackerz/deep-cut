import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { EventInput } from "@/lib/schemas";
import { track } from "@/lib/analytics";

// Client-side analytics beacon (e.g. reason_tapped, taste_card_shared).
export async function POST(request: Request) {
  const user = await currentUser();
  const parsed = EventInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await track(user?.id ?? null, parsed.data.name, parsed.data.props);
  return NextResponse.json({ ok: true });
}
