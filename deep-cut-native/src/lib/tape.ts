// Which colour the label printer had left.
//
// Identical to the web's src/lib/tape.ts, so a tape wears the same stripe in
// the app as it does on the site: the hue is derived from the tape's id, not
// stored. FNV-1a, then a multiply to spread neighbouring ids apart.

export function tapeHue(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) % 360;
}

/** The three stripes down a label's edge, from one hue. */
export function tapeStripes(id: string): [string, string, string] {
  const hue = tapeHue(id);
  return [
    `hsl(${hue}, 78%, 52%)`,
    `hsl(${(hue + 38) % 360}, 80%, 60%)`,
    `hsl(${(hue + 300) % 360}, 55%, 42%)`,
  ];
}
