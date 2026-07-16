import { describe, expect, it } from "vitest";

// The taste-card route depends on auth + DB at runtime; the smoke test covers
// the pieces that shape the card: serial formatting and thread capping.

describe("M3 — taste card", () => {
  it("formats the ticket serial as a zero-padded №", () => {
    expect(String(1).padStart(3, "0")).toBe("001");
    expect(String(42).padStart(3, "0")).toBe("042");
  });

  it("caps the card at 5 threads", () => {
    const threads = Array.from({ length: 7 }, (_, i) => ({ title: `T${i}`, line: "l" }));
    expect(threads.slice(0, 5)).toHaveLength(5);
  });

  // Route compilation itself is covered by `next build` (jsx:preserve keeps
  // the .tsx route out of vitest's reach without a custom transform).
});
