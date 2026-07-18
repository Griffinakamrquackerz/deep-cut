// Canonical public origin for absolute links (OG image/url meta, push deep
// links, share URLs). NEXT_PUBLIC_APP_URL is honored EXCEPT when it points at a
// *.vercel.app host: those preview deployments rotate and 404, which would
// poison link previews (broken image, dead click-through) and notification
// deep links. Fall back to the real domain in that case so a stale env var
// can't quietly break sharing.
const CANONICAL = "https://thedeepcut.xyz";

export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!env || /vercel\.app/i.test(env)) return CANONICAL;
  return env.replace(/\/+$/, "");
}
