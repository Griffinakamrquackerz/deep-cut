import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { getBlockedIds } from "@/lib/safety";
import { checkAndIncrement, refund } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin";
import { track } from "@/lib/analytics";

// Send a film to someone inside Deep Cut. It lands in their inbox rather than
// anywhere public — this is handing somebody a tape, not posting about it.

const Input = z.object({
  toUserId: z.string().uuid(),
  movieId: z.number().int().positive(),
  note: z.string().trim().max(140).optional(),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (parsed.data.toUserId === user.id) {
    return NextResponse.json({ error: "cannot_send_to_self" }, { status: 400 });
  }

  // A send is a message to a specific person, which is exactly the shape of
  // thing worth rate-limiting: without a cap this endpoint is a way to fill
  // somebody's inbox.
  if (!isAdminEmail(user.email)) {
    const allowed = await checkAndIncrement(user.id, "film_send", 40);
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Either direction of a block stops it. Checking only who I blocked would
  // leave the person I blocked a usable channel straight into my inbox, which
  // is the one thing blocking is for.
  const [iBlocked, theyBlocked] = await Promise.all([
    getBlockedIds(user.id).catch(() => new Set<string>()),
    getBlockedIds(parsed.data.toUserId).catch(() => new Set<string>()),
  ]);
  if (iBlocked.has(parsed.data.toUserId) || theyBlocked.has(user.id)) {
    // Deliberately the same answer either way: "unavailable" doesn't tell the
    // sender which of the two blocks exists, or that one exists at all.
    return NextResponse.json({ error: "unavailable" }, { status: 403 });
  }

  const db = supabaseAdmin();

  // The push has to name the film and the sender or it's "you have a
  // notification", which tells nobody anything. Both are best-effort: a
  // missing name degrades the wording, it doesn't stop the send.
  const [sender, film] = await Promise.all([
    db.from("users").select("handle, display_name").eq("id", user.id).maybeSingle(),
    db.from("movies").select("title").eq("id", parsed.data.movieId).maybeSingle(),
  ]);
  const from =
    (sender.data?.handle ? `@${sender.data.handle}` : sender.data?.display_name) ?? "Someone";
  const title = film.data?.title ?? "a film";

  const delivered = await notify(db, {
    userId: parsed.data.toUserId,
    actorId: user.id,
    kind: "film_sent",
    props: { movieId: parsed.data.movieId, note: parsed.data.note ?? null },
    push: {
      title: `🎞 ${from} sent you a film`,
      body: parsed.data.note ? `${title} — “${parsed.data.note}”` : title,
      path: `/m/${parsed.data.movieId}`,
      // Per film and per sender: two people sending you two films should be
      // two notifications, not one replacing the other.
      tag: `film-${user.id}-${parsed.data.movieId}`,
    },
  });

  // Unlike a mention, there is no other action here that already succeeded —
  // the inbox row IS the send. Saying "Sent" when it didn't land is how this
  // goes wrong quietly, so a failed write is a failed send.
  if (!delivered) {
    await refund(user.id, "film_send");
    return NextResponse.json({ error: "not_delivered" }, { status: 500 });
  }

  await track(user.id, "film_sent", { movieId: parsed.data.movieId });
  return NextResponse.json({ ok: true });
}
