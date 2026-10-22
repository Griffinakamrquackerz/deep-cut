"use client";
import { useEffect, useState } from "react";

// The monthly programme, on or off.
//
// It sits beside the push toggle because they answer the same question from a
// person's point of view — "how much does this app talk to me" — even though
// one is a browser permission and the other is a row in a table.
//
// Defaults to on: the unsubscribe link in every email is the real off switch,
// and this is mostly the way back for somebody who used it and changed their
// mind.

export default function ProgrammeEmailToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/email-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setOn(d ? d.programme !== false : true))
      .catch(() => alive && setOn(true));
    return () => {
      alive = false;
    };
  }, []);

  if (on === null) return null;

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next); // optimistic: a switch that lags feels broken
    const res = await fetch("/api/email-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programme: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) setOn(!next); // put it back rather than lie about the state
  }

  return (
    <div>
      <p className="eyebrow mb-2">The post</p>
      <button
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
        className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3 disabled:opacity-60"
      >
        <span className="text-left">
          <span className="block font-mono text-xs uppercase tracking-wider text-cream">
            ✉ Monthly programme
          </span>
          <span className="font-mono text-[0.6rem] text-dim">
            the new bill, once a month — nothing else
          </span>
        </span>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest ${
            on ? "border-avail text-avail" : "border-line text-dim"
          }`}
        >
          {busy ? "…" : on ? "On" : "Off"}
        </span>
      </button>
    </div>
  );
}
