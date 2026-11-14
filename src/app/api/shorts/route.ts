import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { CHANNELS, SCENE, featureOfWeek } from "@/lib/shorts";
import { programmeShowing } from "@/lib/shorts-admin";
import { siteUrl } from "@/lib/site";

// Deep Cut Theatre's channel guide. Members only, like every other room.
//
// The bill itself lives in the `shorts` table (migration 0008) and is edited
// from the Projection Booth's Theatre tab, not bundled into the app — a
// curated shelf that needed Apple's review to rotate would rotate about four
// times a year.

export const dynamic = "force-dynamic";

/** Root-relative paths are fine in a browser and useless in the app. */
function absolutise(scene: typeof SCENE) {
  const at = (p: string) => (p.startsWith("/") ? `${siteUrl()}${p}` : p);
  return {
    ...scene,
    image: scene.image ? at(scene.image) : scene.image,
    dash: { ...scene.dash, image: at(scene.dash.image) },
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const films = await programmeShowing().catch(() => []);

  return NextResponse.json({
    channels: CHANNELS,
    films,
    // Absolutised here: the web can use a root-relative path but the native
    // app has no origin to resolve it against. Both pictures need it — the
    // room and the console are two separate files.
    scene: absolutise(SCENE),
    // Stamped so the app can show what it is without hardcoding a date, and so
    // a stale cache is visible rather than silent.
    programme: `This month's bill — ${films.length} film${films.length === 1 ? "" : "s"}`,
    // One film pulled out of the bill each week, so there's a reason to come
    // back before the month turns over. Derived, not scheduled — see
    // featureOfWeek in lib/shorts.
    featureId: featureOfWeek(films)?.id ?? null,
  });
}
