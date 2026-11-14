// Opt-in network experiment; skipped in the regular suite. Never calls dealRecs/cacheMovie.
import { it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLlmTrace, generateRecCandidates, resolveLlmConfig, type RecRequest } from "@/lib/ai";
import { repeatExclusionTitles } from "@/lib/repeat-exclusions";
import { getRecentSignals, signalLine } from "@/lib/signals";
import { getUserRegion, serviceAvailableIn } from "@/lib/region";
import { vibeByKey } from "@/lib/vibes";
import { resolveTitleYear } from "@/lib/tmdb";
import type { Service } from "@/lib/services";

type Row = { movie_id: number; movies: { title: string; year: number | null } | null };

it.skipIf(process.env.DEEP_CUT_LIVE_EVAL !== "1")("captures a before/after generation smoke test without database writes", async () => {
  const cfg = resolveLlmConfig();
  expect(cfg.provider).toBe("openai-compatible");
  if (!cfg.apiKey || !process.env.TMDB_API_KEY) throw new Error("Missing API configuration");
  const originalFetch = globalThis.fetch.bind(globalThis);
  let requests = 0;
  let blocked = 0;
  const allowed = new Set([new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin, "https://api.themoviedb.org"]);
  const guarded: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const generation = url.href === `${cfg.baseUrl}/chat/completions` && method === "POST";
    if (!generation && (method !== "GET" || !allowed.has(url.origin))) {
      blocked++; throw new Error("Blocked non-read network operation");
    }
    if (generation && ++requests > 8) throw new Error("Generation request budget exhausted");
    return originalFetch(input, { ...init, signal: AbortSignal.timeout(45000) });
  };
  vi.stubGlobal("fetch", guarded);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: guarded },
  });
  const artifact = join(tmpdir(), `deep-cut-repeat-smoke-${Date.now()}.json`);
  const runs: Array<Record<string, unknown>> = [];
  const report: Record<string, unknown> = { capturedAt: new Date().toISOString(), runs,
    scope: "One pair; current frozen context, reconstructed weird/4-5/services-on settings. Not historical replay or a full deal. Before always first. No quality claim." };
  const save = () => writeFileSync(artifact, JSON.stringify(report, null, 2), { mode: 0o600 });
  try {
    const batch = await db.from("recommendations").select("user_id,movies(title)").eq("batch", 214);
    if (batch.error) throw new Error("Batch read failed");
    const target = batch.data.filter((r) => (r.movies as unknown as { title: string })?.title === "Trafficking");
    expect(target).toHaveLength(1);
    const uid = target[0].user_id as string;
    async function history(table: string, time: string) {
      const rows: Row[] = [];
      for (;;) {
        const { data, error, count } = await db.from(table).select("movie_id,movies(title,year)", { count: "exact" })
          .eq("user_id", uid).order(time, { ascending: false })
          .order(table === "loved_movies" ? "movie_id" : "id", { ascending: false }).range(rows.length, rows.length + 499);
        if (error || !data || count == null) throw new Error(`Failed ${table}`);
        rows.push(...data as unknown as Row[]);
        if (rows.length >= count) return rows;
        if (!data.length) throw new Error("Incomplete history");
      }
    }
    const [loved, watched, recs, profile, logs, services, region, signals] = await Promise.all([
      history("loved_movies", "added_at"), history("watch_logs", "watched_at"), history("recommendations", "created_at"),
      db.from("taste_profiles").select("threads").eq("user_id", uid).single(),
      db.from("ai_logs").select("raw").eq("user_id", uid).eq("stage", "recs")
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300),
      db.from("user_services").select("service").eq("user_id", uid),
      getUserRegion(db, uid), getRecentSignals(db, uid, 10),
    ]);
    if (profile.error || logs.error || services.error || !profile.data.threads?.length) throw new Error("Missing context");
    const ids = new Set<number>();
    const titles: string[] = [];
    for (const r of [...loved, ...watched, ...recs]) {
      if (ids.has(r.movie_id)) continue;
      ids.add(r.movie_id);
      if (r.movies) titles.push(`${r.movies.title} (${r.movies.year ?? "?"})`);
    }
    const vibe = vibeByKey("weird")!;
    const request: RecRequest = { threads: profile.data.threads,
      lovedTitles: loved.flatMap((r) => r.movies ? [`${r.movies.title} (${r.movies.year ?? "?"})`] : []),
      exclusionTitles: titles.slice(0, 120),
      services: services.data.map((r) => r.service as Service).filter((s) => serviceAvailableIn(s, region.region)),
      obscurityMin: 4, obscurityMax: 5, myServicesOnly: true,
      vibe: { label: vibe.label, hint: vibe.hint }, recentSparks: signals.map(signalLine) };
    const patched = repeatExclusionTitles(titles, logs.data);
    report.context = { request, patched, historyIds: [...ids], historyTitles: titles, region };
    save();
    const resolved = new Map<string, number | null>();
    for (const arm of ["before", "after"] as const) {
      const trace = createLlmTrace();
      const start = performance.now();
      const output = await generateRecCandidates({ ...structuredClone(request),
        exclusionTitles: arm === "before" ? request.exclusionTitles : patched }, trace);
      const generationMs = Math.round(performance.now() - start);
      const run: Record<string, unknown> = { arm, trace, generationMs, ...output };
      runs.push(run);
      save(); // retain raw completions even if validation fails
      const candidates = [];
      for (const candidate of output.candidates.recs) {
        const key = `${candidate.title} (${candidate.year})`;
        if (!resolved.has(key)) resolved.set(key, await resolveTitleYear(candidate.title, candidate.year));
        const id = resolved.get(key) ?? null;
        candidates.push({ ...candidate, id, historyCollision: id != null && ids.has(id) });
      }
      run.resolved = candidates;
      run.summary = { arm, generated: candidates.length,
        historyCollisions: candidates.filter((c) => c.historyCollision).length,
        unresolved: candidates.filter((c) => c.id == null).length,
        uniqueUnseenResolved: new Set(candidates.filter((c) => c.id != null && !c.historyCollision).map((c) => c.id)).size,
        generationMs, trace };
      save();
      console.log("LIVE_REPEAT_RESULT", JSON.stringify(run.summary));
    }
    expect(blocked).toBe(0);
  } finally {
    report.requests = requests;
    report.blockedOperations = blocked;
    save();
    vi.unstubAllGlobals();
    console.log("LIVE_REPEAT_ARTIFACT", artifact);
  }
}, 300000);
