import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDelivery, saveDelivery, isPostable } from "@/lib/delivery";
import { myStanding } from "@/lib/fund";
import { needsAddress } from "@/lib/perks";

// A member's delivery address, read and written by that member only.
//
// Service role behind an auth check rather than RLS, matching every other
// account route here. The table has RLS on with no policies, so this route is
// the only way in — which is the posture a home address deserves.

export const dynamic = "force-dynamic";

const line = z.string().trim().max(200).nullable().optional();

const Input = z.object({
  recipient: line,
  line1: line,
  line2: line,
  city: line,
  region: line,
  postcode: z.string().trim().max(40).nullable().optional(),
  countryCode: z.string().trim().max(2).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [details, standing] = await Promise.all([
    getDelivery(db, user.id),
    // What they've given decides whether we ask at all — see needsAddress.
    // Per cycle, deliberately: perks belong to a picture, so a member who
    // backed film-01 isn't owed film-02's pin.
    myStanding(db, user.id).catch(() => null),
  ]);

  const mineCents = standing?.givenCents ?? 0;

  return NextResponse.json({
    details,
    postable: isPostable(details),
    /** True once they're owed something that physically ships. */
    owed: needsAddress(mineCents),
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const res = await saveDelivery(supabaseAdmin(), user.id, parsed.data);
  if (!res.ok) {
    return NextResponse.json(
      {
        error: res.reason,
        note:
          res.reason === "country_code"
            ? "Country needs to be a two-letter code, like US or GB."
            : "Run supabase/migrations/0021_delivery_and_attachments.sql.",
      },
      { status: res.reason === "country_code" ? 400 : 500 },
    );
  }

  const details = await getDelivery(supabaseAdmin(), user.id);
  return NextResponse.json({ ok: true, details, postable: isPostable(details) });
}
