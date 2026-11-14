"use client";
import { useState } from "react";
import { sfxChime, haptic } from "@/lib/sfx";
import SkipTheLine from "./SkipTheLine";

// The velvet rope's clipboard. Email in → spot in line out. The `note` input
// is a honeypot (hidden from humans, filled by bots). Success flips the form
// into a numbered ticket stub — your place in line IS the souvenir.

export default function WaitlistForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: string;
    position: number;
    /** Did a confirmation email actually go out? Only then do we promise one. */
    emailed: boolean;
    /** False on a repeat submit — they were already holding this stub. */
    isNew: boolean;
  } | null>(null);

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const hp = (new FormData(e.currentTarget).get("hp") as string) ?? "";
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hp }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError("That email didn't take — check it and try again.");
      } else {
        haptic([20, 30, 20]);
        sfxChime();
        setResult({
          status: data.status,
          position: data.position ?? 0,
          emailed: data.emailed === true,
          isNew: data.isNew !== false,
        });
      }
    } catch {
      setError("The line hiccuped — try again in a second.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
      <div className="ticket-edge rounded bg-surface p-4 text-center">
        {result.status === "approved" ? (
          <>
            <p className="font-display text-2xl text-amber">YOU&apos;RE ALREADY ON THE LIST ★</p>
            <p className="mt-1 text-sm text-cream">
              Check your inbox — your ticket&apos;s been sent (peek in spam if it&apos;s hiding).
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">Admit one · hold this stub</p>
            <p className="glow-amber mt-1 font-display text-5xl text-amber">
              #{result.position}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-cream">
              {result.emailed
                ? "You're in line. Check your inbox — we just emailed your stub (peek in spam if it's hiding)."
                : result.isNew
                  ? "You're in line. Nothing to do — your ticket arrives by email when it's your turn."
                  : "You were already in line — this is your spot, unchanged."}
            </p>
            <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
              We seat a new row daily · your ticket arrives by email when it&apos;s your turn
            </p>
          </>
        )}
      </div>
      {/* Offered here rather than before they've joined, on purpose: the number
          is what makes the offer mean anything. #4 doesn't need this. #400
          might. Either way their spot in line is already saved, so nobody is
          being made to choose between paying and waiting. */}
      {result.status !== "approved" && <SkipTheLine email={email} />}
      </div>
    );
  }

  return (
    <form onSubmit={join} className="mx-auto flex w-full max-w-xs flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="Email for the waitlist"
          autoComplete="email"
          className="min-w-0 flex-1 rounded border border-line bg-bg/80 px-3 py-3 text-sm text-cream placeholder:text-dim/60 focus:border-amber focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className={`${compact ? "" : "pulse-cta"} shrink-0 rounded bg-ticket px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream disabled:opacity-60`}
        >
          {busy ? "…" : "🎟 Get in line"}
        </button>
      </div>
      {/* Honeypot — humans never see it; bots can't resist it. Named `hp`, not
          `note`: browsers and password managers autofill plausible-looking
          field names even with autoComplete="off", and an autofilled trap
          silently drops a real signup. */}
      <input
        type="text"
        name="hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
      {error && <p className="text-center font-mono text-[0.65rem] text-ticket">{error}</p>}
      <p className="text-center font-mono text-[0.6rem] uppercase tracking-widest text-dim">
        Invite-only · a new row is seated daily
      </p>
    </form>
  );
}
