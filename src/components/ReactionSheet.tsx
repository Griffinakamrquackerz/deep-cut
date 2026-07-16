"use client";
import { useState } from "react";

const REACTIONS = [
  { value: "loved", label: "Loved it", glyph: "♥" },
  { value: "fine", label: "Fine", glyph: "—" },
  { value: "not_for_me", label: "Not for me", glyph: "✕" },
  { value: "loved_ironically", label: "Loved it ironically", glyph: "🃏" },
] as const;

const WHYS = [
  { value: "vibe", label: "Vibe" },
  { value: "story", label: "Story" },
  { value: "performances", label: "Performances" },
  { value: "chaos", label: "Chaos" },
] as const;

export interface ReactionPayload {
  reaction: string;
  why: string | null;
  note: string | null;
}

export default function ReactionSheet({
  title,
  onSubmit,
  onClose,
}: {
  title: string;
  onSubmit: (payload: ReactionPayload) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reaction, setReaction] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Log ${title}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-xl border-t border-line bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow mb-1">You watched</p>
        <h2 className="font-display text-2xl text-cream">{title}</h2>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReaction(r.value)}
              aria-pressed={reaction === r.value}
              className={`rounded border px-3 py-2.5 text-left text-sm ${
                reaction === r.value
                  ? "border-amber text-amber"
                  : "border-line text-cream"
              }`}
            >
              <span aria-hidden className="mr-1.5">
                {r.glyph}
              </span>
              {r.label}
            </button>
          ))}
        </div>

        {reaction && (
          <>
            <p className="eyebrow mb-2 mt-4">Why? (optional)</p>
            <div className="flex flex-wrap gap-2">
              {WHYS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => setWhy(why === w.value ? null : w.value)}
                  aria-pressed={why === w.value}
                  className={`rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${
                    why === w.value ? "border-ticket text-ticket" : "border-line text-dim"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="One line about it… (optional)"
              rows={2}
              className="mt-3 w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
            />
          </>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="rounded border border-line px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-dim"
          >
            Cancel
          </button>
          <button
            disabled={!reaction || busy}
            onClick={async () => {
              if (!reaction) return;
              setBusy(true);
              await onSubmit({ reaction, why, note: note.trim() || null });
            }}
            className="flex-1 rounded bg-amber px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {busy ? "Logging…" : "Log it"}
          </button>
        </div>
      </div>
    </div>
  );
}
