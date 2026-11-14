"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/sfx";

// The real ballot.
//
// Until now this existed as an API with nothing calling it and a hardcoded demo
// on the Fund page — the site described a mechanism nobody could use. This is
// that mechanism.
//
// Three rules it has to hold to:
//
//  1. You cannot allocate votes you don't have. The slider clamps to what's
//     left rather than letting you overspend and then complaining, and the
//     server re-derives the budget from the fund ledger anyway. The clamp is a
//     courtesy; the server check is the actual rule.
//  2. It saves what you land on, not each nudge. The Fund page promises exactly
//     that, so the save is debounced — drag all you like, one write.
//  3. A save that fails says so. An autosave that quietly loses somebody's
//     ballot is worse than a Save button, because they have no reason to doubt
//     it worked.
//
// Reading is public. Anyone can see every pitch and the running totals without
// an account, because the ballot is the best argument for joining.

interface Pitch {
  id: string;
  title: string;
  director: string;
  logline: string;
  synopsis: string;
  genre: string | null;
  comps: string | null;
  oneSheetUrl: string | null;
  deckUrl: string | null;
  priorWorkUrl: string | null;
  directorPhotoUrl: string | null;
}

interface RoundData {
  round: {
    id: string;
    title: string;
    status: "collecting" | "voting" | "greenlit" | "closed";
    closesAt: string | null;
    winnerPitchId: string | null;
  } | null;
  fund: { raisedCents: number; goalCents: number; percent: number; funded: boolean } | null;
  pitches?: Pitch[];
  tallies?: Array<{ pitchId: string; votes: number; backers: number }>;
  me?: { budget: number; spent: number; remaining: number; ballot: Record<string, number> } | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 900;

export default function Ballot() {
  const [data, setData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last allocation the server acknowledged. A failed save has to be
  // retryable, and "what did they actually have saved" is not recoverable from
  // component state alone once an edit is in flight.
  const committed = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    void fetch("/api/round")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RoundData | null) => {
        if (!alive) return;
        setData(d);
        const start = d?.me?.ballot ?? {};
        setAlloc(start);
        committed.current = start;
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const push = useCallback(async (next: Record<string, number>) => {
    setSave("saving");
    setSaveNote(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocation: next }),
      });
      if (res.ok) {
        committed.current = next;
        setSave("saved");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setSave("error");
      setSaveNote(
        body?.error === "over_budget"
          ? "That's more votes than you hold. Nothing was saved."
          : body?.error === "not_voting"
            ? "Voting has closed on this round. Nothing was saved."
            : res.status === 401
              ? "You've been signed out. Sign in and your ballot is still here."
              : "Couldn't save that. Your last saved ballot is unchanged.",
      );
    } catch {
      setSave("error");
      setSaveNote("Lost the connection. Your last saved ballot is unchanged.");
    }
  }, []);

  const budget = data?.me?.budget ?? 0;
  const spent = Object.values(alloc).reduce((s, n) => s + n, 0);
  const left = budget - spent;
  const canVote = !!data?.me && data.round?.status === "voting" && budget > 0;

  function set(id: string, next: number) {
    if (!canVote) return;
    const others = spent - (alloc[id] ?? 0);
    const clamped = Math.max(0, Math.min(Math.floor(next), budget - others));
    if (clamped === (alloc[id] ?? 0)) return;

    const updated = { ...alloc, [id]: clamped };
    if (clamped === 0) delete updated[id];
    setAlloc(updated);

    if (timer.current) clearTimeout(timer.current);
    setSave("idle");
    timer.current = setTimeout(() => void push(updated), SAVE_DEBOUNCE_MS);
  }

  if (loading) {
    return (
      <p className="py-16 text-center font-mono text-[0.7rem] uppercase tracking-widest text-dim">
        Reading the ballot…
      </p>
    );
  }

  // ── No round open ──────────────────────────────────────────────────
  if (!data?.round) {
    const pct = Math.round(data?.fund?.percent ?? 0);
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="eyebrow text-ticket">No round open</p>
        <p className="mt-2 font-display text-3xl leading-tight text-cream">
          NOTHING ON THE BALLOT YET
        </p>
        {/* The round is NOT gated on the goal, and saying it was locked the
            retention mechanic behind the money it exists to raise. Nothing in
            /api/admin/round requires a funded pot — a slate can go up with $40
            in it. What a member needs to know here is that pitches are being
            read and that votes earned today still count when it opens. */}
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-dim">
          We&apos;re reading pitches now. A slate goes up as soon as there are
          enough films worth choosing between &mdash; the fund doesn&apos;t have
          to be full first, and it&apos;s{" "}
          <span className="text-amber">{pct}% of the way there</span>. Votes you
          earn now carry into the round.
        </p>
        <Link
          href="/fund"
          className="mt-4 inline-block rounded border border-amber px-5 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-amber"
        >
          How the fund works →
        </Link>
      </div>
    );
  }

  const { round } = data;
  const pitches = data.pitches ?? [];
  const tallyBy = new Map((data.tallies ?? []).map((t) => [t.pitchId, t]));
  const totalVotes = (data.tallies ?? []).reduce((s, t) => s + t.votes, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Where the round stands ─────────────────────────────────── */}
      <header className="rounded-lg border border-amber/30 bg-amber/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow text-ticket">{round.title}</p>
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">
            {round.status === "voting"
              ? "Voting open"
              : round.status === "collecting"
                ? "Reading pitches"
                : round.status === "greenlit"
                  ? "Greenlit"
                  : "Closed"}
            {round.closesAt && round.status === "voting"
              ? ` · closes ${new Date(round.closesAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`
              : ""}
          </p>
        </div>

        {canVote ? (
          <>
            <p className="mt-2 font-display text-3xl leading-none text-cream">
              <span className="text-amber">{left}</span>
              <span className="text-dim"> of {budget} votes left</span>
            </p>
            <p className="mt-1 font-mono text-[0.65rem] leading-relaxed text-dim">
              Spend them however you like — all on one, or split across the slate.
              Move them around as much as you want while the round is open.
            </p>
          </>
        ) : data.me && budget === 0 ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-cream">
              You don&apos;t hold any votes yet. A dollar into the fund earns one,
              and you can read every pitch here whether you vote or not.
            </p>
            <Link
              href="/fund"
              className="mt-2 inline-block font-mono text-[0.65rem] uppercase tracking-widest text-amber"
            >
              Support the fund and earn votes →
            </Link>
          </>
        ) : !data.me ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-cream">
              Anyone can read the pitches and see where the vote stands. Members
              who&apos;ve supported the fund are the ones who decide it.
            </p>
            <Link
              href="/"
              className="mt-2 inline-block font-mono text-[0.65rem] uppercase tracking-widest text-amber"
            >
              Get a ticket →
            </Link>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-cream">
            {round.status === "collecting"
              ? "Pitches are still coming in. Voting opens once the slate is set."
              : "Voting on this round has closed."}
          </p>
        )}

        {/* Autosave status. Only ever shown once something has been touched —
            a resting "Saved" on a ballot nobody edited is a lie. */}
        {save !== "idle" && (
          <p
            role="status"
            className={`mt-2.5 border-t border-line pt-2 font-mono text-[0.65rem] ${
              save === "error" ? "text-ticket" : "text-dim"
            }`}
          >
            {save === "saving" && "Saving your ballot…"}
            {save === "saved" && "✓ Ballot saved."}
            {save === "error" && (
              <>
                {saveNote}{" "}
                <button
                  type="button"
                  onClick={() => void push(alloc)}
                  className="underline underline-offset-2"
                >
                  Try again
                </button>
              </>
            )}
          </p>
        )}
      </header>

      {/* ── The slate ──────────────────────────────────────────────── */}
      {pitches.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-dim">
          The slate isn&apos;t up yet. Every pitch gets read before it reaches this
          page, which takes a while.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pitches.map((p) => {
            const mine = alloc[p.id] ?? 0;
            const t = tallyBy.get(p.id);
            const share = totalVotes > 0 ? ((t?.votes ?? 0) / totalVotes) * 100 : 0;
            const isWinner = round.winnerPitchId === p.id;
            const expanded = open === p.id;

            return (
              <article
                key={p.id}
                className={`rounded-lg border p-4 transition-colors ${
                  isWinner
                    ? "border-amber bg-amber/10"
                    : mine > 0
                      ? "border-amber/50 bg-amber/5"
                      : "border-line bg-surface"
                }`}
              >
                {isWinner && (
                  <p className="eyebrow mb-1.5 text-amber">★ Greenlit — this is the one</p>
                )}

                <div className="flex gap-3">
                  {p.oneSheetUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.oneSheetUrl}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-16 shrink-0 rounded border border-line object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-2xl leading-tight text-cream">{p.title}</p>
                    <p className="mt-0.5 font-mono text-[0.65rem] text-amber">
                      dir. {p.director}
                      {p.genre ? <span className="text-dim"> · {p.genre}</span> : null}
                    </p>
                    <p className="mt-1.5 text-[0.85rem] leading-relaxed text-cream/90">
                      {p.logline}
                    </p>
                  </div>
                </div>

                {/* The deck, the reel, the synopsis. "You're not voting on a
                    logline" is a promise the Fund page makes; this is where it
                    has to be kept. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[0.6rem] uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : p.id)}
                    aria-expanded={expanded}
                    className="text-amber underline underline-offset-4"
                  >
                    {expanded ? "Less" : "Read the pitch"}
                  </button>
                  {p.deckUrl && (
                    <a
                      href={p.deckUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-dim underline underline-offset-4"
                    >
                      The deck ↗
                    </a>
                  )}
                  {p.priorWorkUrl && (
                    <a
                      href={p.priorWorkUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-dim underline underline-offset-4"
                    >
                      Their last film ↗
                    </a>
                  )}
                </div>

                {expanded && (
                  <div className="mt-2.5 border-t border-line pt-2.5">
                    <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-dim">
                      {p.synopsis}
                    </p>
                    {p.comps && (
                      <p className="mt-2 font-mono text-[0.6rem] leading-relaxed text-dim">
                        In the neighbourhood of: <span className="text-cream">{p.comps}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* ── The control ───────────────────────────────────── */}
                {canVote && (
                  <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                    <input
                      type="range"
                      min={0}
                      max={budget}
                      value={mine}
                      onChange={(e) => set(p.id, Number(e.target.value))}
                      onPointerUp={() => mine > 0 && haptic(8)}
                      aria-label={`Votes for ${p.title}`}
                      className="h-1 flex-1 accent-amber"
                    />
                    <p className="w-[4.5rem] shrink-0 text-right font-mono text-[0.7rem] tabular-nums">
                      <span className="text-amber">{mine}</span>
                      <span className="text-dim"> vote{mine === 1 ? "" : "s"}</span>
                    </p>
                  </div>
                )}

                {/* ── Where it stands ───────────────────────────────── */}
                <div className="mt-2.5">
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-amber transition-[width] duration-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[0.6rem] tabular-nums text-dim">
                    {t
                      ? `${t.votes.toLocaleString("en-US")} vote${t.votes === 1 ? "" : "s"} · ${t.backers} backer${t.backers === 1 ? "" : "s"}`
                      : "No votes yet"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="border-t border-line pt-3 text-center font-mono text-[0.6rem] leading-relaxed text-dim">
        Every ballot is ordered differently for every viewer, because whatever is
        printed first wins votes it didn&apos;t earn.
      </p>
    </div>
  );
}
