// Streaming services Deep Cut knows about, and how TMDB /watch/providers maps onto them.
// TMDB sources availability from JustWatch — attribution required (see README).

export const SERVICES = [
  "netflix",
  "max",
  "hulu",
  "prime",
  "criterion",
  "tubi",
  "disney",
  "peacock",
  "paramount",
  "apple",
  "mubi",
  "shudder",
] as const;

export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<Service, string> = {
  netflix: "Netflix",
  max: "Max",
  hulu: "Hulu",
  prime: "Prime Video",
  criterion: "Criterion",
  tubi: "Tubi",
  disney: "Disney+",
  peacock: "Peacock",
  paramount: "Paramount+",
  apple: "Apple TV+",
  mubi: "MUBI",
  shudder: "Shudder",
};

// TMDB provider_id → our service enum. A service can have several TMDB ids
// (e.g. Max vs legacy HBO Max, Peacock tiers).
const TMDB_PROVIDER_IDS: Record<Service, number[]> = {
  netflix: [8, 1796],
  max: [1899, 384, 616],
  hulu: [15],
  prime: [9, 119, 10],
  criterion: [258],
  tubi: [73],
  disney: [337],
  peacock: [386, 387],
  paramount: [531, 582, 633],
  apple: [350],
  mubi: [11],
  shudder: [99],
};

const PROVIDER_LOOKUP = new Map<number, Service>();
for (const [service, ids] of Object.entries(TMDB_PROVIDER_IDS)) {
  for (const id of ids) PROVIDER_LOOKUP.set(id, service as Service);
}

/** Map a TMDB watch/providers US payload to the set of our services it's on. */
export function mapTmdbProviders(providerIds: number[]): Service[] {
  const found = new Set<Service>();
  for (const id of providerIds) {
    const svc = PROVIDER_LOOKUP.get(id);
    if (svc) found.add(svc);
  }
  return SERVICES.filter((s) => found.has(s));
}
