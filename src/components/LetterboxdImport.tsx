"use client";
import { useRef, useState } from "react";
import { parseLetterboxdCsv, type LetterboxdRow } from "@/lib/letterboxd";
import { sfxChime, sfxClick } from "@/lib/sfx";

type Phase = "idle" | "importing" | "done" | "error";

const CHUNK = 20;

export default function LetterboxdImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [loved, setLoved] = useState(0);
  const [logged, setLogged] = useState(0);
  const [misses, setMisses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    const text = await file.text();
    const rows = parseLetterboxdCsv(text);
    if (rows.length === 0) {
      setError("That doesn't look like a Letterboxd export — upload ratings.csv or watched.csv from the ZIP.");
      return;
    }
    // Cap a single run; nobody needs 4,000 rows to build a taste profile.
    const capped: LetterboxdRow[] = rows.slice(0, 600);
    setPhase("importing");
    setTotal(capped.length);
    setProcessed(0);
    setLoved(0);
    setLogged(0);
    setMisses([]);

    try {
      for (let i = 0; i < capped.length; i += CHUNK) {
        const chunk = capped.slice(i, i + CHUNK);
        const res = await fetch("/api/import/letterboxd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        if (!res.ok) throw new Error(`import failed (${res.status})`);
        const data = await res.json();
        setProcessed((p) => p + chunk.length);
        setLoved((n) => n + (data.lovedAdded ?? 0));
        setLogged((n) => n + (data.logged ?? 0));
        if (Array.isArray(data.misses)) setMisses((m) => [...m, ...data.misses].slice(0, 12));
      }
      // One profile rebuild at the end — the whole point of the import.
      await fetch("/api/profile/generate", { method: "POST" }).catch(() => null);
      sfxChime();
      setPhase("done");
      onDone();
    } catch (e) {
      setError(String(e).slice(0, 160));
      setPhase("error");
    }
  }

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="ticket-edge rounded bg-surface p-4">
      <button
        onClick={() => {
          sfxClick();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span>
          <span className="eyebrow text-ticket">Coming from Letterboxd?</span>
          <span className="block font-display text-2xl text-amber">SMUGGLE IN YOUR RATINGS</span>
        </span>
        <span className="font-mono text-lg text-dim">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {phase === "idle" || phase === "error" ? (
            <>
              <ol className="flex flex-col gap-1.5 text-sm text-cream/90">
                <li>
                  <span className="font-mono text-xs text-amber">1.</span> On Letterboxd: Settings
                  → <b>Data</b> → <b>Export your data</b>
                </li>
                <li>
                  <span className="font-mono text-xs text-amber">2.</span> Unzip it, find{" "}
                  <b className="font-mono text-xs">ratings.csv</b> (or watched.csv)
                </li>
                <li>
                  <span className="font-mono text-xs text-amber">3.</span> Drop it here — 4★+
                  films become loved films, the rest fill your history so we never re-deal them
                </li>
              </ol>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="pulse-cta rounded bg-ticket px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream"
              >
                ★ Choose the CSV ★
              </button>
              {error && <p className="font-mono text-xs text-ticket">{error}</p>}
            </>
          ) : phase === "importing" ? (
            <div>
              <div className="h-3 overflow-hidden rounded-full border border-line bg-bg">
                <div
                  className="h-full bg-amber transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 animate-pulse text-center font-mono text-xs text-dim">
                spooling reel {processed}/{total} — {loved} loved · {logged} logged
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-display text-3xl text-amber">THAT&apos;S A WRAP</p>
              <p className="mt-1 text-sm text-cream">
                {loved} films joined your loved shelf, {logged} filled your history, and your
                taste profile just got rebuilt.
              </p>
              {misses.length > 0 && (
                <p className="mt-2 font-mono text-[0.65rem] text-dim">
                  Couldn&apos;t match: {misses.join(", ")}
                  {misses.length >= 12 ? "…" : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
