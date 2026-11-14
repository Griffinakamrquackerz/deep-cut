import { describe, it, expect } from "vitest";
import { featureOfWeek, weekIndex } from "@/lib/shorts";

const MON = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("weekIndex", () => {
  it("holds steady across a week", () => {
    // Mon 1 Sep 2025 through Sun 7 Sep are one week.
    const week = weekIndex(MON("2025-09-01"));
    for (const d of ["2025-09-02", "2025-09-04", "2025-09-07"]) {
      expect(weekIndex(MON(d)), d).toBe(week);
    }
  });

  it("turns over on Monday, not mid-weekend", () => {
    expect(weekIndex(MON("2025-09-08"))).toBe(weekIndex(MON("2025-09-01")) + 1);
    // Saturday night must still be showing the same film it opened with.
    expect(weekIndex(new Date("2025-09-06T23:30:00Z"))).toBe(weekIndex(MON("2025-09-01")));
  });
});

describe("featureOfWeek", () => {
  const bill = ["a", "b", "c", "d"];

  it("gives everyone the same film on the same day", () => {
    expect(featureOfWeek(bill, MON("2025-09-03"))).toBe(featureOfWeek(bill, MON("2025-09-05")));
  });

  it("moves on next week", () => {
    expect(featureOfWeek(bill, MON("2025-09-08"))).not.toBe(featureOfWeek(bill, MON("2025-09-01")));
  });

  it("works through the whole bill before repeating", () => {
    const seen = [0, 1, 2, 3].map((w) =>
      featureOfWeek(bill, new Date(MON("2025-09-01").getTime() + w * 7 * 86400_000)),
    );
    expect(new Set(seen).size).toBe(4);
  });

  it("has nothing to show for an empty bill", () => {
    expect(featureOfWeek([], MON("2025-09-01"))).toBeNull();
  });

  it("shows the only film there is, every week", () => {
    expect(featureOfWeek(["solo"], MON("2025-09-01"))).toBe("solo");
    expect(featureOfWeek(["solo"], MON("2025-10-06"))).toBe("solo");
  });
});
