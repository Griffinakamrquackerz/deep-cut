import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh.
//
// This runs in front of every page, so whatever it does, the whole site pays
// for — and if it hangs, the whole site 504s with MIDDLEWARE_INVOCATION_TIMEOUT
// rather than merely being slow. Two rules follow from that.
//
// First: don't call the auth server unless there's a session to refresh. It
// used to call getUser() unconditionally, which meant every signed-out visitor,
// every crawler and every hit on a public film page waited on a network round
// trip to refresh a session that didn't exist.
//
// Second: never let that call decide whether the page renders. A slow auth
// server should cost a stale cookie for one request, not a 504 — so it races a
// timeout and gives up quietly.

/** How long the refresh gets before the page goes on without it. */
const AUTH_TIMEOUT_MS = 2500;

/**
 * Is there a Supabase session cookie at all?
 *
 * Supabase names these `sb-<project-ref>-auth-token`, and splits large ones
 * across `.0`, `.1` and so on — matching the prefix and the suffix catches
 * every shape without hard-coding the project reference.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Nothing signed in: nothing to refresh, and no reason to make the visitor
  // wait on Supabase to find that out.
  if (!hasSessionCookie(request)) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Fail open. If the refresh doesn't land in time the request continues with
  // the cookie it arrived with: at worst this one request reads as signed out,
  // which every route already handles, and the next one refreshes normally.
  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((resolve) => setTimeout(resolve, AUTH_TIMEOUT_MS)),
    ]);
  } catch {
    /* a failed refresh is not a failed page */
  }

  return response;
}

export const config = {
  // Static assets were already excluded. Also skipped now: the files a browser
  // or crawler fetches on its own — a service worker, a manifest, an icon,
  // robots and sitemap — none of which have a session, and one of which
  // (sw.js) is fetched repeatedly in the background.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|api/icon|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
