import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGION,
  REGIONS,
  isKnownRegion,
  normalizeRegion,
  regionFromRequest,
  regionLabel,
  serviceAvailableIn,
  servicesForRegion,
} from "../src/lib/region";
import { SERVICES } from "../src/lib/services";

// The bug these guard: every recommendation was computed against AMERICAN
// streaming availability, hardcoded in three places, for every member
// everywhere. A film reported as on Netflix when it wasn't, and the films that
// were on their Netflix never surfaced.

describe("region normalisation", () => {
  it("accepts a two-letter code in any case", () => {
    expect(normalizeRegion("gb")).toBe("GB");
    expect(normalizeRegion(" us ")).toBe("US");
    expect(normalizeRegion("De")).toBe("DE");
  });

  it("rejects anything that isn't two letters", () => {
    // These arrive from headers and form fields, so none of them can be
    // trusted into a TMDB query string.
    for (const bad of ["", "U", "USA", "12", "U1", "us-CA", null, undefined, "  "]) {
      expect(normalizeRegion(bad)).toBeNull();
    }
  });

  it("tells a curated region apart from a merely valid one", () => {
    expect(isKnownRegion("GB")).toBe(true);
    // Valid ISO code, not in the picker. Still gets a working app.
    expect(isKnownRegion("PT")).toBe(false);
    expect(isKnownRegion("nope")).toBe(false);
  });

  it("falls back to the code itself when there's no label", () => {
    expect(regionLabel("GB")).toBe("United Kingdom");
    expect(regionLabel("ZZ")).toBe("ZZ");
  });
});

describe("service availability by region", () => {
  it("offers everything in the US", () => {
    expect(servicesForRegion("US")).toEqual([...SERVICES]);
  });

  it("does not offer US-only services elsewhere", () => {
    // Hulu, Tubi and Peacock are essentially American. Offering them in London
    // costs a member a whole filter that can never resolve on TMDB.
    for (const region of ["GB", "DE", "AU", "JP"]) {
      expect(serviceAvailableIn("hulu", region)).toBe(false);
      expect(serviceAvailableIn("peacock", region)).toBe(false);
    }
    expect(serviceAvailableIn("hulu", "US")).toBe(true);
  });

  it("offers the global set for a region nobody has curated", () => {
    const pt = servicesForRegion("PT");
    expect(pt).toContain("netflix");
    expect(pt).toContain("prime");
    expect(pt).not.toContain("hulu");
  });

  it("treats an unknown or missing region as the default", () => {
    expect(servicesForRegion(null)).toEqual(servicesForRegion(DEFAULT_REGION));
    expect(servicesForRegion("garbage")).toEqual(servicesForRegion(DEFAULT_REGION));
  });

  it("never offers a service that isn't in the enum", () => {
    // A typo in the availability table would render a chip with no label and
    // send a provider id TMDB doesn't know.
    for (const { code } of REGIONS) {
      for (const s of servicesForRegion(code)) {
        expect(SERVICES).toContain(s);
      }
    }
  });
});

describe("region from a request", () => {
  const req = (url: string, headers: Record<string, string> = {}) =>
    new Request(url, { headers });

  it("prefers an explicit query param over the edge's guess", () => {
    // The client passes the member's own saved answer; the header only knows
    // which network they're on.
    const r = req("https://x.test/api/settle/film?id=1&region=gb", {
      "x-vercel-ip-country": "US",
    });
    expect(regionFromRequest(r)).toBe("GB");
  });

  it("falls back to the geo header", () => {
    expect(regionFromRequest(req("https://x.test/a", { "x-vercel-ip-country": "de" }))).toBe("DE");
  });

  it("returns null when it genuinely doesn't know", () => {
    // Null rather than US, so the caller decides — a silent US default here is
    // how the original bug spread.
    expect(regionFromRequest(req("https://x.test/a"))).toBeNull();
  });

  it("ignores a junk param or header instead of passing it through", () => {
    expect(regionFromRequest(req("https://x.test/a?region=UNITED%20STATES"))).toBeNull();
    expect(regionFromRequest(req("https://x.test/a", { "x-vercel-ip-country": "XX1" }))).toBeNull();
  });
});
