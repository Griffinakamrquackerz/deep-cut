"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { campaignFor, type Campaign } from "@/lib/campaign";
import type { RoundStatus } from "@/lib/voting";

// The house call — the one thing the house is asking of you today.
//
// Deliberately NOT an AdSlot house ad. Those rotate by a fixed index passed at
// each placement, so appending to that array adds an entry nothing ever
// renders; and a call for scripts shouldn't be one of five things competing
// for the same box anyway. This sits above the feed, says one thing, and can
// be dismissed.
//
// It shows to MEMBERS TOO, unlike an ad. Paying for the app removes
// advertising; it doesn't mean we stop telling you the ballot is open. That's
// house business, not an advert — which is also why dismissal is remembered
// per campaign rather than forever: dismissing the open call for scripts
// should not silently hide the vote three months later.

const DISMISS_PREFIX = "dc-housecall-dismissed:";

export default function HouseCall({ className = "" }: { className?: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume hidden until we've read storage

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/round", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          round?: { status?: RoundStatus } | null;
          pitches?: unknown[];
        };
        const next = campaignFor(data.round?.status, data.pitches?.length ?? 0);
        if (!alive || !next) return;
        setCampaign(next);
        // localStorage throws in some privacy modes; a marquee is never worth
        // a crashed page, so a failed read just shows it.
        try {
          setDismissed(localStorage.getItem(DISMISS_PREFIX + next.key) === "1");
        } catch {
          setDismissed(false);
        }
      } catch {
        // Offline, or the round endpoint is unhappy. Render nothing.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!campaign || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_PREFIX + campaign.key, "1");
    } catch {
      // Dismissal won't survive a reload. Acceptable.
    }
  };

  return (
    <aside className={`film-card relative rounded-lg p-4 sm:p-5 ${className}`}>
      <button
        onClick={hide}
        aria-label="Dismiss"
        className="absolute right-2 top-2 px-2 py-1 font-mono text-xs text-dim hover:text-cream"
      >
        ✕
      </button>
      <p className="eyebrow">{campaign.eyebrow}</p>
      <p className="glow-amber mt-1 font-display text-3xl leading-none text-amber sm:text-4xl">
        {campaign.title}
      </p>
      <p className="mt-2 max-w-prose text-sm text-dim">{campaign.line}</p>
      <Link
        href={campaign.path}
        className="mt-4 inline-block rounded border border-amber px-5 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-amber"
      >
        {campaign.cta} →
      </Link>
    </aside>
  );
}
