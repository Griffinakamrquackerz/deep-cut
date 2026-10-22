"use client";
import { useCallback, useEffect, useState } from "react";

// Running a greenlight round from a screen instead of from a SQL editor.
//
// Two jobs: open the round for the current fund cycle and move it through its
// states, and put pitches on the slate. Both were previously hand-written
// inserts into the production database, which is the sort of thing that works
// until the evening you do it in a hurry.

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

type Status = "collecting" | "voting" | "greenlit" | "closed";

interface Round {
  id: string;
  title: string;
  status: Status;
  opensAt: string | null;
  closesAt: string | null;
  winnerPitchId: string | null;
}

interface Payload {
  cycle: string;
  round: Round | null;
  pitches: Pitch[];
  tallies: Array<{ pitchId: string; votes: number; backers: number }>;
  error?: string;
  note?: string;
}

const BLANK = {
  id: "",
  title: "",
  director: "",
  logline: "",
  synopsis: "",
  genre: "",
  comps: "",
  oneSheetUrl: "",
  deckUrl: "",
  priorWorkUrl: "",
  directorPhotoUrl: "",
};
type Draft = typeof BLANK;

const field =
  "w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60 focus:border-amber focus:outline-none";
const label = "font-mono text-[0.6rem] uppercase tracking-widest text-dim";

const STATUS_HELP: Record<Status, string> = {
  collecting: "Pitches are being read. The ballot shows the slate but nobody can vote.",
  voting: "Members can spend their votes. This is the only state votes are accepted in.",
  greenlit: "A winner has been called. The ballot shows a star on it and stops accepting votes.",
  closed: "Round is over and nothing more happens to it.",
};

export default function AdminGreenlight() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/round");
    setData((await res.json().catch(() => null)) as Payload | null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Round form state, seeded from whatever exists.
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("collecting");
  const [closesAt, setClosesAt] = useState("");
  useEffect(() => {
    if (!data?.round) return;
    setTitle(data.round.title);
    setStatus(data.round.status);
    setClosesAt(data.round.closesAt ? data.round.closesAt.slice(0, 10) : "");
  }, [data?.round]);

  async function saveRound(winnerPitchId?: string | null) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || "The First Deep Cut Original",
        status,
        // A date input gives a bare day; the round should close at the end of
        // it rather than at midnight as it begins.
        closesAt: closesAt ? new Date(`${closesAt}T23:59:59Z`).toISOString() : null,
        winnerPitchId:
          winnerPitchId === undefined ? (data?.round?.winnerPitchId ?? null) : winnerPitchId,
      }),
    });
    const body = (await res.json().catch(() => null)) as { note?: string; error?: string } | null;
    setMsg(res.ok ? "Round saved." : `Failed: ${body?.note ?? body?.error ?? res.status}`);
    setBusy(false);
    await load();
  }

  async function savePitch() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/pitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title.trim(),
        director: draft.director.trim(),
        logline: draft.logline.trim(),
        synopsis: draft.synopsis.trim(),
        genre: draft.genre.trim(),
        comps: draft.comps.trim(),
        oneSheetUrl: draft.oneSheetUrl.trim(),
        deckUrl: draft.deckUrl.trim(),
        priorWorkUrl: draft.priorWorkUrl.trim(),
        directorPhotoUrl: draft.directorPhotoUrl.trim(),
      }),
    });
    const body = (await res.json().catch(() => null)) as { note?: string; error?: string } | null;
    if (res.ok) {
      setMsg(draft.id ? "Pitch updated." : "Pitch added to the slate.");
      setDraft(BLANK);
      setShowForm(false);
    } else {
      setMsg(`Failed: ${body?.note ?? body?.error ?? res.status}`);
    }
    setBusy(false);
    await load();
  }

  async function removePitch(p: Pitch) {
    const t = data?.tallies.find((x) => x.pitchId === p.id);
    const warning = t?.votes
      ? `\n\n${t.votes} vote${t.votes === 1 ? "" : "s"} from ${t.backers} backer${t.backers === 1 ? "" : "s"} will be released back to them.`
      : "";
    if (!confirm(`Take "${p.title}" off the slate?${warning}`)) return;

    setBusy(true);
    const res = await fetch("/api/admin/pitch", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    setMsg(res.ok ? "Pitch removed." : "Couldn't remove that pitch.");
    setBusy(false);
    await load();
  }

  function edit(p: Pitch) {
    setDraft({
      id: p.id,
      title: p.title,
      director: p.director,
      logline: p.logline,
      synopsis: p.synopsis,
      genre: p.genre ?? "",
      comps: p.comps ?? "",
      oneSheetUrl: p.oneSheetUrl ?? "",
      deckUrl: p.deckUrl ?? "",
      priorWorkUrl: p.priorWorkUrl ?? "",
      directorPhotoUrl: p.directorPhotoUrl ?? "",
    });
    setShowForm(true);
  }

  if (!data) {
    return <p className="py-8 text-center font-mono text-[0.7rem] text-dim">Loading…</p>;
  }

  if (data.error) {
    return (
      <div className="rounded border border-ticket/50 bg-ticket/5 p-4">
        <p className="font-mono text-[0.7rem] text-ticket">{data.error}</p>
        {data.note && <p className="mt-1 text-sm text-cream">{data.note}</p>}
      </div>
    );
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      {/* ── The round ────────────────────────────────────────────── */}
      <section className="rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow text-ticket">The round</p>
          <p className="font-mono text-[0.6rem] text-dim">
            cycle <span className="text-amber">{data.cycle}</span>
            {data.round?.opensAt
              ? ` · opened ${new Date(data.round.opensAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>

        {!data.round && (
          <p className="mt-1.5 text-sm leading-relaxed text-dim">
            No round exists for this cycle yet. Give it a name and save — pitches
            can only be added once it does.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className={label}>Round title</p>
            <input
              className={`${field} mt-1`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The First Deep Cut Original"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>Status</p>
              <select
                className={`${field} mt-1`}
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                <option value="collecting">Collecting — reading pitches</option>
                <option value="voting">Voting — ballot is open</option>
                <option value="greenlit">Greenlit — winner called</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <p className={label}>Closes on (optional)</p>
              <input
                type="date"
                className={`${field} mt-1`}
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>

          <p className="font-mono text-[0.6rem] leading-relaxed text-dim">
            {STATUS_HELP[status]}
          </p>

          <button
            onClick={() => void saveRound()}
            disabled={busy}
            className="rounded bg-amber px-4 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-bg disabled:opacity-60"
          >
            {data.round ? "Save round" : "Open the round"}
          </button>
        </div>
      </section>

      {msg && (
        <p
          role="status"
          className={`font-mono text-[0.65rem] ${msg.startsWith("Failed") ? "text-ticket" : "text-avail"}`}
        >
          {msg}
        </p>
      )}

      {/* ── The slate ────────────────────────────────────────────── */}
      {data.round && (
        <section className="rounded border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="eyebrow text-ticket">
              The slate · {data.pitches.length} pitch
              {data.pitches.length === 1 ? "" : "es"}
            </p>
            <button
              onClick={() => {
                setDraft(BLANK);
                setShowForm((s) => !s);
              }}
              className="font-mono text-[0.6rem] uppercase tracking-widest text-amber underline underline-offset-4"
            >
              {showForm ? "Cancel" : "+ Add a pitch"}
            </button>
          </div>

          {showForm && (
            <div className="mt-3 flex flex-col gap-3 rounded border border-amber/30 bg-amber/5 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={label}>Title *</p>
                  <input className={`${field} mt-1`} value={draft.title} onChange={set("title")} />
                </div>
                <div>
                  <p className={label}>Director *</p>
                  <input
                    className={`${field} mt-1`}
                    value={draft.director}
                    onChange={set("director")}
                  />
                </div>
              </div>

              <div>
                <p className={label}>Logline * — one sentence, 300 characters</p>
                <textarea
                  rows={2}
                  maxLength={300}
                  className={`${field} mt-1`}
                  value={draft.logline}
                  onChange={set("logline")}
                />
                <p className="mt-0.5 text-right font-mono text-[0.55rem] tabular-nums text-dim">
                  {draft.logline.length}/300
                </p>
              </div>

              <div>
                <p className={label}>Synopsis *</p>
                <textarea
                  rows={6}
                  maxLength={4000}
                  className={`${field} mt-1`}
                  value={draft.synopsis}
                  onChange={set("synopsis")}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={label}>Genre</p>
                  <input
                    className={`${field} mt-1`}
                    value={draft.genre}
                    onChange={set("genre")}
                    placeholder="Thriller"
                  />
                </div>
                <div>
                  <p className={label}>Comps</p>
                  <input
                    className={`${field} mt-1`}
                    value={draft.comps}
                    onChange={set("comps")}
                    placeholder="Blue Ruin meets Wind River"
                  />
                </div>
              </div>

              {/* Links, not uploads. Every one must be https — an http link
                  loads as mixed content and silently doesn't appear. */}
              {(
                [
                  ["oneSheetUrl", "One-sheet image URL"],
                  ["deckUrl", "Pitch deck URL"],
                  ["priorWorkUrl", "Their previous film URL"],
                  ["directorPhotoUrl", "Director photo URL"],
                ] as Array<[keyof Draft, string]>
              ).map(([k, l]) => (
                <div key={k}>
                  <p className={label}>{l}</p>
                  <input
                    className={`${field} mt-1`}
                    value={draft[k]}
                    onChange={set(k)}
                    placeholder="https://…"
                  />
                </div>
              ))}

              <button
                onClick={() => void savePitch()}
                disabled={
                  busy ||
                  !draft.title.trim() ||
                  !draft.director.trim() ||
                  !draft.logline.trim() ||
                  !draft.synopsis.trim()
                }
                className="rounded bg-amber px-4 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-bg disabled:opacity-50"
              >
                {draft.id ? "Save changes" : "Add to the slate"}
              </button>
            </div>
          )}

          <ul className="mt-3 flex flex-col gap-2">
            {data.pitches.map((p) => {
              const t = data.tallies.find((x) => x.pitchId === p.id);
              const won = data.round?.winnerPitchId === p.id;
              return (
                <li
                  key={p.id}
                  className={`rounded border p-3 ${won ? "border-amber bg-amber/10" : "border-line bg-bg"}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-xl leading-tight text-cream">
                      {won && <span className="text-amber">★ </span>}
                      {p.title}
                    </p>
                    <p className="font-mono text-[0.6rem] tabular-nums text-dim">
                      {t ? `${t.votes} votes · ${t.backers} backers` : "no votes"}
                    </p>
                  </div>
                  <p className="mt-0.5 font-mono text-[0.6rem] text-amber">dir. {p.director}</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-dim">{p.logline}</p>
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[0.6rem] uppercase tracking-widest">
                    <button onClick={() => edit(p)} className="text-amber underline underline-offset-4">
                      Edit
                    </button>
                    <button
                      onClick={() => void saveRound(won ? null : p.id)}
                      disabled={busy}
                      className="text-cream underline underline-offset-4"
                    >
                      {won ? "Un-call it" : "Call this the winner"}
                    </button>
                    <button
                      onClick={() => void removePitch(p)}
                      disabled={busy}
                      className="text-ticket underline underline-offset-4"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {data.pitches.length === 0 && !showForm && (
            <p className="mt-3 text-sm text-dim">
              Nothing on the slate yet. The ballot will tell members pitches are
              still being read.
            </p>
          )}
        </section>
      )}

      <p className="font-mono text-[0.6rem] leading-relaxed text-dim">
        The round id is always the fund&apos;s current cycle
        (<span className="text-amber">FUND_CYCLE</span>, currently {data.cycle}).
        Bumping that env var starts a new picture: the ledger and the ballot move
        together, and votes earned this cycle stay with it.
      </p>
    </div>
  );
}
