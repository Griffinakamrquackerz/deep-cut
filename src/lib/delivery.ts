import type { SupabaseClient } from "@supabase/supabase-js";

// Where a physical perk actually goes.
//
// Four tiers put an object in the post and until now there was nowhere to
// record an address, which made every one of them a promise the house had no
// mechanism to keep. This is the mechanism, and it is deliberately small: one
// row per member, every field optional, no validation beyond a country code.
//
// The restraint is the point. An address form that rejects half the planet's
// postcodes is a form people give up on, and a member who gave up is a parcel
// that never ships — which is the exact failure this exists to prevent. Better
// a slightly messy address a human can read than a perfect one nobody entered.

export interface DeliveryDetails {
  recipient: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  countryCode: string | null;
  phone: string | null;
  updatedAt: string | null;
}

export const EMPTY_DELIVERY: DeliveryDetails = {
  recipient: null,
  line1: null,
  line2: null,
  city: null,
  region: null,
  postcode: null,
  countryCode: null,
  phone: null,
  updatedAt: null,
};

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

function toDetails(r: Row): DeliveryDetails {
  return {
    recipient: str(r.recipient),
    line1: str(r.line_1),
    line2: str(r.line_2),
    city: str(r.city),
    region: str(r.region),
    postcode: str(r.postcode),
    countryCode: str(r.country_code),
    phone: str(r.phone),
    updatedAt: str(r.updated_at),
  };
}

/**
 * Enough of an address to actually post something.
 *
 * A recipient, a first line and a country. Everything else varies too much by
 * country to require — plenty of valid addresses have no postcode at all, and
 * a "complete" check that demands one would mark them incomplete forever.
 */
export function isPostable(d: DeliveryDetails): boolean {
  return !!(d.recipient && d.line1 && d.countryCode);
}

export async function getDelivery(
  db: SupabaseClient,
  userId: string,
): Promise<DeliveryDetails> {
  const { data, error } = await db
    .from("delivery_details")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // A missing table reads as "nothing on file" rather than throwing: the
  // settings page should render with an empty form if 0021 hasn't run, not
  // 500 on somebody trying to change their password.
  if (error || !data) return { ...EMPTY_DELIVERY };
  return toDetails(data as Row);
}

export interface DeliveryInput {
  recipient?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  countryCode?: string | null;
  phone?: string | null;
}

export async function saveDelivery(
  db: SupabaseClient,
  userId: string,
  input: DeliveryInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cc = str(input.countryCode)?.toUpperCase() ?? null;
  // The column has a two-letter check constraint; catching it here gives the
  // member a sentence instead of a database error.
  if (cc !== null && !/^[A-Z]{2}$/.test(cc)) {
    return { ok: false, reason: "country_code" };
  }

  const { error } = await db.from("delivery_details").upsert(
    {
      user_id: userId,
      recipient: str(input.recipient),
      line_1: str(input.line1),
      line_2: str(input.line2),
      city: str(input.city),
      region: str(input.region),
      postcode: str(input.postcode),
      country_code: cc,
      phone: str(input.phone),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("delivery save failed", error.message);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}
