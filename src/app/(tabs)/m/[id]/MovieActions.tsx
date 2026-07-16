"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactionSheet, { type ReactionPayload } from "@/components/ReactionSheet";

export default function MovieActions({ movieId, title }: { movieId: number; title: string }) {
  const router = useRouter();
  const [reacting, setReacting] = useState(false);
  const [addingRead, setAddingRead] = useState(false);
  const [readTitle, setReadTitle] = useState("");
  const [readUrl, setReadUrl] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  async function call(path: string, body: Record<string, unknown>, method = "POST") {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            const ok = await call("/api/watchlist", { movieId, source: "movie page" });
            setFlash(ok ? "On the watchlist." : "Couldn't save.");
          }}
          className="rounded border border-amber px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-amber"
        >
          + Watchlist
        </button>
        <button
          onClick={async () => {
            const ok = await call("/api/loved", { movieId });
            setFlash(ok ? "Added to loved films — your profile just got sharper." : "Couldn't save.");
          }}
          className="rounded border border-ticket px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ticket"
        >
          ♥ Loved it
        </button>
        <button
          onClick={() => setReacting(true)}
          className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-cream"
        >
          Log a watch
        </button>
        <button
          onClick={() => setAddingRead((v) => !v)}
          className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-dim"
        >
          + External read
        </button>
      </div>

      {flash && <p className="font-mono text-xs text-avail">{flash}</p>}

      {addingRead && (
        <div className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
          <input
            value={readTitle}
            onChange={(e) => setReadTitle(e.target.value.slice(0, 160))}
            placeholder="Article title"
            className="rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
          />
          <input
            value={readUrl}
            onChange={(e) => setReadUrl(e.target.value.slice(0, 500))}
            placeholder="https://…"
            inputMode="url"
            className="rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
          />
          <button
            disabled={!readTitle.trim() || !readUrl.trim()}
            onClick={async () => {
              const ok = await call("/api/reads", {
                movieId,
                title: readTitle.trim(),
                url: readUrl.trim(),
              });
              if (ok) {
                setAddingRead(false);
                setReadTitle("");
                setReadUrl("");
                router.refresh();
              } else {
                setFlash("Couldn't add that link (is the URL valid?).");
              }
            }}
            className="rounded bg-amber px-3 py-2 font-mono text-[0.65rem] font-medium uppercase tracking-wider text-bg disabled:opacity-40"
          >
            Add link
          </button>
        </div>
      )}

      {reacting && (
        <ReactionSheet
          title={title}
          onClose={() => setReacting(false)}
          onSubmit={async (payload: ReactionPayload) => {
            await call("/api/logs", { movieId, ...payload });
            setReacting(false);
            setFlash("Logged. Your profile sharpens with every watch.");
          }}
        />
      )}
    </div>
  );
}
