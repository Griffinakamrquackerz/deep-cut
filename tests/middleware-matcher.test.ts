import { describe, it, expect } from "vitest";

// The matcher decides what the whole site pays the auth-refresh tax on. It is
// one long negative lookahead, which is exactly the kind of regex that quietly
// stops matching what you meant — so it gets pinned.
const MATCHER =
  /^\/((?!_next\/static|_next\/image|favicon\.ico|sw\.js|manifest\.webmanifest|robots\.txt|sitemap\.xml|api\/icon|api\/version|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)$/;

const runs = (path: string) => MATCHER.test(path);

describe("middleware matcher: skips what has no session", () => {
  for (const path of [
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/sw.js", // fetched repeatedly in the background
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/api/icon/192",
    "/api/version", // the health probe must never wait on auth
    "/scene/room.jpg",
    "/og.png",
  ]) {
    it(`skips ${path}`, () => expect(runs(path)).toBe(false));
  }
});

describe("middleware matcher: still runs where a session matters", () => {
  for (const path of [
    "/",
    "/tv",
    "/lobby",
    "/you",
    "/settings",
    "/m/155",
    "/u/griffin",
    "/unsubscribe",
    "/api/feed",
    "/api/notifications",
    "/api/tonight",
    "/api/share/film",
    "/api/admin/inbox-check",
  ]) {
    it(`runs on ${path}`, () => expect(runs(path)).toBe(true));
  }
});
