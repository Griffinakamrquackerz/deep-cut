"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// The Fund, as a bar.
//
// This is the pitch, so it says the true version of it plainly: a share of what
// the house takes in goes into a pot, and when the pot clears the bar a feature
// gets made and premieres here. Members earn votes on which one.
//
// Words that are not used here, and shouldn't be: invest, equity, share,
// stake, returns, stock. Backers get a vote and a credit, not a financial
// interest — that distinction is what makes this ordinary crowdfunding rather
// than an unregistered securities offering, and copy is where it gets lost.

interface Fund {
  ready: boolean;
  sharePct: number;
  raisedCents?: number;
  goalCents?: number;
  percent?: number;
  funded?: boolean;
  backers?: number;
  mine?: { points: number; pointCap: number; atCap: boolean } | null;
}

const money = (cents: number) =>
  `$${Math.floor(cents / 100).toLocaleString("en-US")}`;

export default function FundBar({ compact = false }: { compact?: boolean }) {
  const [fund, setFund] = useState<Fund | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/fund")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setFund(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to show until the ledger exists. A bar at 0% with no explanation
  // reads as a dead project rather than a new one.
  if (!fund?.ready) return null;

  const pct = fund.percent ?? 0;
  const raised = fund.raisedCents ?? 0;
  const goal = fund.goalCents ?? 0;

  return (
    <div className="rounded-lg border border-amber/30 bg-amber/5 p-4">
      <p className="eyebrow text-ticket">The Indie Film Fund</p>

      {!compact && (
        <p className="mt-1.5 text-sm leading-relaxed text-cream">
          {fund.sharePct}% of everything members put in finances an independent
          filmmaker&apos;s feature. We read every pitch that comes in;{" "}
          <span className="text-amber">members choose which one gets made</span>. It
          premieres here as a Deep Cut Original.
        </p>
      )}

      <div className="mt-3">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-bg"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress toward funding the next feature"
        >
          <div
            className="h-full rounded-full bg-amber transition-[width] duration-700"
            style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
          />
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="font-mono text-[0.7rem] text-cream">
            <span className="text-amber">{money(raised)}</span>
            <span className="text-dim"> of {money(goal)}</span>
          </p>
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">
            {fund.funded
              ? "funded — voting open"
              : `${Math.round(pct)}%${fund.backers ? ` · ${fund.backers} backers` : ""}`}
          </p>
        </div>

        {/* What the number does and doesn't cover, beside the number.
            This lived as answer five of six in the /fund FAQ, which is the one
            place a person deciding at the button will never read. A goal that
            stops at the shoot is how crowd-funded features die finished and
            undeliverable, so the promise that it doesn't has to travel with the
            bar rather than wait to be looked up. */}
        {!compact && (
          <p className="mt-2 font-mono text-[0.6rem] leading-relaxed text-dim">
            The goal funds the shoot. The house funds post, delivery and E&amp;O
            out of its {100 - fund.sharePct}% &mdash; nobody gets handed a
            finished film they can&apos;t release.
          </p>
        )}
      </div>

      {/* One footer, one rule. The votes line and the way onward were two
          separately-bordered blocks, which stacked into a double divider the
          moment somebody actually had votes. */}
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5">
        {fund.mine && fund.mine.points > 0 && (
          <p className="font-mono text-[0.65rem] text-dim">
            You hold{" "}
            <span className="text-amber">
              {fund.mine.points} vote{fund.mine.points === 1 ? "" : "s"}
            </span>
            {fund.mine.atCap
              ? " — the maximum any one member can hold."
              : ` toward the next Deep Cut Original (max ${fund.mine.pointCap}).`}
          </p>
        )}
        <Link
          href="/fund"
          className="flex items-center justify-between gap-2 font-mono text-[0.6rem] uppercase tracking-widest text-amber"
        >
          <span>How it works · what you get</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
