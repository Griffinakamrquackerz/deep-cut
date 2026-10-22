import { describe, it, expect } from "vitest";
import { isPostable, EMPTY_DELIVERY } from "@/lib/delivery";
import {
  isAllowed,
  toAttachments,
  attachmentPath,
  displayName,
  humanSize,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_TYPES,
} from "@/lib/attachments";
import { needsAddress, firstPhysicalTier, perkLine, PERKS } from "@/lib/perks";

describe("delivery address", () => {
  it("is postable on a name, a first line and a country", () => {
    expect(
      isPostable({
        ...EMPTY_DELIVERY,
        recipient: "G. Howes",
        line1: "1 Marquee Street",
        countryCode: "US",
      }),
    ).toBe(true);
  });

  it("does not demand a postcode", () => {
    // Plenty of valid addresses have none. A completeness check that insisted
    // would mark them incomplete forever and the parcel would never ship.
    const d = {
      ...EMPTY_DELIVERY,
      recipient: "A Director",
      line1: "Flat 2, The Old Cinema",
      city: "Galway",
      countryCode: "IE",
    };
    expect(d.postcode).toBeNull();
    expect(isPostable(d)).toBe(true);
  });

  it("is not postable on a name alone", () => {
    expect(isPostable({ ...EMPTY_DELIVERY, recipient: "G. Howes" })).toBe(false);
    expect(isPostable(EMPTY_DELIVERY)).toBe(false);
  });
});

describe("who we ask for an address", () => {
  it("asks nobody below the first physical tier", () => {
    const first = firstPhysicalTier();
    expect(first).not.toBeNull();
    expect(needsAddress(0)).toBe(false);
    expect(needsAddress((first?.minCents ?? 1) - 1)).toBe(false);
  });

  it("asks once a physical tier is actually cleared", () => {
    const first = firstPhysicalTier();
    expect(needsAddress(first?.minCents ?? 0)).toBe(true);
    // And keeps asking further up — perks stack.
    expect(needsAddress(2_500_000)).toBe(true);
  });

  it("marks experiences as not physical", () => {
    // A set visit and a premiere seat need a guest list, not a courier. The
    // Associate Producer tier is experiences only and must not trigger a
    // shipping form on its own merits.
    const ap = PERKS.find((p) => p.name === "Associate Producer");
    expect(ap?.physical).toBeUndefined();
  });
});

describe("the top tier's boast survives a goal change", () => {
  // The wording moved from "a share of a feature" to "what it costs to shoot
  // it" — "share" is on the forbidden list this project sets itself, because
  // share-of-a-thing plus a percentage is the language of fractional
  // ownership. What these tests are actually for is unchanged: the fraction
  // has to track the goal, so raising the goal can't leave a stale boast on
  // the page.
  it("says ten percent at a $250k goal", () => {
    const ep = PERKS[PERKS.length - 1];
    expect(perkLine(ep, 25_000_000)).toMatch(/10 percent of what it costs/);
  });

  it("stops claiming ten percent at a $1M goal", () => {
    const ep = PERKS[PERKS.length - 1];
    const line = perkLine(ep, 100_000_000);
    expect(line).not.toMatch(/10 percent/);
    expect(line).toMatch(/40th of what it costs/);
  });

  it("never describes the tier as owning part of the film", () => {
    for (const goal of [25_000_000, 100_000_000, 5_000_000]) {
      const line = perkLine(PERKS[PERKS.length - 1], goal).toLowerCase();
      for (const word of ["share", "equity", "stake", "invest", "ownership"]) {
        expect(line.includes(word), `${goal}: "${line}" contains "${word}"`).toBe(false);
      }
    }
  });
});

describe("attachments", () => {
  it("takes a screenplay and refuses a video", () => {
    expect(isAllowed("application/pdf", 1_500_000)).toBe(true);
    expect(isAllowed("video/mp4", 1_500_000)).toBe(false);
  });

  it("refuses anything over the ceiling", () => {
    expect(isAllowed("application/pdf", MAX_ATTACHMENT_BYTES)).toBe(true);
    expect(isAllowed("application/pdf", MAX_ATTACHMENT_BYTES + 1)).toBe(false);
    expect(isAllowed("application/pdf", 0)).toBe(false);
  });

  it("never builds a path out of the director's filename", () => {
    // A filename arriving from a browser can carry slashes and traversal. The
    // path is generated; the name is display only.
    const path = attachmentPath("film-01", "Dir@Example.com", "application/pdf");
    expect(path.startsWith("film-01/")).toBe(true);
    expect(path).not.toContain("..");
    expect(path.endsWith(".pdf")).toBe(true);
    expect(path).toMatch(/^film-01\/dir-example-com\/\d+-[a-z0-9]+\.pdf$/);
  });

  it("gives every allowed type an extension", () => {
    for (const [type, ext] of Object.entries(ALLOWED_TYPES)) {
      expect(ext).toMatch(/^[a-z0-9]+$/);
      expect(attachmentPath("film-01", "a@b.co", type).endsWith(`.${ext}`)).toBe(true);
    }
  });

  it("survives junk in the jsonb column", () => {
    expect(toAttachments(null)).toEqual([]);
    expect(toAttachments("nope")).toEqual([]);
    expect(toAttachments([{ name: "no path" }, null, 7])).toEqual([]);
    expect(
      toAttachments([{ path: "film-01/a/1.pdf", name: "Script.pdf", size: 12, type: "application/pdf" }]),
    ).toHaveLength(1);
  });

  it("cleans a display name without losing it", () => {
    expect(displayName("  My\nScript.pdf ")).toBe("My Script.pdf");
    expect(displayName("")).toBe("attachment");
    expect(displayName("x".repeat(400)).length).toBe(120);
  });

  it("prints sizes a person can read", () => {
    expect(humanSize(500)).toBe("500B");
    expect(humanSize(2048)).toBe("2KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0MB");
  });
});
