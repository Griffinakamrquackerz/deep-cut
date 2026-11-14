// Unit tests for the preview network boundary's capture/replay, run without network.
import { describe, expect, it, vi } from "vitest";
import { createPreviewBoundary, type PreviewCapture } from "./preview-boundary";

const databaseUrl = "https://db.example.com";
const generationUrl = "https://llm.example.com/chat/completions";
const userId = "user-1";

function tmdbUrl(page: number) {
  return `https://api.themoviedb.org/3/discover/movie?page=${page}`;
}

function makeBoundary(fetchImpl: typeof globalThis.fetch) {
  return createPreviewBoundary({ databaseUrl, userId, generationUrl, fetch: fetchImpl });
}

describe("preview boundary capture/replay", () => {
  it("replays a capture with zero network calls", async () => {
    const liveFetch = vi.fn(async () => new Response(JSON.stringify({ page: 1, results: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const live = makeBoundary(liveFetch as unknown as typeof fetch);
    const original = await (await live.fetch(tmdbUrl(1))).text();
    await live.drain();
    expect(liveFetch).toHaveBeenCalledTimes(1);
    const capture = live.dump();
    expect(capture.version).toBe(1);
    expect(capture.reads).toHaveLength(1);
    expect(capture.reads[0].hash).toMatch(/^[0-9a-f]{64}$/);

    const replayFetch = vi.fn();
    const replayBoundary = makeBoundary(replayFetch as unknown as typeof fetch);
    replayBoundary.loadCapture(capture);
    const replayed = await (await replayBoundary.fetch(tmdbUrl(1))).text();
    expect(replayed).toBe(original);
    expect(replayFetch).not.toHaveBeenCalled();
    expect(replayBoundary.issues).toEqual([]);
  });

  it("fails loudly on an uncaptured request in replay", async () => {
    const replayBoundary = makeBoundary(vi.fn() as unknown as typeof fetch);
    replayBoundary.loadCapture({ version: 1, reads: [{ hash: "a".repeat(64), status: 200, text: "{}" }] });
    await expect(replayBoundary.fetch(tmdbUrl(2))).rejects.toThrow("Offline replay requested uncaptured data");
    expect(replayBoundary.issues).toContain("Offline replay requested uncaptured data");
  });

  it("keys generation requests by body: a different prompt cannot alias a capture", async () => {
    const liveFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    const live = makeBoundary(liveFetch as unknown as typeof fetch);
    await live.fetch(generationUrl, { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "first" }] }) });
    await live.drain();
    const capture = live.dump();
    expect(capture.reads).toHaveLength(1);

    const replayBoundary = makeBoundary(vi.fn() as unknown as typeof fetch);
    replayBoundary.loadCapture(capture);
    await expect(replayBoundary.fetch(generationUrl, {
      method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "second" }] }),
    })).rejects.toThrow("Offline replay requested uncaptured data");
    // The identical body still replays.
    await expect(replayBoundary.fetch(generationUrl, {
      method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "first" }] }),
    })).resolves.toBeInstanceOf(Response);
  });

  it("rejects malformed captures", () => {
    const boundary = makeBoundary(vi.fn() as unknown as typeof fetch);
    expect(() => boundary.loadCapture({ version: 2, reads: [] } as unknown as PreviewCapture)).toThrow("Invalid preview capture");
    expect(() => boundary.loadCapture({
      version: 1, reads: [{ hash: "not-a-hash", status: 200, text: "{}" }],
    })).toThrow("Malformed preview capture entry");
  });

  it("never stores credentials in a capture", async () => {
    const live = makeBoundary(vi.fn(async () => new Response("{}", {
      status: 200, headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch);
    await live.fetch("https://api.themoviedb.org/3/movie/1?api_key=SECRET_KEY_VALUE");
    await live.fetch(`https://db.example.com/rest/v1/loved_movies?user_id=eq.${userId}&select=SECRET`);
    await live.drain();
    const capture = JSON.stringify(live.dump());
    expect(capture).not.toContain("SECRET_KEY_VALUE");
    expect(capture).not.toContain("SECRET");
    expect(capture).not.toContain(userId);
  });
});
