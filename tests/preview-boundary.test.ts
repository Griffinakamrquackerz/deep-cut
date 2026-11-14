import { describe, expect, it, vi } from "vitest";
import { createPreviewBoundary } from "./helpers/preview-boundary";

const databaseUrl = "https://preview.example";
const generationUrl = "https://llm.example/chat/completions";
function setup(maxReads = 10) {
  const upstream = vi.fn<typeof fetch>(async () => new Response("[]", { headers: { "content-type": "application/json" } }));
  const boundary = createPreviewBoundary({ databaseUrl, generationUrl, userId: "member", fetch: upstream, maxReads });
  return { ...boundary, upstream };
}
const write = (table: string, body: unknown, method = "POST") => [
  `${databaseUrl}/rest/v1/${table}?select=id,movie_id`,
  { method, headers: { prefer: "return=representation", "content-type": "application/json" }, body: JSON.stringify(body) },
] as const;

describe("no-write engine preview boundary", () => {
  it("simulates expected writes and duplicates without touching the upstream", async () => {
    const b = setup();
    const row = { user_id: "member", movie_id: 23, reason: "Taste match" };
    expect(await (await b.fetch(...write("recommendations", [row]))).json()).toEqual([{ ...row, id: "preview-23" }]);
    expect(await (await b.fetch(...write("recommendations", [row]))).json()).toEqual([]);
    for (const table of ["ai_logs", "events"]) await b.fetch(...write(table, { user_id: "member" }));
    await b.fetch(...write("movies", { id: 23 }));
    expect(b.upstream).not.toHaveBeenCalled();
    expect(b.rows()).toHaveLength(1);
    b.resetWrites();
    expect(b.rows()).toEqual([]);
  });
  it("blocks quota/profile changes, deletes, foreign users, RPCs and unknown origins", async () => {
    const b = setup();
    for (const [url, init] of [
      write("taste_profiles", { user_id: "member" }),
      write("users", { id: "member" }, "PATCH"),
      write("recommendations", {}, "DELETE"),
      write("recommendations", { user_id: "other", movie_id: 23 }),
      [`${databaseUrl}/rest/v1/rpc/consume_quota`, { method: "POST" }],
      ["https://other.example/", {}],
      [`${databaseUrl}/rest/v1/recommendations?user_id=eq.other`, {}],
      [`${databaseUrl}/rest/v1/recommendations`, {}],
    ] as Array<[string, RequestInit]>) await expect(b.fetch(url, init)).rejects.toThrow();
    expect(b.upstream).not.toHaveBeenCalled();
    expect(b.stats().blocked).toBe(8);
  });
  it("captures concurrent identical reads once and replays without network", async () => {
    const b = setup();
    const url = `${databaseUrl}/rest/v1/recommendations?user_id=eq.member`;
    const responses = await Promise.all([b.fetch(url), b.fetch(url)]);
    expect(await responses[0].json()).toEqual([]);
    expect(await responses[1].json()).toEqual([]);
    expect(b.upstream).toHaveBeenCalledTimes(1);
    b.setOffline();
    expect(await (await b.fetch(url)).json()).toEqual([]);
    await expect(b.fetch(`${url}&limit=1`)).rejects.toThrow("uncaptured");
    await expect(b.fetch(generationUrl, { method: "POST" })).rejects.toThrow("uncaptured");
    expect(b.upstream).toHaveBeenCalledTimes(1);
  });
  it("preserves different representation headers and enforces request budgets", async () => {
    const b = setup(2);
    const url = `${databaseUrl}/rest/v1/users?id=eq.member`;
    await b.fetch(url);
    await b.fetch(url, { headers: { accept: "application/vnd.pgrst.object+json" } });
    await expect(b.fetch(`${url}&select=region`)).rejects.toThrow("budget");
    expect(b.upstream).toHaveBeenCalledTimes(2);
    await b.drain();
  });
  it("records upstream failures even if a production fallback catches them", async () => {
    const b = setup();
    b.upstream.mockResolvedValue(new Response("private details", { status: 500 }));
    await expect(b.fetch("https://api.themoviedb.org/3/movie/23")).rejects.toThrow();
    expect(b.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.issues)).not.toContain("private details");
  });
});
