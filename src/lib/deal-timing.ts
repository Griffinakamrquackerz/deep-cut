/** Non-timing facts about a deal. Never user IDs, titles, prompts, or credentials. */
export type TimingMeta = Record<string, string | number | boolean>;

export interface TimingRecord {
  event: string;
  outcome: string;
  totalMs: number;
  stagesMs: Record<string, number>;
  /** Present only when the caller noted something — see `note()`. */
  meta?: TimingMeta;
}

/** Request-local timings. Never includes user IDs, titles, prompts, or credentials. */
export function createDealTiming(
  now: () => number = () => performance.now(),
  emit: (record: TimingRecord) => void = (record) =>
    console.info("dealRecs timing", JSON.stringify(record)),
) {
  const start = now();
  let previous = start;
  const stagesMs: Record<string, number> = {};
  const meta: TimingMeta = {};
  return {
    mark(stage: string) {
      const current = now();
      stagesMs[stage] = (stagesMs[stage] ?? 0) + Math.max(0, current - previous);
      previous = current;
    },
    /**
     * Attach a non-timing fact to the record — which model answered, how many
     * retries that cost. Stage timings say how long a stage took; this says why.
     * Omitted entirely when nothing was noted, so the record's shape is
     * unchanged for callers that never use it.
     */
    note(key: string, value: string | number | boolean) {
      try {
        meta[key] = value;
      } catch {
        // Diagnostics are best-effort — never a reason to fail a deal.
      }
    },
    finish(outcome: "success" | "error") {
      // Diagnostics must never turn a successful deal into an error.
      try {
        emit({
          event: "rec_deal_timing",
          outcome,
          totalMs: Math.round(Math.max(0, now() - start)),
          stagesMs: Object.fromEntries(
            Object.entries(stagesMs).map(([stage, ms]) => [stage, Math.round(ms)]),
          ),
          ...(Object.keys(meta).length > 0 ? { meta } : {}),
        });
      } catch {
        // Logging is best-effort.
      }
    },
  };
}
