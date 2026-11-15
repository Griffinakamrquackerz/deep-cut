// The number on a membership card.
//
// Not an account id and not sequential — nobody should be able to read how
// many members there are, or who joined first, off somebody's card. It's two
// groups of four digits hashed from the member's id: stable, so your card
// always carries the same number, and meaningless to anyone but the card.

export function memberNo(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  const a = String(h % 10000).padStart(4, "0");
  const b = String(Math.floor(h / 10000) % 10000).padStart(4, "0");
  return `${a} ${b}`;
}
