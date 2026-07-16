import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Input = z.object({
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,24}$/i, "3-24 letters, numbers, underscores")
    .nullish(),
  displayName: z.string().min(1).max(60).nullish(),
});

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (parsed.data.handle) updates.handle = parsed.data.handle.toLowerCase();
  if (parsed.data.displayName) updates.display_name = parsed.data.displayName;
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin().from("users").update(updates).eq("id", user.id);
  if (error) {
    const status = error.code === "23505" ? 409 : 500; // handle taken
    return NextResponse.json({ error: status === 409 ? "handle_taken" : error.message }, { status });
  }
  return NextResponse.json({ ok: true });
}
