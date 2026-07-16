// Share-slug generation. The slug is a capability: anyone holding the link can
// view the playlist and (after signup) cross films off. 12 chars of base36
// from a CSPRNG ≈ 62 bits — unguessable at MVP scale.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function makeShareSlug(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function playlistProgress(items: Array<{ crossed_off: boolean }>): {
  done: number;
  total: number;
  pct: number;
} {
  const total = items.length;
  const done = items.filter((i) => i.crossed_off).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
