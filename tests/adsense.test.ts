import { describe, expect, it } from "vitest";

// The publisher-id parser, tested against the values a person actually pastes.
//
// Both defects here reached production: a value copied from the AdSense
// dashboard's Account information page (which shows the bare `pub-` form) and
// a trailing newline picked up by the browser copy. The site reported itself
// configured and served a malformed ads.txt line plus a loader URL asking
// Google about a client id it had never issued.
//
// lib/adsense.ts reads process.env at module load, so it can't be re-imported
// per case with different values. The regex and the two normalisations are
// restated here and asserted directly — the thing worth locking down is the
// SHAPE rule, and a drift between these two lines is a visible diff in the
// same commit rather than a silent behaviour change.
const PUB_ID = /^(?:ca-)?pub-(\d{10,24})$/;

function parse(raw: string | undefined): { client: string; pub: string } | null {
  const m = PUB_ID.exec((raw ?? "").trim());
  return m ? { client: `ca-pub-${m[1]}`, pub: `pub-${m[1]}` } : null;
}

const SLOT = /^\d{6,24}$/;
function parseSlot(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  return SLOT.test(v) ? v : null;
}

describe("publisher id", () => {
  it("accepts the ca-pub- form Google's snippet uses", () => {
    expect(parse("ca-pub-4101524049998747")).toEqual({
      client: "ca-pub-4101524049998747",
      pub: "pub-4101524049998747",
    });
  });

  it("accepts the bare pub- form the dashboard displays", () => {
    // The defect that shipped: ads.txt stripped a `ca-` that was never there,
    // so it produced a correct-looking line while the loader and the ownership
    // meta tag both carried an id Google would reject.
    expect(parse("pub-4101524049998747")).toEqual({
      client: "ca-pub-4101524049998747",
      pub: "pub-4101524049998747",
    });
  });

  it("survives the newline a browser copy brings with it", () => {
    // This one split ads.txt across two lines, which AdSense parses line by
    // line — two malformed entries and a failed verification.
    expect(parse("pub-4101524049998747\n")?.pub).toBe("pub-4101524049998747");
    expect(parse("  ca-pub-4101524049998747\r\n")?.client).toBe("ca-pub-4101524049998747");
  });

  it("never emits a double prefix", () => {
    expect(parse("ca-pub-4101524049998747")?.client).toBe("ca-pub-4101524049998747");
    expect(parse("ca-pub-4101524049998747")?.client).not.toContain("ca-ca-");
  });

  it("reads an unusable value as unconfigured rather than emitting it", () => {
    // Unconfigured keeps the house ad up. Emitting a broken tag would put an
    // advert-shaped hole on every page instead.
    for (const bad of ["", "   ", "pub-", "ca-pub-", "pub-abcdefghijklmnop", "4101524049998747"]) {
      expect(parse(bad), bad).toBeNull();
    }
  });
});

describe("ad unit id", () => {
  it("takes the numeric id from the dashboard", () => {
    expect(parseSlot("1234567890")).toBe("1234567890");
    expect(parseSlot(" 1234567890\n")).toBe("1234567890");
  });

  it("rejects the friendly placement names", () => {
    // data-ad-slot was receiving these. A name renders a blank unit that looks
    // exactly like an unapproved account.
    for (const name of ["tonight-feed", "lobby-feed", undefined, ""]) {
      expect(parseSlot(name), String(name)).toBeNull();
    }
  });
});
