"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_GRID } from "@/lib/starter-grid";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import InstallPrompt from "@/components/InstallPrompt";

interface Pick {
  id: number;
  title: string;
  year: number | null;
  poster_path?: string | null;
}

type Step = "films" | "services" | "signature" | "name" | "printing" | "reveal" | "install";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

interface Thread {
  title: string;
  line: string;
}

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("films");
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [services, setServices] = useState<Set<Service>>(new Set());
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posters, setPosters] = useState<Record<number, string | null>>({});
  const [handle, setHandle] = useState("");
  const [sig, setSig] = useState<Pick | null>(null);
  const [sigQuery, setSigQuery] = useState("");
  const [sigResults, setSigResults] = useState<Pick[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poster art for the shelf — grid renders immediately, art fills in.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/starter-grid")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.posters) setPosters(data.posters);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((p: Pick) => {
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else if (next.size < 60) next.set(p.id, p);
      return next;
    });
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    }, 300);
  }, [query]);

  async function searchSignature(q: string) {
    setSigQuery(q);
    if (!q.trim()) return setSigResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
    if (res?.ok) setSigResults(((await res.json()).results ?? []).slice(0, 6));
  }

  async function saveNameAndFinish() {
    const clean = handle.trim().toLowerCase();
    if (!HANDLE_RE.test(clean)) {
      setNameError("3–24 characters: letters, numbers, underscores.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: clean, signatureMovieId: sig?.id ?? null }),
    });
    if (res.status === 409) {
      setNameError("That name's already on the marquee — try another.");
      setSavingName(false);
      return;
    }
    if (!res.ok) {
      setNameError("Couldn't save that name. Try again.");
      setSavingName(false);
      return;
    }
    setSavingName(false);
    await finish();
  }

  async function finish() {
    setStep("printing");
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movieIds: [...picks.keys()],
        services: [...services],
      }),
    });
    if (!res.ok) {
      setError("Something jammed the projector. Try again.");
      setStep("name");
      return;
    }
    // Build the taste profile — the magic moment.
    const gen = await fetch("/api/profile/generate", { method: "POST" });
    if (gen.ok) {
      const data = await gen.json();
      setThreads(data.threads ?? null);
      setStep("reveal");
    } else {
      router.push("/");
    }
  }

  const count = picks.size;

  if (step === "printing") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="eyebrow animate-pulse">Printing your ticket</p>
        <div className="ticket-edge w-full max-w-xs rounded p-6">
          <p className="font-display text-3xl text-amber">BUILDING YOUR PROFILE</p>
          <p className="mt-3 font-mono text-xs text-dim">
            Reading {count} films for taste threads…
          </p>
        </div>
      </main>
    );
  }

  if (step === "reveal" && threads) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
        <p className="eyebrow">Admit One · Taste Profile №001</p>
        <div className="ticket-edge w-full max-w-sm rounded bg-surface p-6">
          <h1 className="font-display text-4xl tracking-wide text-amber">YOUR TASTE</h1>
          <ul className="mt-4 flex flex-col gap-4">
            {threads.map((t) => (
              <li key={t.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">{t.title}</p>
                <p className="mt-1 text-sm text-cream">{t.line}</p>
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setStep("install")}
          className="rounded bg-amber px-6 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
        >
          One last thing →
        </button>
      </main>
    );
  }

  if (step === "install") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10">
        <div className="w-full max-w-sm">
          <InstallPrompt />
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded bg-amber px-6 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
        >
          Deal me movies →
        </button>
        <button
          onClick={() => router.push("/")}
          className="font-mono text-xs uppercase tracking-widest text-dim"
        >
          Skip for now
        </button>
      </main>
    );
  }

  if (step === "services") {
    return (
      <main className="flex min-h-dvh flex-col gap-6 px-4 py-10">
        <div>
          <p className="eyebrow mb-1">Step 2 of 4</p>
          <h1 className="font-display text-4xl text-cream">WHERE DO YOU WATCH?</h1>
          <p className="mt-1 text-sm text-dim">
            We&apos;ll badge every rec that&apos;s watchable tonight.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => {
            const on = services.has(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setServices((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                aria-pressed={on}
                className={`rounded border px-3 py-3 text-left font-mono text-xs uppercase tracking-wider ${
                  on ? "border-avail bg-surface text-avail" : "border-line bg-surface text-dim"
                }`}
              >
                {on ? "✓ " : ""}
                {SERVICE_LABELS[s]}
              </button>
            );
          })}
        </div>
        {error && <p className="text-xs text-ticket">{error}</p>}
        <div className="mt-auto flex gap-3">
          <button
            onClick={() => setStep("films")}
            className="rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim"
          >
            ← Back
          </button>
          <button
            onClick={() => setStep("signature")}
            className="flex-1 rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
          >
            Continue →
          </button>
        </div>
      </main>
    );
  }

  if (step === "signature") {
    return (
      <main className="flex min-h-dvh flex-col gap-6 px-4 py-10">
        <div>
          <p className="eyebrow mb-1">Step 3 of 4</p>
          <h1 className="font-display text-4xl text-cream">YOUR SIGNATURE FILM</h1>
          <p className="mt-1 text-sm text-dim">
            Your favorite film of all time — it fronts your profile as a stills
            collage. Choose like everyone&apos;s watching.
          </p>
        </div>

        {sig ? (
          <div className="ticket-edge rounded bg-surface p-4 text-center">
            <p className="eyebrow">Now enshrined</p>
            {sig.poster_path && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`https://image.tmdb.org/t/p/w342${sig.poster_path}`}
                alt={sig.title}
                className="mx-auto mt-2 w-32 rounded shadow-lg"
              />
            )}
            <p className="glow-amber mt-2 font-display text-2xl text-amber">
              {sig.title.toUpperCase()}{" "}
              <span className="font-mono text-sm text-dim">{sig.year ?? ""}</span>
            </p>
            <button
              onClick={() => {
                setSig(null);
                setSigQuery("");
              }}
              className="mt-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim underline"
            >
              Pick a different one
            </button>
          </div>
        ) : (
          <div>
            <input
              type="search"
              value={sigQuery}
              onChange={(e) => void searchSignature(e.target.value)}
              placeholder="Search your all-time favorite…"
              aria-label="Search your signature film"
              className="w-full rounded border-2 border-amber/60 bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
            />
            {sigResults.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-line rounded border border-line bg-surface">
                {sigResults.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setSig(r);
                        setSigResults([]);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
                    >
                      {r.poster_path ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                          alt=""
                          className="w-8 rounded"
                        />
                      ) : (
                        <span className="w-8 text-center">🎬</span>
                      )}
                      <span className="text-cream">
                        {r.title}{" "}
                        <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-auto flex gap-3">
          <button
            onClick={() => setStep("services")}
            className="rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim"
          >
            ← Back
          </button>
          <button
            onClick={() => setStep("name")}
            disabled={!sig}
            className="flex-1 rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-40"
          >
            Enshrine it →
          </button>
        </div>
      </main>
    );
  }

  if (step === "name") {
    return (
      <main className="flex min-h-dvh flex-col gap-6 px-4 py-10">
        <div>
          <p className="eyebrow mb-1">Step 4 of 4</p>
          <h1 className="font-display text-4xl text-cream">PICK YOUR MARQUEE NAME</h1>
          <p className="mt-1 text-sm text-dim">
            Your handle goes on your taste card and the community marquee — it&apos;s how
            friends find you.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 rounded border-2 border-amber/60 bg-surface px-3 py-2.5">
            <span className="font-mono text-lg text-amber">@</span>
            <input
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                setNameError(null);
              }}
              placeholder="your_handle"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={24}
              aria-label="Choose your handle"
              className="w-full bg-transparent text-lg text-cream outline-none placeholder:text-dim/60"
            />
          </div>
          <p className="mt-1.5 font-mono text-[0.65rem] text-dim">
            3–24 characters · letters, numbers, underscores
          </p>
          {nameError && <p className="mt-1 font-mono text-xs text-ticket">{nameError}</p>}
        </div>
        {handle.length >= 3 && (
          <div className="ticket-edge rounded bg-surface p-4 text-center">
            <p className="eyebrow">Now showing</p>
            <p className="glow-amber font-display text-3xl text-amber">@{handle}</p>
          </div>
        )}
        <div className="mt-auto flex gap-3">
          <button
            onClick={() => setStep("signature")}
            className="rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim"
          >
            ← Back
          </button>
          <button
            onClick={() => void saveNameAndFinish()}
            disabled={savingName || handle.length < 3}
            className="flex-1 rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {savingName ? "Checking the marquee…" : "Sign it & build my profile"}
          </button>
        </div>
      </main>
    );
  }

  // step === "films"
  return (
    <main className="flex min-h-dvh flex-col gap-4 px-4 py-8">
      <div>
        <p className="eyebrow mb-1">Step 1 of 4</p>
        <h1 className="font-display text-4xl text-cream">PICK FILMS YOU LOVE</h1>
        <p className="mt-1 text-sm text-dim">
          Any genre, any era. At least 8 — the more the sharper. Deep cuts and
          guilty pleasures teach us more than classics do.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search any film ever made…"
        aria-label="Search films"
        className="rounded border-2 border-amber/60 bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
      />

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded border border-line bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  toggle(r);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
              >
                {r.poster_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-12 w-8 shrink-0 rounded border border-line bg-bg" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {r.title}{" "}
                  <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                </span>
                <span className="text-amber">{picks.has(r.id) ? "✓" : "+"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="eyebrow">Or grab from the shelf</p>
      <div className="grid grid-cols-4 gap-2">
        {STARTER_GRID.map((f) => {
          const on = picks.has(f.tmdbId);
          const poster = posters[f.tmdbId];
          return (
            <button
              key={f.tmdbId}
              onClick={() =>
                toggle({ id: f.tmdbId, title: f.title, year: f.year, poster_path: poster })
              }
              aria-pressed={on}
              aria-label={`${f.title} (${f.year})`}
              className={`relative aspect-[2/3] overflow-hidden rounded border text-left transition-colors ${
                on ? "border-amber ring-1 ring-amber" : "border-line"
              }`}
            >
              {poster ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://image.tmdb.org/t/p/w342${poster}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                      on ? "opacity-50" : ""
                    }`}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-1.5 pb-1 pt-5">
                    <span
                      className={`block font-display text-[0.65rem] leading-tight ${
                        on ? "text-amber" : "text-cream"
                      }`}
                    >
                      {f.title}
                    </span>
                    <span className="font-mono text-[0.5rem] text-cream/60">{f.year}</span>
                  </span>
                </>
              ) : (
                <span className="flex h-full flex-col justify-between bg-surface/60 p-1.5">
                  <span
                    className={`font-display text-[0.7rem] leading-tight ${
                      on ? "text-amber" : "text-cream"
                    }`}
                  >
                    {f.title}
                  </span>
                  <span className="font-mono text-[0.55rem] text-dim">{f.year}</span>
                </span>
              )}
              {on && (
                <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber font-mono text-xs font-bold text-bg shadow">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          disabled={count < 8}
          onClick={() => setStep("services")}
          className="w-full rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-40"
        >
          {count < 8 ? `Pick ${8 - count} more` : `Continue with ${count} films →`}
        </button>
      </div>
    </main>
  );
}
