import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Input = z.object({ userId: z.string().uuid() });

/**
 * Admin-only account deletion. Same cascade as self-deletion (auth user →
 * public.users → all owned rows via ON DELETE CASCADE); the avatar file is
 * removed explicitly since storage doesn't cascade. You can't nuke yourself
 * here — use Settings → Danger Zone for that, so the panel can't self-destruct.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { userId } = parsed.data;
  if (userId === admin.id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const db = supabaseAdmin();
  await db.storage
    .from("avatars")
    .remove([`${userId}.jpg`])
    .catch(() => null);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
