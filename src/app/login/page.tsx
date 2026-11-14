"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Doorway from "@/components/site/Doorway";

type Mode = "signin" | "signup" | "magic" | "forgot";

/**
 * Where to land once signed in. Read from the URL at call time rather than via
 * useSearchParams, which would force this whole page behind a Suspense
 * boundary just to read one string. Only same-origin paths are honored — a
 * `next` that isn't a bare "/path" is an open-redirect waiting to happen.
 */
function nextPath(): string {
  if (typeof window === "undefined") return "/";
  const raw = new URLSearchParams(window.location.search).get("next") ?? "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Land on the form the link asked for. The landing page's "Take a seat"
  // sends people here to CREATE an account, and dropping them on a sign-in
  // form they have no credentials for is the fastest way to lose somebody who
  // had already decided to join. Read after mount, same reason as below.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "signup" || m === "magic" || m === "forgot") setMode(m);
  }, []);

  // /auth/confirm sends people back here with a reason when their link didn't
  // take. Read after mount rather than during render — the server has no
  // window, and seeding state from it would mismatch on hydration.
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("e");
    if (e === "expired") {
      setMode("magic");
      setError("That ticket had already been used, or it expired. Enter your email for a fresh one.");
    } else if (e === "badlink") {
      setMode("magic");
      setError("That link came through broken — mail apps sometimes clip them. Send yourself a new one.");
    }
  }, []);

  // Hidden until Google OAuth is actually configured in Supabase.
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1";

  // Turn raw auth errors into human copy — and never surface a bare/odd value.
  function friendly(raw: unknown): string {
    const msg = String((raw as { message?: unknown })?.message ?? raw ?? "").trim();
    if (/rate|too many/i.test(msg))
      return "Too many emails right now — give it a few minutes and try again.";
    if (/sending|confirmation email|smtp/i.test(msg) || msg === "0" || msg === "")
      return "We couldn't send your confirmation email — the email service may still need domain verification. Try again shortly.";
    if (/already registered|already exists/i.test(msg))
      return "That email already has an account. Try “Sign in” instead.";
    return msg;
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(
            /invalid/i.test(error.message)
              ? "Wrong email or password. If you originally joined via magic link, use “email me a magic link” once, then set a password in Settings."
              : friendly(error),
          );
        } else {
          window.location.href = nextPath();
          return;
        }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
          },
        });
        if (error) {
          // Velvet rope: public signups are switched off in Supabase — point
          // people at the waitlist instead of showing a raw auth error.
          setError(
            /not allowed|disabled|signups/i.test(error.message)
              ? "The house is invite-only right now. Join the waitlist on the front page — we seat a new row every day. 🎟"
              : friendly(error),
          );
        }
        else if (data.session) {
          window.location.href = nextPath();
          return;
        } else {
          setNotice("Almost in — check your email once to confirm your account. After that it's password sign-in forever.");
        }
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
          },
        });
        if (error) setError(friendly(error));
        else setNotice("Magic link sent — check your email and open it on this device.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
        });
        if (error) setError(friendly(error));
        else setNotice("Password reset link sent — check your email.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });
    if (error) setError(`Google sign-in isn't available yet — use email. (${error.message})`);
  }

  const needsPassword = mode === "signin" || mode === "signup";

  return (
    <Doorway
      split
      reel="Admit one"
      slate={mode === "signup" ? "Take a seat" : "Welcome back"}
      title={
        <>
          Deep <em>Cut.</em>
        </>
      }
      lede={
        <>
          <span className="lp-serif" style={{ fontSize: "1.5em", lineHeight: 1.15, color: "var(--color-cream)" }}>
            Movies you haven&apos;t seen yet.
          </span>
          <br />
          And a say in the ones that don&apos;t exist yet.
        </>
      }
    >
      {/* Red velvet curtains part on entrance */}
      <div className="curtain curtain-l" aria-hidden />
      <div className="curtain curtain-r" aria-hidden />

      <div className="lp-doorway-card flex w-full flex-col gap-3">
        {(mode === "signin" || mode === "signup") && (
          <div className="flex gap-1 rounded border border-line bg-surface p-1">
            <button
              onClick={() => switchMode("signin")}
              aria-pressed={mode === "signin"}
              className={`flex-1 rounded px-2 py-2 font-mono text-[0.65rem] uppercase tracking-wider ${
                mode === "signin" ? "bg-bg text-amber" : "text-dim"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => switchMode("signup")}
              aria-pressed={mode === "signup"}
              className={`flex-1 rounded px-2 py-2 font-mono text-[0.65rem] uppercase tracking-wider ${
                mode === "signup" ? "bg-bg text-amber" : "text-dim"
              }`}
            >
              Create account
            </button>
          </div>
        )}
        {mode === "signup" && (
          <p className="text-center font-mono text-[0.6rem] uppercase tracking-widest text-dim">
            Invite-only — got a ticket email? Use its link. Otherwise{" "}
            <a href="/" className="text-amber underline">
              join the waitlist
            </a>
            .
          </p>
        )}

        {(mode === "magic" || mode === "forgot") && (
          <p className="eyebrow text-center">
            {mode === "magic" ? "Magic link sign-in" : "Reset your password"}
          </p>
        )}

        {notice ? (
          <p className="ticket-edge rounded p-4 text-center text-sm text-cream">{notice}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="eyebrow" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
            />
            {needsPassword && (
              <>
                <label className="eyebrow" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "8+ characters" : "••••••••"}
                  className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
                />
              </>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-amber px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-50"
            >
              {busy
                ? "…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "magic"
                      ? "Send magic link"
                      : "Send reset link"}
            </button>
            {googleEnabled && (
              <button
                type="button"
                onClick={googleSignIn}
                className="rounded border border-line bg-surface px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-cream"
              >
                Continue with Google
              </button>
            )}
            {error ? <p className="text-xs text-ticket">{error}</p> : null}
          </form>
        )}

        <div className="mt-1 flex flex-col gap-1 text-center font-mono text-[0.65rem] text-dim">
          {mode !== "magic" && (
            <button onClick={() => switchMode("magic")} className="underline">
              email me a magic link instead
            </button>
          )}
          {mode === "signin" && (
            <button onClick={() => switchMode("forgot")} className="underline">
              forgot password?
            </button>
          )}
          {(mode === "magic" || mode === "forgot") && (
            <button onClick={() => switchMode("signin")} className="underline">
              ← back to password sign-in
            </button>
          )}
        </div>
      </div>
      <p className="mt-5 text-center font-mono text-[0.6rem] text-dim/80">
        By taking a seat you agree to the{" "}
        <a href="/terms" className="underline">Terms</a> &{" "}
        <a href="/privacy" className="underline">Privacy Policy</a>
      </p>
    </Doorway>
  );
}
