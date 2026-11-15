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
  const [flash, setFlashState] = useState<{ ok: boolean; text: string } | null>(null);
  // Bumped on every flash so the same stamp twice still slams twice.
  const [flashN, setFlashN] = useState(0);
  const setFlash = (f: { ok: boolean; text: string }) => {
    setFlashState(f);
    setFlashN((n) => n + 1);
  };

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
      {/* The four things you can do with a film, as rubber stamps — the same
          stamps as on Tonight's shelf. What you did comes back as an impression. */}
      <div className="flex gap-2">
        <button
          onClick={async () => {
            const ok = await call("/api/watchlist", { movieId, source: "movie page" });
            setFlash(ok ? { ok, text: "On the watchlist" } : { ok, text: "Couldn't save." });
          }}
          className="stamp-btn"
        >
          + Watchlist
        </button>
        <button
          onClick={async () => {
            const ok = await call("/api/loved", { movieId });
            setFlash(ok ? { ok, text: "Loved" } : { ok, text: "Couldn't save." });
          }}
          className="stamp-btn"
          style={{ color: "var(--color-ticket)" }}
        >
          ♥ Loved it
        </button>
        <button onClick={() => setReacting(true)} className="stamp-btn">
          Seen it
        </button>
        <button onClick={() => setAddingRead((v) => !v)} className="stamp-btn" style={{ flex: 0.9 }}>
          + Read
        </button>
      </div>

      {flash &&
        (flash.ok ? (
          <p aria-live="polite" className="pt-1">
            <span key={flash.text + flashN} className="stamp stamp-gold stamp-slam inline-block">
              {flash.text}
            </span>
          </p>
        ) : (
          <p aria-live="polite" className="font-mono text-xs text-ticket">
            {flash.text}
          </p>
        ))}

      {addingRead && (
        <div className="paper-sheet flex flex-col gap-2 rounded-sm p-4">
          <p className="paper-head !mb-1">
            <b>Further reading</b>
            <span>Pinned to this film</span>
          </p>
          <input
            value={readTitle}
            onChange={(e) => setReadTitle(e.target.value.slice(0, 160))}
            placeholder="Article title"
            aria-label="Article title"
            className="tape-write tape-write--small"
          />
          <input
            value={readUrl}
            onChange={(e) => setReadUrl(e.target.value.slice(0, 500))}
            placeholder="https://…"
            inputMode="url"
            aria-label="Link"
            className="tape-write tape-write--small"
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
                setFlash({ ok: false, text: "Couldn't add that link. Check the URL." });
              }
            }}
            className="stamp-btn mt-2 self-start px-4 disabled:opacity-40"
            style={{ color: "#a8371d", flex: "none" }}
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
            setFlash({ ok: true, text: "Logged" });
          }}
        />
      )}
    </div>
  );
}
