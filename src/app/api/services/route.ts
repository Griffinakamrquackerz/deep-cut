import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SERVICES } from "@/lib/services";

const Input = z.object({ services: z.array(z.enum(SERVICES)) });

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = supabaseAdmin();
  await db.from("user_services").delete().eq("user_id", user.id);
  if (parsed.data.services.length > 0) {
    await db
      .from("user_services")
      .insert(parsed.data.services.map((service) => ({ user_id: user.id, service })));
  }
  return NextResponse.json({ ok: true });
}
