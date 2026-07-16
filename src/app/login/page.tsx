"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function googleSignIn() {
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <p className="eyebrow mb-2">Admit One</p>
        <h1 className="font-display text-6xl tracking-wide text-amber">DEEP CUT</h1>
        <p className="mt-2 font-mono text-xs text-dim">Movies you haven&apos;t met yet.</p>
      </div>

      {sent ? (
        <p className="ticket-edge max-w-xs rounded p-4 text-center text-sm text-cream">
          Check your email — your ticket is printing. Open the link on this device.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="flex w-full max-w-xs flex-col gap-3">
          <label className="eyebrow" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />
          <button
            type="submit"
            className="rounded bg-amber px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-bg"
          >
            Send magic link
          </button>
          <button
            type="button"
            onClick={googleSignIn}
            className="rounded border border-line bg-surface px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-cream"
          >
            Continue with Google
          </button>
          {error && <p className="text-xs text-ticket">{error}</p>}
        </form>
      )}
    </main>
  );
}
