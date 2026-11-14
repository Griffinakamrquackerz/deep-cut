"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { CHANNELS, runtimeLabel, type ChannelKey } from "@/lib/shorts";

// The Projection Booth's Theatre tab — the Deep Cut Theatre bill, run from a
// table instead of a source file. Three ways onto the bill: paste a link and
// let the platform's own oEmbed answer for it (works today, no setup), search
// a catalogue by title (once an API key is wired — see .env.example), or type
// everything in by hand. All three land in the same review form before
// anything is saved, so a filmmaker's submitted link and a manual entry get
// exactly the same scrutiny on the way in.

interface ShortRow {
  id: string;
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  source: "vimeo" | "youtube";
  videoId: string;
  channels: ChannelKey[];
  pedigree: string;
  synopsis: string;
  thumb: string;
  status: "showing" | "archived";
}

interface Draft {
  title: string;
  director: string;
  year: string;
  runtimeSec: string;
  source: "vimeo" | "youtube";
  videoId: string;
  channels: ChannelKey[];
  pedigree: string;
  synopsis: string;
  thumb: string;
}

const BLANK_DRAFT: Draft = {
  title: "",
  director: "",
  year: String(new Date().getFullYear()),
  runtimeSec: "",
  source: "vimeo",
  videoId: "",
  channels: [],
  pedigree: "",
  synopsis: "",
  thumb: "",
};

function watchUrl(short: Pick<ShortRow, "source" | "videoId">): string {
  return short.source === "vimeo"
    ? `https://vimeo.com/${short.videoId}`
    : `https://youtube.com/watch?v=${short.videoId}`;
}

export default function AdminTheatre({
  vimeoSearch,
  youtubeSearch,
}: {
  vimeoSearch: boolean;
  youtubeSearch: boolean;
}) {
  const [shorts, setShorts] = useState<ShortRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"link" | "search" | "blank">("link");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // id being edited
  const [busy, setBusy] = useState<string | null>(null);

  // Paste-a-link
  const [pasteUrl, setPasteUrl] = useState("");
  const [looking, setLooking] = useState(false);

  // Catalogue search
  const [searchSource, setSearchSource] = useState<"vimeo" | "youtube">(
    vimeoSearch ? "vimeo" : "youtube",
  );
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    { source: "vimeo" | "youtube"; videoId: string; title: string; director: string; thumb: string | null; runtimeSec: number | null }[]
  >([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/shorts").catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      toast(data?.note ?? "Couldn't load the bill.", { tone: "amber", icon: "✕" });
      setShorts([]);
      return;
    }
    setShorts(data.shorts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showing = useMemo(() => (shorts ?? []).filter((s) => s.status === "showing"), [shorts]);
  const archived = useMemo(() => (shorts ?? []).filter((s) => s.status === "archived"), [shorts]);

  function startAdd() {
    setDraft({ ...BLANK_DRAFT });
    setEditing(null);
    setAdding(true);
    setMode("link");
    setPasteUrl("");
    setQuery("");
    setResults([]);
  }

  function startEdit(s: ShortRow) {
    setDraft({
      title: s.title,
      director: s.director,
      year: String(s.year),
      runtimeSec: String(s.runtimeSec),
      source: s.source,
      videoId: s.videoId,
      channels: s.channels,
      pedigree: s.pedigree,
      synopsis: s.synopsis,
      thumb: s.thumb,
    });
    setEditing(s.id);
    setAdding(true);
    setMode("blank");
  }

  async function lookUp() {
    if (!pasteUrl.trim()) return;
    setLooking(true);
    const res = await fetch("/api/admin/shorts/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: pasteUrl }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setLooking(false);
    if (!res?.ok) {
      toast(data?.note ?? "Couldn't look that up.", { tone: "amber", icon: "✕" });
      return;
    }
    setDraft({
      ...BLANK_DRAFT,
      title: data.title || "",
      director: data.director || "",
      runtimeSec: data.runtimeSec ? String(data.runtimeSec) : "",
      source: data.source,
      videoId: data.videoId,
      thumb: data.thumb || "",
    });
    setMode("blank"); // drop into the review form with everything prefilled
    if (!data.runtimeSec && data.source === "youtube") {
      toast("YouTube doesn't report runtime — fill it in by hand.", { tone: "amber", icon: "⏱" });
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const res = await fetch(
      `/api/admin/shorts/search?q=${encodeURIComponent(query)}&source=${searchSource}`,
    ).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setSearching(false);
    if (!res?.ok) {
      toast(data?.note ?? "Search failed.", { tone: "amber", icon: "✕" });
      setResults([]);
      return;
    }
    setResults(data.results ?? []);
  }

  function pickResult(r: (typeof results)[number]) {
    setDraft({
      ...BLANK_DRAFT,
      title: r.title,
      director: r.director,
      runtimeSec: r.runtimeSec ? String(r.runtimeSec) : "",
      source: r.source,
      videoId: r.videoId,
      thumb: r.thumb || "",
    });
    setMode("blank");
  }

  function toggleChannel(k: ChannelKey) {
    setDraft((d) =>
      d ? { ...d, channels: d.channels.includes(k) ? d.channels.filter((c) => c !== k) : [...d.channels, k] } : d,
    );
  }

  async function save() {
    if (!draft) return;
    const year = Number(draft.year);
    const runtimeSec = Number(draft.runtimeSec);
    if (!draft.title.trim() || !draft.director.trim()) {
      toast("Title and director are required.", { tone: "amber", icon: "✕" });
      return;
    }
    if (!draft.videoId.trim()) {
      toast("Missing the video ID — paste a link or search first.", { tone: "amber", icon: "✕" });
      return;
    }
    if (draft.channels.length === 0) {
      toast("Pick at least one channel.", { tone: "amber", icon: "✕" });
      return;
    }
    if (!Number.isInteger(year) || year < 1888) {
      toast("That year doesn't look right.", { tone: "amber", icon: "✕" });
      return;
    }
    if (!Number.isInteger(runtimeSec) || runtimeSec <= 0) {
      toast("Runtime needs to be seconds, greater than zero.", { tone: "amber", icon: "✕" });
      return;
    }

    setBusy("save");
    const body = {
      title: draft.title.trim(),
      director: draft.director.trim(),
      year,
      runtimeSec,
      source: draft.source,
      videoId: draft.videoId.trim(),
      channels: draft.channels,
      pedigree: draft.pedigree.trim(),
      synopsis: draft.synopsis.trim(),
      thumb: draft.thumb.trim(),
    };
    const res = editing
      ? await fetch(`/api/admin/shorts/${editing}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null)
      : await fetch("/api/admin/shorts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok) {
      toast(data?.note ?? "Couldn't save that.", { tone: "amber", icon: "✕" });
      return;
    }
    toast(editing ? `Updated ${body.title}.` : `Added ${body.title} to the bill.`, {
      tone: "ticket",
      icon: "🎬",
    });
    setAdding(false);
    setDraft(null);
    setEditing(null);
    await load();
  }

  async function setStatus(id: string, status: "showing" | "archived") {
    setBusy(id);
    const res = await fetch(`/api/admin/shorts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      toast("Couldn't update that.", { tone: "amber", icon: "✕" });
      return;
    }
    toast(status === "archived" ? "Archived — off the bill, not deleted." : "Back on the bill.", {
      tone: "ticket",
      icon: status === "archived" ? "🗄" : "🎬",
    });
    await load();
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Permanently delete "${title}"? This can't be undone — archive it instead if you might want it back.`)) {
      return;
    }
    setBusy(id);
    const res = await fetch(`/api/admin/shorts/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      toast("Couldn't delete that.", { tone: "amber", icon: "✕" });
      return;
    }
    toast(`Deleted ${title}.`, { tone: "ticket", icon: "🗑" });
    await load();
  }

  if (shorts === null) {
    return <p className="font-mono text-xs text-dim">Loading the bill…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded border border-line bg-surface p-3">
          <p className="font-display text-3xl text-amber">{showing.length}</p>
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">on the bill</p>
        </div>
        <div className="rounded border border-line bg-surface p-3">
          <p className="font-display text-3xl text-amber">{archived.length}</p>
          <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">archived</p>
        </div>
      </div>

      {!adding ? (
        <button
          onClick={startAdd}
          className="rounded bg-amber px-3 py-2 font-mono text-[0.65rem] font-medium uppercase tracking-widest text-bg"
        >
          + Add a film
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow">{editing ? "Edit" : "Add a film"}</p>
            <button
              onClick={() => {
                setAdding(false);
                setDraft(null);
                setEditing(null);
              }}
              className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
            >
              Cancel
            </button>
          </div>

          {!editing && (
            <div className="flex gap-1 rounded border border-line bg-bg p-1">
              {(["link", "search", "blank"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`flex-1 rounded px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest ${
                    mode === m ? "bg-surface text-amber" : "text-dim"
                  }`}
                >
                  {m === "link" ? "Paste a link" : m === "search" ? "Search" : "Type it in"}
                </button>
              ))}
            </div>
          )}

          {!editing && mode === "link" && (
            <div className="flex gap-2">
              <input
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://vimeo.com/… or https://youtube.com/watch?v=…"
                className="flex-1 rounded border border-line bg-bg px-2 py-2 font-mono text-xs text-cream"
              />
              <button
                onClick={() => void lookUp()}
                disabled={looking || !pasteUrl.trim()}
                className="shrink-0 rounded bg-amber px-3 py-2 font-mono text-[0.6rem] font-medium uppercase tracking-widest text-bg disabled:opacity-40"
              >
                {looking ? "Looking…" : "Look up"}
              </button>
            </div>
          )}

          {!editing && mode === "search" && (
            <div className="flex flex-col gap-2">
              {!vimeoSearch && !youtubeSearch ? (
                <p className="font-mono text-[0.65rem] text-dim">
                  Catalogue search needs an API key — see .env.example (VIMEO_ACCESS_TOKEN /
                  YOUTUBE_API_KEY). Paste a link instead; that works right now with no setup.
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="flex gap-1 rounded border border-line bg-bg p-1">
                      {(["vimeo", "youtube"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setSearchSource(s)}
                          disabled={s === "vimeo" ? !vimeoSearch : !youtubeSearch}
                          aria-pressed={searchSource === s}
                          className={`rounded px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest disabled:opacity-30 ${
                            searchSource === s ? "bg-surface text-amber" : "text-dim"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                      placeholder="Film title…"
                      className="flex-1 rounded border border-line bg-bg px-2 py-2 font-mono text-xs text-cream"
                    />
                    <button
                      onClick={() => void runSearch()}
                      disabled={searching || !query.trim()}
                      className="shrink-0 rounded bg-amber px-3 py-2 font-mono text-[0.6rem] font-medium uppercase tracking-widest text-bg disabled:opacity-40"
                    >
                      {searching ? "…" : "Search"}
                    </button>
                  </div>
                  {results.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {results.map((r) => (
                        <button
                          key={`${r.source}-${r.videoId}`}
                          onClick={() => pickResult(r)}
                          className="flex flex-col gap-1 rounded border border-line bg-bg p-2 text-left"
                        >
                          {r.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.thumb} alt="" className="aspect-video w-full rounded object-cover" />
                          )}
                          <p className="line-clamp-2 font-mono text-[0.65rem] text-cream">{r.title}</p>
                          <p className="truncate font-mono text-[0.55rem] text-dim">
                            {r.director}
                            {r.runtimeSec ? ` · ${runtimeLabel(r.runtimeSec)}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {draft && (mode === "blank" || editing) && (
            <div className="flex flex-col gap-2">
              {draft.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.thumb} alt="" className="aspect-video w-full rounded object-cover" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">Title</span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                    Director
                  </span>
                  <input
                    value={draft.director}
                    onChange={(e) => setDraft({ ...draft, director: e.target.value })}
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">Year</span>
                  <input
                    value={draft.year}
                    onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                    inputMode="numeric"
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                    Runtime (seconds)
                  </span>
                  <input
                    value={draft.runtimeSec}
                    onChange={(e) => setDraft({ ...draft, runtimeSec: e.target.value })}
                    inputMode="numeric"
                    placeholder={draft.source === "youtube" ? "YouTube doesn't say — enter it" : ""}
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                    Source
                  </span>
                  <select
                    value={draft.source}
                    onChange={(e) => setDraft({ ...draft, source: e.target.value as "vimeo" | "youtube" })}
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  >
                    <option value="vimeo">Vimeo</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                    Video ID
                  </span>
                  <input
                    value={draft.videoId}
                    onChange={(e) => setDraft({ ...draft, videoId: e.target.value })}
                    className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                  Channels
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => toggleChannel(c.key)}
                      aria-pressed={draft.channels.includes(c.key)}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-widest ${
                        draft.channels.includes(c.key)
                          ? "border-amber bg-amber/15 text-amber"
                          : "border-line text-dim"
                      }`}
                    >
                      {c.glyph} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                  Pedigree — transcribed from the actual festival record. &quot;Shortlisted&quot; is
                  not &quot;nominated&quot; is not &quot;won&quot;.
                </span>
                <input
                  value={draft.pedigree}
                  onChange={(e) => setDraft({ ...draft, pedigree: e.target.value })}
                  placeholder="Sundance 2023 — Short Film Grand Jury Prize"
                  className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                  Synopsis — the filmmaker&apos;s own framing
                </span>
                <textarea
                  value={draft.synopsis}
                  onChange={(e) => setDraft({ ...draft, synopsis: e.target.value })}
                  rows={2}
                  className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                  Thumbnail URL — a frame for the television screen
                </span>
                <input
                  value={draft.thumb}
                  onChange={(e) => setDraft({ ...draft, thumb: e.target.value })}
                  className="rounded border border-line bg-bg px-2 py-1.5 font-mono text-xs text-cream"
                />
              </label>

              <div className="flex gap-2">
                <button
                  onClick={() => void save()}
                  disabled={busy === "save"}
                  className="flex-1 rounded bg-amber px-3 py-2 font-mono text-[0.65rem] font-medium uppercase tracking-widest text-bg disabled:opacity-40"
                >
                  {busy === "save" ? "Saving…" : editing ? "Save changes" : "Add to the bill"}
                </button>
                <a
                  href={watchUrl(draft)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim"
                >
                  Preview ↗
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <p className="eyebrow">On the bill ({showing.length})</p>
        {/* Grouped by channel rather than one flat list of 24 — a film tagged
            onto two channels (Huella is both Midnight and Heartache) shows up
            under each, same as it plays in both rotations on the actual set.
            Every channel gets a section even at zero, so a thin channel is
            something you SEE here rather than something you'd have to notice
            was missing. */}
        {CHANNELS.map((c) => {
          const films = showing.filter((s) => s.channels.includes(c.key));
          return (
            <div key={c.key} className="flex flex-col gap-2">
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-amber">
                {c.glyph} {c.label} ({films.length})
              </p>
              {films.length === 0 ? (
                <p className="font-mono text-[0.65rem] text-dim">Nothing on this channel yet.</p>
              ) : (
                films.map((s) => <FilmRow key={s.id} short={s} onEdit={startEdit} onArchive={setStatus} busy={busy} />)
              )}
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Archived ({archived.length})</p>
          {archived.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded border border-line bg-surface/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-dim">{s.title}</p>
                <p className="truncate font-mono text-[0.6rem] text-dim/70">
                  {s.director} · {s.year}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => void setStatus(s.id, "showing")}
                  disabled={busy === s.id}
                  className="rounded border border-line px-2 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-amber disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  onClick={() => void remove(s.id, s.title)}
                  disabled={busy === s.id}
                  className="rounded border border-line px-2 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One row in a channel's list — pulled out once it needed to render inside
 * fourteen separate sections instead of one flat map. */
function FilmRow({
  short: s,
  onEdit,
  onArchive,
  busy,
}: {
  short: ShortRow;
  onEdit: (s: ShortRow) => void;
  onArchive: (id: string, status: "showing" | "archived") => void;
  busy: string | null;
}) {
  return (
    <div className="flex gap-3 rounded border border-line bg-surface p-3">
      {s.thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumb} alt="" className="h-16 w-28 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg leading-tight text-cream">{s.title}</p>
        <p className="truncate font-mono text-[0.65rem] text-dim">
          {s.director} · {s.year} · {runtimeLabel(s.runtimeSec)}
        </p>
        {s.channels.length > 1 && (
          <p className="mt-0.5 font-mono text-[0.6rem] text-avail">
            Also on: {s.channels.map((k) => CHANNELS.find((c) => c.key === k)?.label ?? k).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          onClick={() => onEdit(s)}
          className="rounded border border-line px-2 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim"
        >
          Edit
        </button>
        <button
          onClick={() => onArchive(s.id, "archived")}
          disabled={busy === s.id}
          className="rounded border border-line px-2 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim disabled:opacity-40"
        >
          Archive
        </button>
      </div>
    </div>
  );
}
