"use client";
import { useCallback, useEffect, useState } from "react";

// The App Review account, from a screen.
//
// The password appears exactly once, on the run that sets it, and nothing
// stores it — so the panel makes a point of saying to copy it now. Losing it
// isn't a disaster (run it again) but discovering that mid-submission is
// annoying enough to warn about.

interface State {
  email: string;
  exists: boolean;
  hasPassword: boolean;
  lovedCount: number;
  servicesCount: number;
  activeRecs: number;
  premiumUntil: string | null;
  ready: boolean;
  blockers: string[];
}

interface Provisioned {
  email: string;
  password: string;
  created: boolean;
  lovedSeeded: number;
  recsDealt: number;
  notes: string[];
}

export default function AdminDemoAccount() {
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<Provisioned | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/demo-account", { cache: "no-store" });
    if (res.ok) setState(await res.json());
    else setErr("Couldn't read the review account's state.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function provision() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/demo-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) setResult(data);
    else setErr(data?.error ? `${data.error}${data.note ? ` — ${data.note}` : ""}` : "That didn't work.");
    setArmed(false);
    setBusy(false);
    void load();
  }

  if (!state) return <p className="font-mono text-xs text-dim">Checking the review account…</p>;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="eyebrow">For Apple</p>
        <h2 className="font-display text-3xl text-amber">APP REVIEW ACCOUNT</h2>
        <p className="mt-1 text-sm text-dim">
          The account a reviewer signs in with. It needs a real password, because Deep Cut&apos;s
          normal door is a magic link and a reviewer can&apos;t receive one.
        </p>
      </div>

      <div className="rounded border border-line bg-surface p-3">
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">Status</p>
        <p className="mt-1 font-mono text-sm text-cream">{state.email}</p>
        <p className={`mt-1 font-display text-2xl ${state.ready ? "text-amber" : "text-ticket"}`}>
          {state.ready ? "READY TO SUBMIT" : "NOT READY"}
        </p>
        {state.exists && (
          <p className="mt-1 font-mono text-[0.65rem] text-dim">
            {state.lovedCount} loved · {state.servicesCount} services · {state.activeRecs} recs
            waiting ·{" "}
            {state.premiumUntil && new Date(state.premiumUntil).getTime() > Date.now()
              ? "premium on"
              : "premium off"}
          </p>
        )}
        {state.blockers.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {state.blockers.map((b) => (
              <li key={b} className="font-mono text-[0.7rem] text-ticket">
                · {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      {result && (
        // Shown once. There is no second chance to read this.
        <div className="rounded border border-amber bg-amber/5 p-3">
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-amber">
            Copy this into App Store Connect now — it is not stored anywhere
          </p>
          <p className="mt-2 font-mono text-sm text-cream">Email: {result.email}</p>
          <p className="font-mono text-sm text-cream">Password: {result.password}</p>
          <p className="mt-2 font-mono text-[0.65rem] text-dim">
            {result.created ? "Account created" : "Account repaired"} · {result.lovedSeeded} films
            loved · {result.recsDealt} recs dealt
          </p>
          {result.notes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {result.notes.map((n) => (
                <li key={n} className="font-mono text-[0.68rem] text-ticket">
                  · {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!armed ? (
        <button
          onClick={() => setArmed(true)}
          className="self-start rounded border border-amber px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-amber"
        >
          {state.exists ? "Repair it / reset the password…" : "Create the review account…"}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-cream">
            {state.exists
              ? "This resets the password. If a review is in progress, the old one stops working."
              : "Create it?"}
          </span>
          <button
            onClick={() => void provision()}
            disabled={busy}
            className="rounded border border-amber bg-amber/10 px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-amber disabled:opacity-50"
          >
            {busy ? "Working — this makes an LLM call…" : "Yes, do it"}
          </button>
          <button
            onClick={() => setArmed(false)}
            disabled={busy}
            className="rounded border border-line px-3 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-dim"
          >
            Cancel
          </button>
        </div>
      )}

      {err && <p className="font-mono text-xs text-ticket">{err}</p>}
    </section>
  );
}
