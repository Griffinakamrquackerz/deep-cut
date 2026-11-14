"use client";
import { useCallback, useEffect, useState } from "react";

// The reading pile.
//
// Everything that has been submitted this cycle, and the one action that
// matters: putting a film on the ballot. The slot count is shown at all times
// because "we showcase nine" is a promise made on a public page, and the number
// of slots left is the only thing standing between that promise and a
// twenty-film ballot nobody reads.

interface Submission {
  id: string;
  director: string;
  email: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string | null;
  comps: string | null;
  budgetCents: number | null;
  deckUrl: string | null;
  priorWorkUrl: string | null;
  oneSheetUrl: string | null;
  status: "new" | "read" | "showcased" | "passed";
  /** Null on a decided submission = a reply is owed. */
  repliedAt: string | null;
  /** Signed by the API, an hour at a time — see /api/admin/submissions. */
  attachments?: Array<{ name: string; size: number; type: string; url: string | null }>;
  notes: string | null;
  createdAt: string;
}

interface Payload {
  cycle: string;
  submissions: Submission[];
  counts: {
    new: number;
    read: number;
    showcased: number;
    passed: number;
    total: number;
    slots: number;
    slotsLeft: number;
    /** Decided, but nobody has been told. */
    owed: number;
  };
  error?: string;
  note?: string;
}

type Filter = "new" | "read" | "showcased" | "passed" | "all";

const STATUS_COLOR: Record<Submission["status"], string> = {
  new: "text-amber",
  read: "text-cream",
  showcased: "text-avail",
  passed: "text-dim",
};

export default function AdminPile() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("new");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/submissions");
    setData((await res.json().catch(() => null)) as Payload | null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as { error?: string; note?: string } | null;
    if (res.ok) {
      setMsg(okMsg);
    } else {
      setMsg(
        out?.error === "slate_full"
          ? `The slate is full — ${data?.counts.slots} films is the cap. Take one off in Greenlight first.`
          : out?.error === "no_round"
            ? "No round is open for this cycle. Open it in Greenlight first."
            : out?.error === "already_showcased"
              ? "That one is already on the ballot."
              : `Failed: ${out?.note ?? out?.error ?? res.status}`,
      );
    }
    setBusy(false);
    await load();
  }

  if (!data) return <p className="py-8 text-center font-mono text-[0.7rem] text-dim">Loading…</p>;

  if (data.error) {
    return (
      <div className="rounded border border-ticket/50 bg-ticket/5 p-4">
        <p className="font-mono text-[0.7rem] text-ticket">{data.error}</p>
        {data.note && <p className="mt-1 text-sm text-cream">{data.note}</p>}
      </div>
    );
  }

  const { counts } = data;
  const shown = data.submissions.filter((s) => filter === "all" || s.status === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Slots ────────────────────────────────────────────────── */}
      <section className="rounded border border-amber/30 bg-amber/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow text-ticket">The pile · {data.cycle}</p>
          <p className="font-mono text-[0.6rem] tabular-nums text-dim">
            {counts.total} submitted
          </p>
        </div>
        <p className="mt-1.5 font-display text-3xl leading-none text-cream">
          <span className={counts.slotsLeft === 0 ? "text-ticket" : "text-amber"}>
            {counts.showcased}
          </span>
          <span className="text-dim"> of {counts.slots} slots filled</span>
        </p>
        <p className="mt-1 font-mono text-[0.6rem] text-dim">
          {counts.new} unread · {counts.read} read · {counts.passed} passed
        </p>
        {/* The receipt every submitter gets promises they'll hear back either
            way. This is the number that makes that keepable — an obligation
            you can see the size of is one that gets cleared. */}
        {counts.owed > 0 && (
          <p className="mt-2 border-t border-line pt-2 font-mono text-[0.65rem] text-ticket">
            {counts.owed} {counts.owed === 1 ? "filmmaker is" : "filmmakers are"} still
            waiting to be told. They were promised an answer either way.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-1 rounded border border-line bg-surface p-1">
        {(["new", "read", "showcased", "passed", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            aria-pressed={filter === t}
            className={`flex-1 rounded px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest ${
              filter === t ? "bg-bg text-amber" : "text-dim"
            }`}
          >
            {t}
            {t !== "all" ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>

      {msg && (
        <p
          role="status"
          className={`font-mono text-[0.65rem] ${msg.startsWith("Failed") || msg.includes("full") || msg.includes("No round") ? "text-ticket" : "text-avail"}`}
        >
          {msg}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-dim">
          {filter === "new" ? "Nothing unread. The pile is clear." : `No ${filter} submissions.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((s) => {
            const expanded = open === s.id;
            return (
              <li key={s.id} className="rounded border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-2xl leading-tight text-cream">{s.title}</p>
                  <p className={`font-mono text-[0.6rem] uppercase tracking-widest ${STATUS_COLOR[s.status]}`}>
                    {s.status}
                  </p>
                </div>
                <p className="mt-0.5 font-mono text-[0.6rem] text-amber">
                  dir. {s.director}
                  <span className="text-dim">
                    {" · "}
                    {s.email}
                    {s.genre ? ` · ${s.genre}` : ""}
                    {s.budgetCents
                      ? ` · asks $${Math.round(s.budgetCents / 100).toLocaleString("en-US")}`
                      : ""}
                  </span>
                </p>
                <p className="mt-1.5 text-[0.85rem] leading-relaxed text-cream/90">{s.logline}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[0.6rem] uppercase tracking-widest">
                  <button
                    onClick={() => setOpen(expanded ? null : s.id)}
                    className="text-amber underline underline-offset-4"
                  >
                    {expanded ? "Less" : "Read it"}
                  </button>
                  {(s.attachments ?? []).map((a) =>
                    a.url ? (
                      <a
                        key={a.url}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-amber underline underline-offset-4"
                      >
                        📎 {a.name}
                      </a>
                    ) : (
                      <span key={a.name} className="text-dim/60">
                        📎 {a.name} (link expired — reload)
                      </span>
                    ),
                  )}
                  {s.deckUrl && (
                    <a href={s.deckUrl} target="_blank" rel="noreferrer noopener" className="text-dim underline underline-offset-4">
                      Deck ↗
                    </a>
                  )}
                  {s.priorWorkUrl && (
                    <a href={s.priorWorkUrl} target="_blank" rel="noreferrer noopener" className="text-dim underline underline-offset-4">
                      Their work ↗
                    </a>
                  )}
                  {s.oneSheetUrl && (
                    <a href={s.oneSheetUrl} target="_blank" rel="noreferrer noopener" className="text-dim underline underline-offset-4">
                      One-sheet ↗
                    </a>
                  )}
                </div>

                {expanded && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-dim">
                      {s.synopsis}
                    </p>
                    {s.comps && (
                      <p className="mt-2 font-mono text-[0.6rem] text-dim">
                        Comps: <span className="text-cream">{s.comps}</span>
                      </p>
                    )}

                    <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
                      Private notes
                    </p>
                    <textarea
                      rows={3}
                      value={noteDraft[s.id] ?? s.notes ?? ""}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      className="mt-1 w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream focus:border-amber focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        void act(
                          { action: "notes", id: s.id, notes: noteDraft[s.id] ?? s.notes ?? "" },
                          "Notes saved.",
                        )
                      }
                      disabled={busy}
                      className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber underline underline-offset-4"
                    >
                      Save notes
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-2.5 font-mono text-[0.6rem] uppercase tracking-widest">
                  {s.status !== "read" && s.status !== "showcased" && (
                    <button
                      onClick={() => void act({ action: "status", id: s.id, status: "read" }, "Marked read.")}
                      disabled={busy}
                      className="text-cream underline underline-offset-4"
                    >
                      Mark read
                    </button>
                  )}
                  {s.status !== "showcased" && (
                    <button
                      onClick={() =>
                        void act({ action: "promote", id: s.id }, `"${s.title}" is on the ballot.`)
                      }
                      disabled={busy || counts.slotsLeft === 0}
                      title={counts.slotsLeft === 0 ? "All slots are filled" : undefined}
                      className="text-avail underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
                    >
                      ★ Put on the ballot
                    </button>
                  )}
                  {s.status !== "passed" && s.status !== "showcased" && (
                    <button
                      onClick={() => void act({ action: "status", id: s.id, status: "passed" }, "Passed.")}
                      disabled={busy}
                      className="text-ticket underline underline-offset-4"
                    >
                      Pass
                    </button>
                  )}
                  {s.status === "passed" && !s.repliedAt && (
                    <button
                      onClick={() => void act({ action: "status", id: s.id, status: "read" }, "Back in play.")}
                      disabled={busy}
                      className="text-dim underline underline-offset-4"
                    >
                      Undo pass
                    </button>
                  )}

                  {/* Sending is never a side effect of the status change: a
                      rejection email can't be unsent, and Pass is one click. */}
                  {(s.status === "passed" || s.status === "showcased") &&
                    (s.repliedAt ? (
                      <span className="text-avail">
                        ✓ told {new Date(s.repliedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          void act(
                            { action: "reply", id: s.id },
                            `${s.director} has been told.`,
                          )
                        }
                        disabled={busy}
                        className="text-amber underline underline-offset-4"
                      >
                        ✉ Send the{" "}
                        {s.status === "showcased" ? "good news" : "pass"}
                      </button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="font-mono text-[0.6rem] leading-relaxed text-dim">
        Making the slate emails the director straight away — it&apos;s good news
        and there&apos;s no version of it you&apos;d regret. A pass never sends
        itself; use the button on the row when you mean it.
      </p>

      <p className="font-mono text-[0.6rem] leading-relaxed text-dim">
        Putting a film on the ballot copies it into the slate as a pitch. To take
        one back off, remove the pitch in{" "}
        <span className="text-amber">Greenlight</span> — which also releases every
        vote placed on it back to the members who spent them.
      </p>
    </div>
  );
}
