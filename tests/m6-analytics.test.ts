import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EventInput } from "@/lib/schemas";

// Dashboards key off these names — keep them stable.
const CANONICAL_EVENTS = [
  "onboarding_completed",
  "profile_generated",
  "rec_batch_dealt",
  "rec_watchlisted",
  "rec_seen",
  "rec_dismissed",
  "reason_tapped",
  "playlist_created",
  "playlist_shared",
  "playlist_item_crossed",
  "taste_card_shared",
  "take_posted",
  "follow_created",
];

describe("M6 — instrumentation", () => {
  it("every canonical event name is emitted somewhere in the codebase", () => {
    const roots = [path.resolve(__dirname, "../src")];
    let source = "";
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name)) source += fs.readFileSync(p, "utf8");
      }
    };
    roots.forEach(walk);
    for (const name of CANONICAL_EVENTS) {
      expect(source, `missing event ${name}`).toContain(`"${name}"`);
    }
  });

  it("metrics views cover the spec metrics", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../supabase/migrations/0002_metrics.sql"),
      "utf8",
    );
    for (const view of [
      "metric_onboarding",
      "metric_rec_funnel",
      "metric_shares",
      "metric_d7_retention",
    ]) {
      expect(sql).toContain(view);
    }
  });

  it("event API input validates names and props", () => {
    expect(EventInput.safeParse({ name: "reason_tapped", props: { recId: "x" } }).success).toBe(true);
    expect(EventInput.safeParse({ name: "" }).success).toBe(false);
  });
});
