// Which colour the label printer had left.
//
// Every mixtape gets a stripe on its spine, and the same tape has to get the
// same stripe wherever it's shelved — your Mixtapes tab, your member card,
// somebody else's. So the hue is derived from the tape's id rather than
// stored: a cheap string hash, folded onto the colour wheel.

export function tapeHue(id: string): number {
  // FNV-1a, then a multiply to spread neighbours apart: ids that differ by one
  // character (sequential fixtures, or two tapes sealed a second apart) should
  // not come out the same colour.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) % 360;
}
