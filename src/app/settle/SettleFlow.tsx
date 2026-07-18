"use client";
import { useState } from "react";
import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import FilmLeader from "@/components/FilmLeader";
import Poster from "@/components/Poster";
import {
  SETTLE_QUESTIONS,
  rankVerdicts,
  type Mood,
  type SettleAnswers,
  type Verdict,
} from "@/lib/settle";

type Stage = "intro" | "quiz1" | "handoff" | "quiz2" | "computing" | "verdict" | "done";

// Raw tap values collected per player, keyed by question key.
type Sheet = Partial<Record<(typeof SETTLE_QUESTIONS)[number]["key"], unknown>>;

function toAnswers(name: string, sheet: Sheet): SettleAnswers {
  return {
    name,
    mood: sheet.mood as Mood,
    brain: sheet.brain as 0 | 1 | 2,
    wantsShort: sheet.wantsShort as boolean,
    wantsNew: sheet.wantsNew as boolean,
    obscurity: sheet.obscurity as 0 | 2 | 4,
  };
}

/** 5 progress bulbs — lit up to the current question. */
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

function Quiz({
  player,
  onDone,
}: {
  player: string;
  onDone: (sheet: Sheet) => void;
}) {
  const [qi, setQi] = useState(0);
  const [sheet, setSheet] = useState<Sheet>({});
  const [picked, setPicked] = useState<number | null>(null);
  const q = SETTLE_QUESTIONS[qi];

  function answer(optIdx: number) {
    if (picked !== null) return; // ignore double-taps mid-transition
    setPicked(optIdx);
    const next: Sheet = { ...sheet, [q.key]: q.options[optIdx].value };
    // Brief solid-fill beat so the selection is unambiguous, then advance.
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
      <h1 className="text-center font-display text-4xl leading-tight text-cream">
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

export default function SettleFlow() {
  const [stage, setStage] = useState<Stage>("intro");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p1, setP1] = useState<SettleAnswers | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [vi, setVi] = useState(0); // which verdict is on the table

  const name1 = p1Name.trim() || "Player 1";
  const name2 = p2Name.trim() || "Player 2";

  function finishP2(sheet: Sheet) {
    if (!p1) return;
    const p2 = toAnswers(name2, sheet);
    setVerdicts(rankVerdicts(p1, p2));
    setVi(0);
    setStage("computing");
    setTimeout(() => setStage("verdict"), 1200);
  }

  function reset() {
    setP1(null);
    setVerdicts([]);
    setVi(0);
    setStage("intro");
  }

  if (stage === "intro") {
    return (
      <main className="flex min-h-dvh flex-col justify-center gap-8 px-5 py-10">
        <header className="text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-3">Deep Cut presents</p>
          <h1 className="neon-flicker font-display text-6xl leading-[0.9] text-amber">
            SETTLE IT
          </h1>
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
            onClick={() => setStage("quiz1")}
            className="pulse-cta mt-2 rounded bg-ticket px-6 py-4 font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
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
          <p className="eyebrow">Intermission</p>
          <h1 className="glow-amber font-display text-5xl leading-[0.95] text-amber">
            PASS THE PHONE
          </h1>
          <p className="mt-3 text-sm text-dim">
            {name1}, your testimony is sealed. 🤐
            <br />
            No peeking over shoulders.
          </p>
        </div>
        <button
          onClick={() => setStage("quiz2")}
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
        <FilmLeader label="the house is deliberating" />
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

  // stage === "verdict"
  const v = verdicts[vi];
  if (!v) return null;
  const { film } = v;

  return (
    <main className="flex min-h-dvh flex-col gap-5 px-5 py-10">
      <header className="text-center">
        <MarqueeBulbs />
        <p className="eyebrow mt-2">The house rules</p>
        <h1 className="glow-amber font-display text-4xl text-amber">THE VERDICT</h1>
      </header>

      <div className="film-card mx-auto flex w-full max-w-sm gap-4 rounded-lg p-4">
        <div className="w-28 shrink-0">
          <Poster posterPath={null} title={film.title} year={film.year} genres={film.genres} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight text-cream">{film.title}</p>
          <p className="font-mono text-[0.65rem] text-dim">
            {film.year} · {film.min} min
          </p>
          <p className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-amber/80">
            {film.genres.join(" · ")}
          </p>
          <p className="mt-2 text-sm italic text-amber">{film.vibe}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {film.streaming.map((s) => (
              <span
                key={s}
                className="rounded-sm border border-avail/60 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-avail"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ticket-edge mx-auto w-full max-w-sm rounded bg-surface p-4">
        <p className="eyebrow mb-1 text-ticket">Why this settles it</p>
        <p className="text-sm leading-relaxed text-cream">{v.why}</p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-2.5">
        <button
          onClick={() => setStage("done")}
          className="pulse-cta rounded bg-ticket px-5 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream"
        >
          ★ That&apos;ll do ★
        </button>
        <button
          onClick={() => setVi((i) => Math.min(i + 1, verdicts.length - 1))}
          disabled={vi >= verdicts.length - 1}
          className="rounded border border-amber px-5 py-3 font-mono text-xs uppercase tracking-widest text-amber disabled:opacity-40"
        >
          Deal a different verdict
        </button>
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
