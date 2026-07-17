import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Client resizes to a small square JPEG before sending, so this stays tiny.
const Input = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(900_000), // ~650KB decoded — plenty for a 384px square
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_image" }, { status: 400 });

  const db = supabaseAdmin();
  // Idempotent — errors (bucket exists) are fine.
  await db.storage.createBucket("avatars", { public: true }).catch(() => null);

  const buf = Buffer.from(parsed.data.dataUrl.split(",")[1], "base64");
  const path = `${user.id}.jpg`;
  const { error: upErr } = await db.storage
    .from("avatars")
    .upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
  // Cache-bust so a new photo shows immediately everywhere.
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  const { error } = await db.from("users").update({ avatar_url: url }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url });
}
