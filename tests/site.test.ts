import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

// siteUrl reads process.env at call time, so a static import is fine — set the
// env, then call.
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("siteUrl", () => {
  it("falls back to the real domain when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(siteUrl()).toBe("https://thedeepcut.xyz");
  });

  it("ignores stale vercel.app preview hosts", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://deepcut-beta.vercel.app";
    expect(siteUrl()).toBe("https://thedeepcut.xyz");
  });

  it("honors a real custom domain and trims trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://thedeepcut.xyz/";
    expect(siteUrl()).toBe("https://thedeepcut.xyz");
  });
});
