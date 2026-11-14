"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Doorway from "@/components/site/Doorway";

// Landing page for password-recovery links (and for setting a first password).
export default function ResetPasswordPage() {
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      setReady(data.user ? "ok" : "no-session");
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else window.location.href = "/";
  }

  return (
    <Doorway
      reel="The door"
      slate="Lost your ticket"
      title={
        <>
          A new <em>password.</em>
        </>
      }
    >

      {ready === "checking" && (
        <p className="animate-pulse text-center font-mono text-xs text-dim">checking your link…</p>
      )}

      {ready === "no-session" && (
        <div className="ticket-edge rounded p-4 text-center text-sm text-cream">
          This reset link is expired or already used.{" "}
          <a href="/login" className="text-amber underline">
            Request a fresh one
          </a>
          .
        </div>
      )}

      {ready === "ok" && (
        <form onSubmit={save} className="lp-doorway-card flex w-full flex-col gap-3">
          <label className="eyebrow" htmlFor="pw">
            New password
          </label>
          <input
            id="pw"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ characters"
            className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />
          <label className="eyebrow" htmlFor="pw2">
            Confirm it
          </label>
          <input
            id="pw2"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-amber px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save & enter"}
          </button>
          {error && <p className="text-xs text-ticket">{error}</p>}
        </form>
      )}
    </Doorway>
  );
}
