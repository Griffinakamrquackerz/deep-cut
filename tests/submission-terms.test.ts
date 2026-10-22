import { describe, it, expect } from "vitest";
import {
  SUBMISSION_TERMS,
  SUBMISSION_TERMS_SUMMARY,
  SUBMISSION_TERMS_VERSION,
} from "@/lib/submission-terms";

// The terms are a legal artefact rendered from a constant, so the things worth
// testing are the ones that would quietly break the record they create: a
// version that stops being a version, a clause that silently disappears, or
// wording that starts promising something the rest of the product doesn't do.

describe("submission terms", () => {
  it("has a sortable, dated version", () => {
    // Stored on every submission row. A version that isn't ordered can't answer
    // "which wording was on screen in March", which is the entire point.
    expect(SUBMISSION_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps every clause complete", () => {
    expect(SUBMISSION_TERMS.length).toBeGreaterThanOrEqual(8);
    for (const t of SUBMISSION_TERMS) {
      expect(t.h.trim()).not.toBe("");
      expect(t.p.trim()).not.toBe("");
    }
  });

  it("has no duplicate headings", () => {
    const hs = SUBMISSION_TERMS.map((t) => t.h);
    expect(new Set(hs).size).toBe(hs.length);
  });

  it("never claims a rights transfer, an option, or a fee", () => {
    // The submissions door promises "no agent, no connections, no pay-to-play
    // submission fee" and the whole pitch to filmmakers is that they keep their
    // film. Terms that contradicted either would be the most expensive typo on
    // the site, so the vocabulary is asserted rather than trusted.
    const all = [
      SUBMISSION_TERMS_SUMMARY,
      ...SUBMISSION_TERMS.flatMap((t) => [t.h, t.p]),
    ]
      .join(" ")
      .toLowerCase();

    expect(all).not.toMatch(/\bassign(s|ed|ment)?\b/);
    expect(all).not.toMatch(/\bexclusive\b/);
    expect(all).not.toMatch(/\bwork[- ]for[- ]hire\b/);
    expect(all).not.toMatch(/\bsubmission fee\b(?!.{0,40}\bno\b)/);
  });

  it("says the three things a submitter most needs to know", () => {
    const all = SUBMISSION_TERMS.map((t) => `${t.h} ${t.p}`).join(" ").toLowerCase();
    // They keep their work.
    expect(all).toMatch(/transfers nothing|you own/);
    // It is not confidential — the clause that actually protects the house.
    expect(all).toMatch(/confidential/);
    // They get an answer either way.
    expect(all).toMatch(/yes or a no|either way/);
  });

  it("summarises in one line, for the checkbox", () => {
    expect(SUBMISSION_TERMS_SUMMARY.length).toBeLessThan(200);
    expect(SUBMISSION_TERMS_SUMMARY).toMatch(/confidential/i);
  });
});
