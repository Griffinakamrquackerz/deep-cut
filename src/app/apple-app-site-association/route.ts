// The file iOS fetches to decide whether thedeepcut.xyz links may open the app.
//
// Without this, an invite email is just a web page: iOS opens it in Safari, the
// person is signed in on mobile web, and the App Store install still shows the
// login wall. That was the state of things until now — the domain returned 404
// here and app.json had no associatedDomains — which meant the App Store
// listing converted installs into nothing.
//
// Served from a route handler rather than dropped in /public for one reason:
// Apple requires application/json, and a public file with no extension is
// served as application/octet-stream, which iOS rejects silently. next.config
// rewrites /.well-known/apple-app-site-association here as well, because that
// is the path Apple actually prefers; both work.
//
// The team id is NOT in the repo. It belongs to the Apple developer account —
// Jake's — and this file is public, so it lives in an env var and this route
// answers 404 until it's set. A 404 is the honest response: without the team
// id there is no valid association to publish, and serving a malformed one
// would have iOS cache a failure.

export const dynamic = "force-dynamic";

/**
 * Which paths may open the app.
 *
 * Deliberately narrow. `*` would hand every page on the website to the app,
 * including the whole marketing site and every film page — so somebody tapping
 * a shared film link would get bounced into an app they may not have set up,
 * and /fund would open inside the app, which is exactly the 3.1.1 problem we
 * just spent the morning removing.
 *
 * /auth/confirm is the one link that has to reach the app: it's the invite,
 * and the app can now complete it itself (see createSessionFromUrl's
 * token_hash branch in deep-cut-native/src/lib/authLink.ts).
 */
const PATHS = ["/auth/confirm", "/auth/confirm?*"];

export function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || "").trim();
  const bundleId = (process.env.APPLE_BUNDLE_ID || "xyz.thedeepcut.app").trim();

  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    return new Response(
      "APPLE_TEAM_ID is not set, so there is no association to publish.\n",
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }

  const body = {
    applinks: {
      // Empty, and required to be: Apple removed the older `apps` key's
      // meaning but still expects the field present.
      apps: [],
      details: [{ appID: `${teamId}.${bundleId}`, paths: PATHS }],
    },
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      // iOS fetches this through Apple's CDN and caches it. A day is long
      // enough to be cheap and short enough that fixing a mistake doesn't
      // take a week.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
