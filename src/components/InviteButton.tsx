"use client";
import { useState } from "react";
import { sfxPop } from "@/lib/sfx";

const PITCH = "Deal me in 🎬 Deep Cut finds movies you haven't met yet — an AI ticket-dealer that reads your taste. Free, takes 2 minutes:";

/**
 * Invite-a-friend share. Native share sheet on phones, clipboard fallback.
 * `card` renders the full ticket-stub treatment; default is a plain button.
 */
export default function InviteButton({ card = false }: { card?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function invite() {
    sfxPop();
    const url = window.location.origin;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "invite_shared", props: {} }),
    });
    if (navigator.share) {
      await navigator.share({ title: "Deep Cut", text: PITCH, url }).catch(() => null);
    } else {
      await navigator.clipboard.writeText(`${PITCH} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  if (!card) {
    return (
      <button
        onClick={() => void invite()}
        className="rounded border border-ticket px-3 py-2 font-mono text-xs uppercase tracking-widest text-ticket glow-ticket"
      >
        {copied ? "Copied ✓" : "📣 Invite friends"}
      </button>
    );
  }

  return (
    <div className="ticket-edge rounded bg-surface p-4 text-center">
      <p className="eyebrow text-ticket">Plus-ones welcome</p>
      <p className="font-display text-2xl leading-tight text-cream">
        MOVIE NIGHT&apos;S BETTER WITH RIVALS
      </p>
      <p className="mt-1 text-sm text-dim">
        Send a friend their ticket — when they join, their taste card and watches light up
        your marquee.
      </p>
      <button
        onClick={() => void invite()}
        className="pulse-cta mt-3 w-full rounded bg-ticket px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream"
      >
        {copied ? "Link copied ✓" : "📣 Send a ticket"}
      </button>
    </div>
  );
}
