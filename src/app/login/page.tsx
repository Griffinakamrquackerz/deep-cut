"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import MarqueeBulbs from "@/components/MarqueeBulbs";

type Mode = "signin" | "signup" | "magic" | "forgot";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hidden until Google OAuth is actually configured in Supabase.
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1";

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
              : error.message,
          );
        } else {
          window.location.href = "/";
          return;
        }
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setError(error.message);
        else if (data.session) {
          window.location.href = "/";
          return;
        } else {
          setNotice("Almost in — check your email once to confirm your account. After that it's password sign-in forever.");
        }
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setError(error.message);
        else setNotice("Magic link sent — check your email and open it on this device.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
        });
        if (error) setError(error.message);
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
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(`Google sign-in isn't available yet — use email. (${error.message})`);
  }

  const needsPassword = mode === "signin" || mode === "signup";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      {/* Red velvet curtains part on entrance */}
      <div className="curtain curtain-l" aria-hidden />
      <div className="curtain curtain-r" aria-hidden />
      <MarqueeBulbs count={16} />
      <div className="relative text-center">
        {/* projector cone behind the marquee */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-56 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{ background: "radial-gradient(closest-side, rgba(255,180,84,0.22), transparent)" }}
        />
        <p className="eyebrow mb-2">Admit One</p>
        <h1 className="glow-amber font-display text-7xl tracking-wide text-amber">DEEP CUT</h1>
        <div className="film-strip mx-auto mt-3 w-40" />
        <p className="mt-3 font-mono text-xs text-dim">Movies you haven&apos;t met yet.</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
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
            {error && <p className="text-xs text-ticket">{error}</p>}
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
      <p className="mt-6 text-center font-mono text-[0.6rem] text-dim/80">
        By taking a seat you agree to the{" "}
        <a href="/terms" className="underline">Terms</a> &{" "}
        <a href="/privacy" className="underline">Privacy Policy</a>
      </p>
    </main>
  );
}
