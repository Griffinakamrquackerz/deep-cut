import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";

describe("PWA", () => {
  it("manifest has everything installability requires", () => {
    const m = manifest();
    expect(m.name).toBe("Deep Cut");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.background_color).toBe("#171210");
    expect(m.theme_color).toBe("#171210");
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("service worker + offline fallback ship in public/", () => {
    const pub = path.resolve(__dirname, "../public");
    const sw = fs.readFileSync(path.join(pub, "sw.js"), "utf8");
    expect(sw).toContain("offline.html");
    expect(sw).toContain("navigate");
    expect(fs.existsSync(path.join(pub, "offline.html"))).toBe(true);
  });
});
