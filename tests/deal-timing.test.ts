import { describe, expect, it } from "vitest";
import { createDealTiming } from "@/lib/deal-timing";

type TimingRecord = {
  event: string;
  outcome: string;
  totalMs: number;
  stagesMs: Record<string, number>;
};

function capture() {
  const seen: TimingRecord[] = [];
  return { seen, emit: (record: TimingRecord) => void seen.push(record) };
}

describe("createDealTiming — request-local stage timing", () => {
  it("attributes elapsed time to the stage active at each mark", () => {
    let now = 0;
    const { seen, emit } = capture();
    const timing = createDealTiming(() => now, emit);

    now = 120;
    timing.mark("context"); // 0→120 gathering context
    now = 400;
    timing.mark("llm"); // 120→400 in the LLM call
    now = 400.6;
    timing.mark("tmdb_validate"); // sub-ms tail must round, not vanish
    now = 500;
    timing.finish("success");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      event: "rec_deal_timing",
      outcome: "success",
      totalMs: 500,
      stagesMs: { context: 120, llm: 280, tmdb_validate: 1 },
    });
  });

  it("accumulates repeat marks on the same stage instead of overwriting", () => {
    let now = 0;
    const { seen, emit } = capture();
    const timing = createDealTiming(() => now, emit);

    now = 100;
    timing.mark("llm");
    now = 250;
    timing.mark("llm");
    now = 260;
    timing.mark("other");
    timing.finish("error");

    expect(seen[0].outcome).toBe("error");
    expect(seen[0].stagesMs).toEqual({ llm: 250, other: 10 });
  });

  it("clamps backwards clock movement to zero instead of going negative", () => {
    let now = 100;
    const { seen, emit } = capture();
    const timing = createDealTiming(() => now, emit);

    now = 40; // clock went backwards
    timing.mark("stage_a");
    now = 50;
    timing.mark("stage_b");
    timing.finish("success");

    expect(seen[0].stagesMs).toEqual({ stage_a: 0, stage_b: 10 });
    expect(seen[0].totalMs).toBe(0);
  });

  it("never lets a logging failure break the request", () => {
    const timing = createDealTiming(
      () => 42,
      () => {
        throw new Error("log sink down");
      },
    );
    expect(() => timing.finish("success")).not.toThrow();
  });
});