// Reading what a video platform says it would do.
//
// Lives here rather than in the route that uses it because a Next.js route
// file may only export route handlers — exporting anything else fails the
// build, which is how this arrived. Pure logic belongs in lib anyway; it's the
// only shape a test can reach.

export type Verdict = "ok" | "blocked" | "age_restricted" | "gone" | "unknown";

/**
 * Age restriction, told apart from being rate-limited.
 *
 * Both come back as LOGIN_REQUIRED, and only the reason string separates them:
 *
 *   "Sign in to confirm your age"          → genuinely age-gated. Broken here.
 *   "Sign in to confirm you're not a bot"  → YouTube throttling whoever asked.
 *                                            Says nothing about the video.
 *
 * Conflating those would archive perfectly good films on an afternoon when a
 * serverless IP happens to be under suspicion, so the second answer is
 * reported as "unknown" and changes nothing.
 */
export function readPlayability(status: string, reason: string): { verdict: Verdict; detail: string } {
  const r = reason.toLowerCase();
  if (/confirm your age|age.?restrict/.test(r)) {
    return { verdict: "age_restricted", detail: "age-gated — will not play embedded" };
  }
  if (/not a bot|unusual traffic|sign in to confirm you/.test(r)) {
    return { verdict: "unknown", detail: "YouTube rate-limited us — says nothing about the film" };
  }
  if (status === "OK") return { verdict: "ok", detail: "plays" };
  if (status === "UNPLAYABLE") return { verdict: "blocked", detail: reason || "unplayable" };
  if (status === "ERROR") return { verdict: "gone", detail: reason || "no such video" };
  if (status === "LOGIN_REQUIRED") return { verdict: "blocked", detail: reason || "sign-in required" };
  return { verdict: "unknown", detail: `${status}: ${reason}` };
}

