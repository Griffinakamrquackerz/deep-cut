"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import FilmLeader from "@/components/FilmLeader";
import RatingsBadges from "@/components/RatingsBadges";
import VerdictMedia from "./VerdictMedia";
import type { MovieRatings } from "@/lib/tmdb";
import type { Service } from "@/lib/services";
import { sfxClick, sfxGavel, sfxPop, haptic } from "@/lib/sfx";
import {
  SETTLE_QUESTIONS,
  SETTLE_POOL,
  candidatesToFilms,
  poolQueryFor,
  rankVerdicts,
  type Mood,
  type SettleAnswers,
  type Verdict,
} from "@/lib/settle";

type Stage = "intro" | "quiz1" | "handoff" | "quiz2" | "computing" | "verdict" | "exhibit" | "done";
type Sheet = Partial<Record<(typeof SETTLE_QUESTIONS)[number]["key"], unknown>>;
interface Enrich {
  runtime: number | null;
  streaming: string[];
  ratings: MovieRatings | null;
}

// Campy jury quips cycled on the deliberation screen.
const DELIBERATIONS = [
  "consulting the ledger…",
  "flipping a two-headed coin…",
  "polling the back row…",
  "checking who paid for snacks…",
  "overruling your worst instincts…",
  "cross-referencing the deep cuts…",
];

const MOOD_WORD: Record<Mood, string> = { laugh: "Funny", scared: "Scary", feel: "Feels" };
const BRAIN_WORD = ["No brain", "Some brain", "A puzzle"];
function pickChips(a: SettleAnswers): string[] {
  return [
    MOOD_WORD[a.mood],
    BRAIN_WORD[a.brain],
    a.wantsShort ? "Under 100" : "Any length",
    SETTLE_QUESTIONS[4].options.find((option) => option.value === a.obscurity)?.label ?? "",
  ].filter(Boolean);
}

function toAnswers(name: string, sheet: Sheet): SettleAnswers {
  return {
    name,
    mood: sheet.mood as Mood,
    brain: sheet.brain as 0 | 1 | 2,
    wantsShort: sheet.wantsShort as boolean,
    wantsNew: sheet.wantsNew as boolean,
    obscurity: sheet.obscurity as SettleAnswers["obscurity"],
  };
}

/** Build the ranked pool: TMDB real-data blended with curated house picks. */
async function buildVerdicts(
  p1: SettleAnswers,
  p2: SettleAnswers,
  mineOnly = false,
): Promise<Verdict[]> {
  const q = poolQueryFor(p1, p2);
  try {
    const res = await fetch("/api/settle/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genreIds: q.genreIds,
        obscurityMin: q.obscurityMin,
        obscurityMax: q.obscurityMax,
        eitherShort: q.eitherShort,
        myServicesOnly: mineOnly,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const real = candidatesToFilms(data.candidates ?? [], q.eitherShort);
      // Platforms filter: rank ONLY streamable films, never pad with the curated
      // docket (no streaming data). Unfiltered: splice curated in as before.
      if (mineOnly) {
        if (real.length >= 3) return rankVerdicts(p1, p2, real);
        // too few on their platforms → fall through to the curated docket
      } else if (real.length >= 6) {
        return rankVerdicts(p1, p2, [...real, ...SETTLE_POOL]);
      }
    }
  } catch {
    /* fall through to curated */
  }
  return rankVerdicts(p1, p2); // offline / error / thin platforms → curated docket rules
}

function ProgressBulbs({ at }: { at: number }) {
  return (
    <div className="flex justify-center gap-2.5" aria-label={`Question ${at + 1} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ${
            i <= at ? "bg-amber shadow-[0_0_8px_1px_rgba(255,180,84,0.8)]" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function Quiz({ player, onDone }: { player: string; onDone: (sheet: Sheet) => void }) {
  const [qi, setQi] = useState(0);
  const [sheet, setSheet] = useState<Sheet>({});
  const [picked, setPicked] = useState<number | null>(null);
  const q = SETTLE_QUESTIONS[qi];

  function answer(optIdx: number) {
    if (picked !== null) return;
    setPicked(optIdx);
    haptic(10);
    const next: Sheet = { ...sheet, [q.key]: q.options[optIdx].value };
    setTimeout(() => {
      setPicked(null);
      if (qi === SETTLE_QUESTIONS.length - 1) onDone(next);
      else {
        setSheet(next);
        setQi(qi + 1);
      }
    }, 220);
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-5 py-10">
      <header className="text-center">
        <p className="eyebrow">{player} · question {qi + 1} of 5</p>
        <ProgressBulbs at={qi} />
      </header>
      <h1 className="title-card rack-in text-center text-4xl leading-tight">
        {q.prompt.toUpperCase()}
      </h1>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3">
        {q.options.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => answer(i)}
            aria-pressed={picked === i}
            className={`rounded px-4 py-4 font-mono text-sm uppercase tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
              picked === i
                ? "bg-amber font-medium text-bg"
                : "border border-line bg-surface text-cream active:bg-amber active:text-bg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </main>
  );
}

export default function SettleFlow({ myServices = [] }: { myServices?: Service[] }) {
  const [stage, setStage] = useState<Stage>("intro");
  const [bestOf3, setBestOf3] = useState(false);
  const [mineOnly, setMineOnly] = useState(false); // "only on my platforms"
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p1, setP1] = useState<SettleAnswers | null>(null);
  const [p2, setP2] = useState<SettleAnswers | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [vi, setVi] = useState(0); // verdict on the table (single mode)
  // Real runtime + streaming reported up by VerdictMedia, keyed by title|year.
  const [meta, setMeta] = useState<Record<string, Enrich>>({});
  const [deliberation, setDeliberation] = useState(DELIBERATIONS[0]);

  // Best-of-3 state
  const [exhibitIdx, setExhibitIdx] = useState(0);
  const [finalists, setFinalists] = useState<number[]>([]);
  const [flash, setFlash] = useState<"kept" | "tossed" | null>(null);

  const name1 = p1Name.trim() || "Player 1";
  const name2 = p2Name.trim() || "Player 2";

  const current = stage === "exhibit" ? verdicts[exhibitIdx] : verdicts[vi];

  // Gavel + buzz when a ruling hits the table.
  useEffect(() => {
    if (stage === "verdict") {
      sfxGavel();
      haptic([40, 60, 40]);
    }
  }, [stage, vi]);

  // Cycle jury quips while deliberating.
  useEffect(() => {
    if (stage !== "computing") return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % DELIBERATIONS.length;
      setDeliberation(DELIBERATIONS[i]);
    }, 500);
    return () => clearInterval(t);
  }, [stage]);

  async function finishP2(sheet: Sheet) {
    if (!p1) return;
    const answers2 = toAnswers(name2, sheet);
    setP2(answers2);
    setStage("computing");
    const ranked = await buildVerdicts(p1, answers2, mineOnly);
    setVerdicts(ranked);
    setVi(0);
    setExhibitIdx(0);
    setFinalists([]);
    // Short drumroll regardless of how fast the pool resolved.
    setTimeout(() => setStage(bestOf3 ? "exhibit" : "verdict"), 700);
  }

  function reset() {
    setP1(null);
    setP2(null);
    setVerdicts([]);
    setVi(0);
    setExhibitIdx(0);
    setFinalists([]);
    setFlash(null);
    setStage("intro");
  }

  async function shareRuling(
    film: {
      title: string;
      year: number;
      posterPath?: string | null;
      vibe: string;
      houseConviction: number;
    },
    overruled: boolean,
  ) {
    sfxPop();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://thedeepcut.xyz";
    const params = new URLSearchParams({
      title: film.title,
      year: String(film.year),
      vibe: film.vibe,
      conviction: String(film.houseConviction),
      mode: overruled ? "overruled" : "settled",
    });
    if (film.posterPath) params.set("poster", film.posterPath);
    if (p1?.name) params.set("p1", p1.name);
    if (p2?.name) params.set("p2", p2.name);
    const imageUrl = `${origin}/api/settle/verdict-image?${params.toString()}`;
    const link = `${origin}/settle`;
    const text = `⚖️ The house says we're watching ${film.title} (${film.year}). Settle yours:`;

    // Best case: share the actual verdict card (Web Share Level 2 — iOS/Android).
    try {
      if (typeof navigator !== "undefined" && "canShare" in navigator) {
        const blob = await fetch(imageUrl).then((r) => r.blob());
        const file = new File([blob], "settled.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text, title: "Settle It — Deep Cut" });
          return;
        }
      }
    } catch {
      // fall through to link sharing
    }

    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: "Settle It — Deep Cut", text, url: link }).catch(() => null);
    } else if (typeof navigator !== "undefined") {
      await navigator.clipboard.writeText(`${text} ${link}`).catch(() => null);
    }
  }

  // ── Best-of-3 voting ──────────────────────────────────────────────
  function voteExhibit(keep: boolean) {
    if (flash) return; // ignore taps mid-stamp
    if (keep) {
      sfxPop();
      haptic(20);
    } else {
      haptic(8);
    }
    setFlash(keep ? "kept" : "tossed");
    const nextFinalists = keep ? [...finalists, exhibitIdx] : finalists;
    // Let the KEPT/TOSSED stamp land before advancing.
    setTimeout(() => {
      setFinalists(nextFinalists);
      setFlash(null);
      if (exhibitIdx >= 2) {
        const winner = nextFinalists.length ? Math.min(...nextFinalists) : 0;
        setVi(winner);
        setStage("verdict"); // the verdict effect plays the gavel
      } else {
        setExhibitIdx((i) => i + 1);
      }
    }, 600);
  }

  // ── INTRO ─────────────────────────────────────────────────────────
  if (stage === "intro") {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-8 px-5 py-10">
        <header className="text-center">
          <p className="slate slate--center">
            <b>Deep Cut presents</b>
          </p>
          <h1 className="title-card rack-in mt-2.5 text-6xl leading-[0.9]">Settle <em>it</em></h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-dim">
            Two of you, one phone, one movie. Nobody compromises out loud.
          </p>
        </header>
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <input
            value={p1Name}
            onChange={(e) => setP1Name(e.target.value)}
            placeholder="Player 1"
            maxLength={20}
            aria-label="Player 1 name"
            className="rounded border border-line bg-surface px-3 py-3 text-center text-cream placeholder:text-dim/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          />
          <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-ticket">vs</p>
          <input
            value={p2Name}
            onChange={(e) => setP2Name(e.target.value)}
            placeholder="Player 2"
            maxLength={20}
            aria-label="Player 2 name"
            className="rounded border border-line bg-surface px-3 py-3 text-center text-cream placeholder:text-dim/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          />
          <button
            onClick={() => {
              sfxPop();
              setBestOf3((b) => !b);
            }}
            aria-pressed={bestOf3}
            className={`flex items-center justify-between rounded border px-3 py-2.5 ${
              bestOf3 ? "border-amber bg-surface" : "border-line bg-surface"
            }`}
          >
            <span className="text-left">
              <span className="block font-mono text-xs uppercase tracking-wider text-cream">
                ⚖️ Best of 3
              </span>
              <span className="font-mono text-[0.6rem] text-dim">
                the house deals 3, you keep the keepers
              </span>
            </span>
            <span
              className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase ${
                bestOf3 ? "border-amber text-amber" : "border-line text-dim"
              }`}
            >
              {bestOf3 ? "On" : "Off"}
            </span>
          </button>
          {myServices.length > 0 && (
            <button
              onClick={() => {
                sfxPop();
                setMineOnly((b) => !b);
              }}
              aria-pressed={mineOnly}
              className={`flex items-center justify-between rounded border px-3 py-2.5 ${
                mineOnly ? "border-amber bg-surface" : "border-line bg-surface"
              }`}
            >
              <span className="text-left">
                <span className="block font-mono text-xs uppercase tracking-wider text-cream">
                  📺 Only on my platforms
                </span>
                <span className="font-mono text-[0.6rem] text-dim">
                  the verdict only rules on films you can stream
                </span>
              </span>
              <span
                className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase ${
                  mineOnly ? "border-amber text-amber" : "border-line text-dim"
                }`}
              >
                {mineOnly ? "On" : "Off"}
              </span>
            </button>
          )}
          <button
            onClick={() => {
              sfxClick();
              setStage("quiz1");
            }}
            className="pulse-cta mt-1 rounded bg-ticket px-6 py-4 font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
          >
            ★ Start the standoff ★
          </button>
        </div>
        <div className="film-strip" aria-hidden />
      </main>
    );
  }

  if (stage === "quiz1") {
    return (
      <Quiz
        player={name1}
        onDone={(sheet) => {
          setP1(toAnswers(name1, sheet));
          setStage("handoff");
        }}
      />
    );
  }

  if (stage === "handoff") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-10 text-center">
        <div className="film-strip w-full" aria-hidden />
        <div>
          <p className="slate slate--center"><b>Intermission</b></p>
          <h1 className="title-card rack-in mt-2.5 text-5xl leading-[0.95]">Pass the <em>phone</em></h1>
          <p className="mt-3 text-sm text-dim">
            {name1}, your testimony is sealed. 🤐
            <br />
            No peeking over shoulders.
          </p>
        </div>
        <button
          onClick={() => {
            sfxClick();
            haptic(15);
            setStage("quiz2");
          }}
          className="pulse-cta w-full max-w-sm rounded bg-ticket px-6 py-4 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream"
        >
          I&apos;m {name2} — deal me in
        </button>
        <div className="film-strip w-full" aria-hidden />
      </main>
    );
  }

  if (stage === "quiz2") {
    return <Quiz player={name2} onDone={finishP2} />;
  }

  if (stage === "computing") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <FilmLeader label={deliberation} />
      </main>
    );
  }

  if (stage === "done") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 text-center">
        <p className="font-display text-5xl text-amber">ENJOY THE SHOW</p>
        <p className="font-mono text-xs uppercase tracking-widest text-dim">
          🍿 case closed · the house thanks you
        </p>
        <button
          onClick={reset}
          className="rounded border border-amber px-5 py-3 font-mono text-xs uppercase tracking-widest text-amber"
        >
          Settle another
        </button>
        <Link href="/" className="font-mono text-[0.65rem] uppercase tracking-widest text-dim">
          ← back to Deep Cut
        </Link>
      </main>
    );
  }

  if (!current) return null;
  const { film } = current;
  const mkey = `${film.title}|${film.year}`;
  const m = meta[mkey];
  const runtime = m?.runtime ?? (film.tmdbId ? null : film.min);
  const streaming = m?.streaming?.length ? m.streaming : film.tmdbId ? [] : film.streaming;

  const FilmCard = (
    <div className="film-card mx-auto flex w-full max-w-sm flex-col gap-3 rounded-lg p-4">
      <VerdictMedia
        key={mkey}
        title={film.title}
        year={film.year}
        genres={film.genres}
        tmdbId={film.tmdbId}
        knownPoster={film.posterPath}
        onMeta={(mm) => setMeta((prev) => ({ ...prev, [mkey]: mm }))}
      />
      <div className="min-w-0">
        <p className="font-display text-2xl leading-tight text-cream">{film.title}</p>
        <p className="font-mono text-[0.65rem] text-dim">
          {film.year}
          {runtime ? ` · ${runtime} min` : ""}
        </p>
        <p className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-amber/80">
          {film.genres.join(" · ")}
        </p>
        {m?.ratings && <RatingsBadges className="mt-1.5" ratings={m.ratings} />}
        <p className="mt-2 text-sm italic text-amber">{film.vibe}</p>
        {streaming.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {streaming.map((s) => (
              <span
                key={s}
                className="rounded-sm border border-avail/60 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-avail"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── BEST-OF-3 EXHIBIT ─────────────────────────────────────────────
  if (stage === "exhibit") {
    return (
      <main className="flex min-h-dvh flex-col gap-5 px-5 py-10">
        <header className="text-center">
          <p className="slate slate--center">
            <b>The docket · best of 3</b>
          </p>
          <h1 className="title-card rack-in mt-2.5 text-4xl">
            EXHIBIT {["A", "B", "C"][exhibitIdx]}
          </h1>
          <p className="mt-1 font-mono text-[0.65rem] text-dim">
            {finalists.length} kept · {exhibitIdx + 1} of 3
          </p>
        </header>
        <div className="relative">
          {FilmCard}
          {flash && (
            <span
              className={`verdict-stamp stamp-slam pointer-events-none absolute right-6 top-2 z-10 text-2xl ${
                flash === "tossed" ? "tossed" : ""
              }`}
            >
              {flash === "kept" ? "KEPT" : "TOSSED"}
            </span>
          )}
        </div>
        <div className="ticket-edge mx-auto w-full max-w-sm rounded bg-surface p-4">
          <p className="eyebrow mb-1 text-ticket">The house submits</p>
          <p className="text-sm leading-relaxed text-cream">{current.why}</p>
        </div>
        <div className="mx-auto flex w-full max-w-sm gap-2.5">
          <button
            onClick={() => voteExhibit(false)}
            className="flex-1 rounded border border-line px-5 py-3.5 font-mono text-xs uppercase tracking-widest text-dim active:bg-line"
          >
            👎 Toss it
          </button>
          <button
            onClick={() => voteExhibit(true)}
            className="flex-1 rounded bg-amber px-5 py-3.5 font-mono text-xs font-medium uppercase tracking-widest text-bg"
          >
            👍 Keep it
          </button>
        </div>
      </main>
    );
  }

  // ── VERDICT (single mode, or best-of-3 final ruling) ──────────────
  const isRuling = bestOf3;
  return (
    <main className="flex min-h-dvh flex-col gap-5 px-5 py-10">
      <header className="text-center">
        <p className="slate slate--center">
          <b>The house rules</b>
        </p>
        <h1 className="title-card rack-in mt-2.5 text-4xl">
          {isRuling ? "THE RULING" : "THE VERDICT"}
        </h1>
        {isRuling && (
          <p className="mt-1 font-mono text-[0.65rem] text-dim">
            {finalists.length
              ? `you kept ${finalists.length} — the house picks the best`
              : "you tossed all three — the house overrules"}
          </p>
        )}
      </header>

      <div className="relative">
        {FilmCard}
        <span
          key={vi}
          className={`verdict-stamp stamp-slam pointer-events-none absolute right-6 top-1 z-10 text-3xl ${
            isRuling && !finalists.length ? "tossed" : ""
          }`}
        >
          {isRuling && !finalists.length ? "OVERRULED" : "SETTLED"}
        </span>
      </div>

      <div className="ticket-edge mx-auto w-full max-w-sm rounded bg-surface p-4">
        <p className="eyebrow mb-1 text-ticket">Why this settles it</p>
        <p className="text-sm leading-relaxed text-cream">{current.why}</p>
      </div>

      {p1 && p2 && (
        <div className="mx-auto w-full max-w-sm">
          <p className="eyebrow mb-2 text-center">Tale of the tape</p>
          <div className="grid grid-cols-2 gap-2">
            {[p1, p2].map((pl, i) => (
              <div
                key={i}
                className="rounded border border-line bg-surface p-3 text-center"
              >
                <p className="truncate font-display text-xl text-amber">{pl.name}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {pickChips(pl).map((c) => (
                    <li
                      key={c}
                      className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-dim"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-sm flex-col gap-2.5">
        <button
          onClick={() => {
            sfxPop();
            // Accepting the ruling is a taste spark for the winning film
            // (fire-and-forget; signed-out couches just 401 silently).
            if (film.tmdbId) {
              void fetch("/api/signals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ movieId: film.tmdbId, source: "settle_verdict" }),
              }).catch(() => null);
            }
            setStage("done");
          }}
          className="pulse-cta rounded bg-ticket px-5 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream"
        >
          ★ That&apos;ll do ★
        </button>
        <button
          onClick={() => void shareRuling(film, isRuling && !finalists.length)}
          className="rounded border border-amber px-5 py-3 font-mono text-xs uppercase tracking-widest text-amber"
        >
          📸 Share the ruling
        </button>
        {!isRuling && (
          <button
            onClick={() => {
              sfxClick();
              setVi((i) => Math.min(i + 1, verdicts.length - 1));
            }}
            disabled={vi >= verdicts.length - 1}
            className="rounded border border-line px-5 py-3 font-mono text-xs uppercase tracking-widest text-dim disabled:opacity-40"
          >
            Deal a different verdict
          </button>
        )}
        <button
          onClick={reset}
          className="rounded border border-line px-5 py-3 font-mono text-xs uppercase tracking-widest text-dim"
        >
          Settle another
        </button>
      </div>
    </main>
  );
}
