import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RecStatusInput } from "@/lib/schemas";
import { track } from "@/lib/analytics";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = RecStatusInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("recommendations")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventByStatus: Record<string, string> = {
    watchlisted: "rec_watchlisted",
    dismissed: "rec_dismissed",
    seen: "rec_seen",
  };
  if (eventByStatus[parsed.data.status]) {
    await track(user.id, eventByStatus[parsed.data.status], { recId: id });
  }

  return NextResponse.json({ ok: true });
}
