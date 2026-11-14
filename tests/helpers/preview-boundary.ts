// Test-only network boundary for real-engine previews. Never used by app routes.
import { createHash } from "node:crypto";

// Frozen-input capture: every intercepted read (and generation) response, keyed by
// a SHA-256 hash of the request. Keys and raw URLs never leave this file, so the
// capture on disk carries no credentials, member IDs, or request bodies.
export interface PreviewCapture {
  version: 1;
  reads: Array<{ hash: string; status: number; text: string }>;
}

export interface PreviewBoundaryOptions {
  databaseUrl: string;
  userId: string;
  generationUrl: string;
  fetch: typeof fetch;
  maxReads?: number;
  maxGenerations?: number;
  timeoutMs?: number;
}

export function createPreviewBoundary(options: PreviewBoundaryOptions) {
  const database = new URL(options.databaseUrl).origin;
  const reads = new Map<string, Promise<Response>>();
  const pending = new Set<Promise<unknown>>();
  const issues: string[] = [];
  const recommendations = new Map<number, Record<string, unknown>>();
  const simulated: Record<string, number> = {};
  const capturedResponses = new Map<string, { status: number; text: string }>();
  let offline = false;
  let readCount = 0;
  let generations = 0;
  let blocked = 0;
  const deadline = Date.now() + (options.timeoutMs ?? 240_000);
  const userTables = new Set(["loved_movies", "watch_logs", "recommendations", "taste_profiles", "user_services", "ai_logs", "events"]);
  const writable = new Set(["movies", "recommendations", "ai_logs", "events"]);
  function fail(message: string): never {
    issues.push(message);
    throw new Error(message);
  }
  const json = (data: unknown) => new Response(JSON.stringify(data), {
    status: 200, headers: { "content-type": "application/json" },
  });
  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    const dbRequest = url.origin === database && table != null;
    if (dbRequest && method === "POST" && writable.has(table)) {
      const payload: unknown = await request.text().then((body) => JSON.parse(body));
      const rows = Array.isArray(payload) ? payload : [payload];
      if (!rows.every((r) => r && typeof r === "object" &&
        (table === "movies" ? Number.isInteger(r.id) : r.user_id === options.userId) &&
        (table !== "recommendations" || Number.isInteger(r.movie_id)))) {
        blocked++; return fail("Invalid simulated write");
      }
      simulated[table] = (simulated[table] ?? 0) + rows.length;
      const accepted = [];
      for (const row of rows as Record<string, unknown>[]) {
        if (table === "recommendations") {
          const id = row.movie_id as number;
          if (recommendations.has(id)) continue;
          const rec = { ...row, id: `preview-${id}` };
          recommendations.set(id, rec);
          accepted.push(rec);
        } else accepted.push(row);
      }
      // Only in-memory response simulation; NEVER forward these requests.
      const representation = request.headers.get("prefer")?.includes("return=representation");
      return representation ? json(request.headers.get("accept")?.includes("vnd.pgrst.object")
        ? accepted[0] ?? null : accepted) : new Response(null, { status: 204 });
    }
    // Recycling deletes one stale `active` row for this member before re-dealing
    // it. Simulated in memory like the writes above; never forwarded.
    if (dbRequest && method === "DELETE" && table === "recommendations") {
      if (url.searchParams.get("user_id") !== `eq.${options.userId}`) {
        blocked++; return fail("Blocked unscoped delete");
      }
      let removed = 0;
      for (const id of [...recommendations.keys()]) {
        if (url.searchParams.get("movie_id") === `eq.${id}`) { recommendations.delete(id); removed++; }
      }
      simulated.delete = (simulated.delete ?? 0) + removed;
      return new Response(null, { status: 204 });
    }
    const generation = request.url === options.generationUrl && method === "POST";
    const scopedRead = dbRequest && method === "GET" && (
      table === "movies" ||
      (table === "users" && url.searchParams.get("id") === `eq.${options.userId}`) ||
      (userTables.has(table) && url.searchParams.get("user_id") === `eq.${options.userId}`)
    );
    const externalRead = method === "GET" && (
      (url.origin === "https://api.themoviedb.org" && url.pathname.startsWith("/3/")) ||
      (url.origin === "https://www.omdbapi.com" && url.pathname === "/")
    );
    if (!generation && !scopedRead && !externalRead) {
      blocked++; return fail("Blocked unexpected network operation");
    }
    // Keep keys only in memory: URLs can contain credentials, queries, and IDs.
    // Non-GET requests include the body in the key: the same generation URL with a
    // different prompt is a different request and must never alias in a capture.
    const body = method === "GET" ? "" : await request.clone().text();
    const key = createHash("sha256").update(JSON.stringify([request.url, request.headers.get("accept"),
      request.headers.get("range"), request.headers.get("prefer"), body])).digest("hex");
    if (reads.has(key)) return (await reads.get(key)!).clone();
    if (offline) return fail("Offline replay requested uncaptured data");
    if (Date.now() >= deadline) return fail("Preview time budget exhausted");
    if (generation ? ++generations > (options.maxGenerations ?? 4) : ++readCount > (options.maxReads ?? 600)) {
      return fail("Preview request budget exhausted");
    }
    const task = (async () => {
      try {
        const response = await options.fetch(request, {
          redirect: "error",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now())))]),
        });
        if (!response.ok) return fail(`Preview HTTP failure (${generation ? "generation" : dbRequest ? "database" : "metadata"}: ${response.status})`);
        const text = await response.text();
        capturedResponses.set(key, { status: response.status, text });
        // OMDb reports application errors via HTTP 200; do not call these quality results.
        if (url.origin === "https://www.omdbapi.com" && JSON.parse(text).Response === "False") {
          issues.push("OMDb returned no ratings or an application error");
        }
        return new Response(text, { status: response.status, headers: response.headers });
      } catch {
        return fail("Preview upstream request failed (details omitted)");
      }
    })();
    reads.set(key, task);
    return (await task).clone();
  }
  const guarded: typeof fetch = (input, init) => {
    const task = handle(input, init);
    pending.add(task);
    void task.then(() => pending.delete(task), () => pending.delete(task));
    return task;
  };
  return {
    fetch: guarded,
    issues,
    setOffline() { offline = true; },
    resetWrites() { recommendations.clear(); },
    // Serialize every response captured this run. Call after drain() so in-flight
    // fetches are included. Contains hashed keys and response bodies only.
    dump(): PreviewCapture {
      return { version: 1, reads: [...capturedResponses].map(([hash, r]) => ({ hash, ...r })) };
    },
    // Rehydrate a capture and enter offline mode: every later request must match a
    // captured entry exactly (including generation request bodies) or fail loudly.
    loadCapture(capture: PreviewCapture) {
      if (capture?.version !== 1 || !Array.isArray(capture.reads)) fail("Invalid preview capture");
      for (const entry of capture.reads) {
        if (typeof entry?.hash !== "string" || !/^[0-9a-f]{64}$/.test(entry.hash) ||
          !Number.isInteger(entry.status) || typeof entry.text !== "string") {
          fail("Malformed preview capture entry");
        }
        capturedResponses.set(entry.hash, { status: entry.status, text: entry.text });
        reads.set(entry.hash, Promise.resolve(new Response(entry.text, {
          status: entry.status, headers: { "content-type": "application/json" },
        })));
      }
      offline = true;
    },
    rows: () => [...recommendations.values()],
    stats: () => ({ readCount, generations, blocked, capturedReads: reads.size, simulated: { ...simulated } }),
    async drain() { while (pending.size) await Promise.allSettled([...pending]); },
  };
}
