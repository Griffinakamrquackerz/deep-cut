import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICES, type Service } from "./services";

// Where the member actually is, and what that changes.
//
// This exists because the whole promise of Deep Cut — "on a service you already
// pay for" — was computed against AMERICAN streaming availability, in three
// places, hardcoded. A member in London was told a film was on Netflix when it
// wasn't, and never shown the films that were. The recommendation engine was
// confidently wrong for everybody outside one country.
//
// Two things follow from a region, and they're different:
//
//   1. WHICH CATALOGUE to ask TMDB about. That's `watch_region`, and it's the
//      correctness fix — the same film is on different services in different
//      countries, or on none.
//   2. WHICH SERVICES to offer in the picker. Hulu, Tubi and Peacock are
//      essentially American; showing them to somebody in Berlin is noise they
//      have to read past. This is polish, not correctness, but it's cheap.
//
// TMDB provider ids are global — Netflix is 8 everywhere — so the id → service
// mapping in services.ts needs no per-region variant. Only the availability
// list below does.

/** ISO 3166-1 alpha-2, uppercase. */
export type Region = string;

export const DEFAULT_REGION = "US";

/**
 * The regions offered in the picker.
 *
 * Curated rather than exhaustive: these are markets where enough of the twelve
 * services Deep Cut knows about actually operate for the product to be worth
 * using. A member somewhere else still gets a working app — their region falls
 * through to the global service set and TMDB answers for their country — they
 * just don't see their country in the list yet.
 */
export const REGIONS: Array<{ code: Region; label: string }> = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "JP", label: "Japan" },
  { code: "IN", label: "India" },
];

const REGION_CODES = new Set(REGIONS.map((r) => r.code));

/** Two uppercase letters, or nothing. Never trust a header or a form field. */
export function normalizeRegion(raw: string | null | undefined): Region | null {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

export function isKnownRegion(code: string | null | undefined): boolean {
  const v = normalizeRegion(code);
  return !!v && REGION_CODES.has(v);
}

export function regionLabel(code: Region): string {
  return REGIONS.find((r) => r.code === code)?.label ?? code;
}

/**
 * Services that exist nearly everywhere Deep Cut is likely to be used.
 *
 * The fallback for any region not listed below. Deliberately conservative — a
 * service missing from the picker costs a member one unchecked box; a service
 * offered where it doesn't operate costs them a whole category of
 * recommendations that can never resolve.
 */
const GLOBAL_SERVICES: Service[] = ["netflix", "prime", "disney", "apple", "mubi"];

/**
 * Per-region service availability.
 *
 * Hand-maintained, and that's a real cost — services launch and withdraw from
 * markets constantly. It's still better than the alternative, which was
 * offering all twelve everywhere and letting members discover the gaps
 * themselves. Anything not listed here uses GLOBAL_SERVICES.
 */
const REGION_SERVICES: Partial<Record<Region, Service[]>> = {
  US: [...SERVICES],
  CA: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max", "criterion", "tubi", "shudder"],
  GB: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max", "shudder"],
  IE: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  AU: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max", "shudder"],
  NZ: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  DE: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  FR: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  ES: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  IT: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  NL: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  SE: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  NO: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  DK: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  BR: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  MX: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  JP: ["netflix", "prime", "disney", "apple", "mubi", "paramount", "max"],
  IN: ["netflix", "prime", "disney", "apple", "mubi"],
};

/** Which of our services are worth offering somebody in this region. */
export function servicesForRegion(code: Region | null | undefined): Service[] {
  const v = normalizeRegion(code) ?? DEFAULT_REGION;
  return REGION_SERVICES[v] ?? GLOBAL_SERVICES;
}

/**
 * Is this service worth asking TMDB about for this region?
 *
 * Used to drop services a member selected before they moved, or before a
 * service withdrew from their market. Filtering rather than clearing: their
 * stored selection is left alone, so moving back restores it.
 */
export function serviceAvailableIn(service: Service, code: Region | null | undefined): boolean {
  return servicesForRegion(code).includes(service);
}

/**
 * The region to use for one member, reading the column added by migration 0022.
 *
 * Falls back to US when nobody has been asked yet, which keeps every existing
 * member's recommendations exactly as they were rather than emptying them on
 * deploy. The fallback is also why `regionKnown` exists — the app needs to tell
 * "they chose the US" apart from "we assumed", so it can ask once without
 * nagging somebody who has already answered.
 */
export async function getUserRegion(
  db: SupabaseClient,
  userId: string,
): Promise<{ region: Region; regionKnown: boolean }> {
  const { data, error } = await db
    .from("users")
    .select("region")
    .eq("id", userId)
    .maybeSingle();

  // A missing column (migration 0022 not run) reads as unknown rather than
  // throwing. Recommendations degrading to the old US behaviour beats a deal
  // that 500s.
  if (error) return { region: DEFAULT_REGION, regionKnown: false };

  const stored = normalizeRegion((data as { region?: string | null } | null)?.region);
  return stored
    ? { region: stored, regionKnown: true }
    : { region: DEFAULT_REGION, regionKnown: false };
}

export async function setUserRegion(
  db: SupabaseClient,
  userId: string,
  region: string,
): Promise<boolean> {
  const v = normalizeRegion(region);
  if (!v) return false;
  const { error } = await db.from("users").update({ region: v }).eq("id", userId);
  if (error) {
    console.error("setUserRegion failed", error.message);
    return false;
  }
  return true;
}

/**
 * Best guess at the region for a request with no signed-in member.
 *
 * Order: an explicit `?region=` (the client knows the member's stored choice),
 * then the edge's own geo header, then null so the caller decides. Vercel sets
 * x-vercel-ip-country on every request at no cost, which makes a sensible
 * default free — but it is a guess about a network, not an answer from a
 * person, so it never gets written to the profile from here.
 */
export function regionFromRequest(request: Request): Region | null {
  const url = new URL(request.url);
  return (
    normalizeRegion(url.searchParams.get("region")) ??
    normalizeRegion(request.headers.get("x-vercel-ip-country")) ??
    null
  );
}

/**
 * The region to use for a request, signed in or not.
 *
 * A member's own stored choice wins; otherwise the edge's geo guess; otherwise
 * US. One call rather than the same three-line dance in every route, because
 * the routes that forget are exactly how this bug happened the first time.
 */
export async function regionForRequest(
  db: SupabaseClient,
  request: Request,
  userId: string | null | undefined,
): Promise<Region> {
  if (userId) {
    const { region, regionKnown } = await getUserRegion(db, userId);
    if (regionKnown) return region;
  }
  return regionFromRequest(request) ?? DEFAULT_REGION;
}
