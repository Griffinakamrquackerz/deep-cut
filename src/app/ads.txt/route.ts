// AdSense requires /ads.txt at the domain root. Generated from the same env
// var that turns on the ad units, so there's nothing to keep in sync.
import { ADSENSE_PUB } from "@/lib/adsense";

export function GET() {
  // ADSENSE_PUB is already the bare `pub-…` form with whitespace stripped.
  // This used to do `client.replace(/^ca-/, "")`, which produced a
  // correct-looking line from a value that was missing the `ca-` prefix
  // entirely — so ads.txt passed the eye test while the loader and the
  // ownership meta tag were both wrong.
  if (!ADSENSE_PUB) return new Response("not configured", { status: 404 });
  return new Response(`google.com, ${ADSENSE_PUB}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain" },
  });
}
