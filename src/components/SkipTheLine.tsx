"use client";
import { useState } from "react";
import { tierFor } from "@/lib/perks";
import { premiumMonthsFor } from "@/lib/fund";
import { haptic } from "@/lib/sfx";

// Pay at the box office and walk in tonight.
//
// The line exists to throttle signups, not to punish anybody, so there's no
// reason a person who wants in now can't just be let in now. The money isn't a
// queue-jumping fee dressed up as support either — it goes through the exact
// same door as every other donation: 60% into the Fund, and it earns the same
// votes and the same perks at the same tiers. Somebody who gives $25 to skip
// the line gets their name in the credits, same as somebody who gives $25 after
// they're already inside. That's the honest version, and it's also the reason
// this doesn't feel gross.
//
// Nothing is created here. This posts to /api/skip-line, which only opens a
// Stripe Checkout session; the account gets made by the webhook once the money
// has actually arrived. So mashing this button costs nothing and grants
// nothing.

/** The rungs on offer. Chosen to line up with the credit tiers, not invented
 *  for this widget — the third one is where your name goes on the picture. */
const AMOUNTS = [500, 2_500, 10_000];

const money = (cents: number) => `$${Math.floor(cents / 100)}`;

export default function SkipTheLine({ email: initialEmail = "" }: { email?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [cents, setCents] = useState(2_500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/skip-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amountCents: cents }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.status === 503) {
        setError("The box office is closed right now. Your spot in line still stands.");
      } else if (!res.ok || !data?.url) {
        setError("Couldn't open the till — try again in a second.");
      } else {
        haptic(20);
        // Straight to Stripe. Not a new tab: a payment that opens behind the
        // page is a payment somebody loses track of.
        window.location.href = data.url;
        return; // leave `busy` on — the page is going away
      }
    } catch {
      setError("Couldn't reach the box office — try again in a second.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block font-mono text-[0.65rem] uppercase tracking-[0.15em] text-amber underline decoration-amber/40 underline-offset-4"
      >
        Don&apos;t want to wait? Walk up to the box office →
      </button>
    );
  }

  const tier = tierFor(cents);

  return (
    <form
      onSubmit={go}
      className="mx-auto w-full max-w-xs rounded-lg border border-amber/30 bg-amber/5 p-4 text-center"
    >
      <p className="eyebrow text-ticket">Skip the line</p>
      <p className="mt-1.5 text-[0.8rem] leading-relaxed text-cream">
        Support the house and we&apos;ll seat you tonight. Your ticket email
        lands within a minute of paying.
      </p>

      <div className="mt-3 flex gap-1.5" role="group" aria-label="Amount">
        {AMOUNTS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCents(c)}
            aria-pressed={cents === c}
            className={`flex-1 rounded border py-2.5 font-mono text-sm transition-colors ${
              cents === c
                ? "border-amber bg-amber text-bg"
                : "border-line bg-bg/60 text-cream"
            }`}
          >
            {money(c)}
          </button>
        ))}
      </div>

      {/* What the money does, restated at whatever they've picked. The tier
          name and the vote count are both real — this is the same ledger the
          Fund page describes, not a separate "queue fee". */}
      <p className="mt-2 font-mono text-[0.6rem] leading-relaxed text-dim">
        {tier ? <span className="text-amber">{tier.name}</span> : null}
        {tier?.credit ? ` · credited as ${tier.credit}` : null}
        <br />
        {Math.floor(cents / 100)} vote{cents >= 200 ? "s" : ""} ·{" "}
        {premiumMonthsFor(cents)} month{premiumMonthsFor(cents) === 1 ? "" : "s"} of the
        full app · 60% into the Fund
      </p>

      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        aria-label="Email for your ticket"
        autoComplete="email"
        className="mt-3 w-full rounded border border-line bg-bg/80 px-3 py-3 text-sm text-cream placeholder:text-dim/60 focus:border-amber focus:outline-none"
      />

      <button
        type="submit"
        disabled={busy}
        className="mt-2 w-full rounded bg-amber py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-bg disabled:opacity-60"
      >
        {busy ? "Opening the till…" : `Support ${money(cents)} · get seated`}
      </button>

      {error && (
        <p className="mt-2 text-center font-mono text-[0.65rem] text-ticket">{error}</p>
      )}

      <p className="mt-2 text-center font-mono text-[0.55rem] uppercase tracking-widest text-dim">
        One payment, not a subscription · not an investment · nothing held in
        escrow
      </p>
    </form>
  );
}
