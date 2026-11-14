import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_REGION,
  REGIONS,
  getUserRegion,
  regionFromRequest,
  servicesForRegion,
  setUserRegion,
} from "@/lib/region";

// Where the member watches from.
//
// This drives which country's streaming catalogue every recommendation is
// computed against, so it is the difference between the core promise of the
// product being true and being confidently wrong.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser().catch(() => null);

  // Signed out: the picker still needs a sensible pre-selection, and the edge's
  // geo header is a free guess. Never written anywhere from here.
  if (!user) {
    const guess = regionFromRequest(request) ?? DEFAULT_REGION;
    return NextResponse.json({
      region: guess,
      regionKnown: false,
      guessed: true,
      regions: REGIONS,
      services: servicesForRegion(guess),
    });
  }

  const { region, regionKnown } = await getUserRegion(supabaseAdmin(), user.id);
  // When nobody has asked yet, prefer the geo guess over a bare US default so
  // the prompt opens on the right answer rather than on America.
  const shown = regionKnown ? region : (regionFromRequest(request) ?? region);

  return NextResponse.json({
    region: shown,
    // False means "we have never asked" — the client uses this to prompt once
    // rather than nagging somebody who has already chosen.
    regionKnown,
    guessed: !regionKnown,
    regions: REGIONS,
    services: servicesForRegion(shown),
  });
}

const Input = z.object({
  // Any ISO 3166-1 alpha-2 code, not just the curated picker list: somebody in
  // a country we haven't got round to listing still deserves the right
  // catalogue, and TMDB will answer for it.
  region: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/),
});

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ok = await setUserRegion(supabaseAdmin(), user.id, parsed.data.region);
  if (!ok) {
    // Almost always migration 0022 not having been run. Name it rather than
    // returning a bare failure — the member's recommendations stay wrong until
    // somebody reads this.
    return NextResponse.json(
      { error: "write_failed", note: "Run supabase/migrations/0022_user_region.sql." },
      { status: 500 },
    );
  }

  const region = parsed.data.region.toUpperCase();
  return NextResponse.json({
    ok: true,
    region,
    regionKnown: true,
    services: servicesForRegion(region),
  });
}
