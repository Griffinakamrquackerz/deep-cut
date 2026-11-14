"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import Poster from "@/components/Poster";
import RatingsBadges from "@/components/RatingsBadges";
import { sfxClick, sfxPop } from "@/lib/sfx";

// "This Meets That" — name two or three films, meet their offspring. The splice
// runs server-side (/api/blend), shared with the native app: an LLM that
// understands why films combine, backed by a TMDB keyword pull.

const MAX_PARENTS = 3;

// Narration for the splice wait, advanced on a timer. Ordered so the last line
// can sit indefinitely without lying — a slow model just stays "something's
// moving" rather than claiming it finished.
const EXAMPLE_ROTATE_MS = 3000;

const SPLICE_STAGES = [
  "Reading the DNA…",
  "Crossing the strands…",
  "Something's moving…",
] as const;

// Worked examples for the empty state — every one a real result the engine
// returned for those parents, not an invented pairing. They teach the game
// faster than any instruction, and tapping one loads its parents so you can
// run it yourself. One is picked at random per visit for variety.
interface Example {
  parents: SearchHit[];
  child: { id: number; title: string; year: number; poster_path: string };
  line: string;
}

const EXAMPLES: Example[] = [
  {
    parents: [
      { id: 8587, title: "The Lion King", year: 1994, poster_path: "/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg" },
      { id: 597, title: "Titanic", year: 1997, poster_path: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg" },
      { id: 447332, title: "A Quiet Place", year: 2018, poster_path: "/nAU74GmpUk7t5iklEp3bufwDq4n.jpg" },
    ],
    child: { id: 80278, title: "The Impossible", year: 2012, poster_path: "/k0DLCiDbnYywOHiISALbl2EH2NE.jpg" },
    line: "Titanic's catastrophic disaster, Lion King's loss and growth of a young survivor, A Quiet Place's tense family survival silence.",
  },
  {
    parents: [
      { id: 578, title: "Jaws", year: 1975, poster_path: "/lxM6kqilAdpdhqUl2biYp5frUxE.jpg" },
      { id: 137, title: "Groundhog Day", year: 1993, poster_path: "/gCgt1WARPZaXnq523ySQEUKinCs.jpg" },
    ],
    child: { id: 26466, title: "Triangle", year: 2009, poster_path: "/cRlMrbc4Iof7vN0ZqHwJnMBYBLi.jpg" },
    line: "Shipwreck nightmare by way of Groundhog Day's endless loop, mixing Jaws' ocean terror with time\u2011loop dread.",
  },
  {
    parents: [
      { id: 680, title: "Pulp Fiction", year: 1994, poster_path: "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg" },
      { id: 194, title: "Am\u00e9lie", year: 2001, poster_path: "/nSxDa3M9aMvGVLoItzWTepQ5h5d.jpg" },
    ],
    child: { id: 8321, title: "In Bruges", year: 2008, poster_path: "/vz3Vd6nfq9YZrVvyYx5RHFaYKV3.jpg" },
    line: "Pulp Fiction's crime\u2011laden, darkly comic dialogue meets Am\u00e9lie's whimsical kindness and Paris\u2011like small\u2011town charm, wrapped in a moral redemption tale.",
  },
  {
    parents: [
      { id: 694, title: "The Shining", year: 1980, poster_path: "/uAR0AWqhQL1hQa69UDEbb2rE5Wx.jpg" },
      { id: 8363, title: "Superbad", year: 2007, poster_path: "/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg" },
    ],
    child: { id: 22970, title: "The Cabin in the Woods", year: 2012, poster_path: "/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg" },
    line: "The Shining's isolated horror setting meets Superbad's teen party chaos, wrapped in dark meta\u2011comedy.",
  },
  {
    parents: [
      { id: 603, title: "The Matrix", year: 1999, poster_path: "/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg" },
      { id: 76, title: "Before Sunrise", year: 1995, poster_path: "/kf1Jb1c2JAOqjuzA3H4oDM263uB.jpg" },
    ],
    child: { id: 152601, title: "Her", year: 2013, poster_path: "/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg" },
    line: "The Matrix's AI philosophy meets Before Sunrise's intimate urban dialogue, forming a near\u2011future love story about consciousness and connection.",
  },
  {
    parents: [
      { id: 348, title: "Alien", year: 1979, poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg" },
      { id: 2108, title: "The Breakfast Club", year: 1985, poster_path: "/gp4zlj7wgbiofLMNsTPndMuO3PN.jpg" },
    ],
    child: { id: 9276, title: "The Faculty", year: 1998, poster_path: "/5XetJwmAiDC0EtH23NIXaqFn3Wl.jpg" },
    line: "Alien parasite takeover of high school mirrors Alien, while cliques echo Breakfast Club's archetypes.",
  },
  {
    parents: [
      { id: 244786, title: "Whiplash", year: 2014, poster_path: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg" },
      { id: 1091, title: "The Thing", year: 1982, poster_path: "/tzGY49kseSE9QAKk47uuDGwnSCu.jpg" },
    ],
    child: { id: 44214, title: "Black Swan", year: 2010, poster_path: "/viWheBd44bouiLCHgNMvahLThqx.jpg" },
    line: "Whiplash\u2019s brutal quest for flawless performance collides with The Thing\u2019s claustrophobic paranoia and body\u2011transforming dread, set in an isolated ballet company.",
  },
  {
    parents: [
      { id: 289, title: "Casablanca", year: 1943, poster_path: "/lGCEKlJo2CnWydQj7aamY7s1S7Q.jpg" },
      { id: 78, title: "Blade Runner", year: 1982, poster_path: "/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg" },
    ],
    child: { id: 8072, title: "Alphaville", year: 1965, poster_path: "/fFJP3D5fJDFxN7ChqSye1DZ0fTL.jpg" },
    line: "Alphaville's dystopic police state and noir romance echo Casablanca's resistance intrigue and Blade Runner's tech\u2011noir atmosphere.",
  },
  {
    parents: [
      { id: 161, title: "Ocean's Eleven", year: 2001, poster_path: "/hQQCdZrsHtZyR6NbKH2YyCqd2fR.jpg" },
      { id: 376867, title: "Moonlight", year: 2016, poster_path: "/qLnfEmPrDjJfPyyddLJPkXmshkp.jpg" },
    ],
    child: { id: 290098, title: "The Handmaiden", year: 2016, poster_path: "/dLlH4aNHdnmf62umnInL8xPlPzw.jpg" },
    line: "Ocean's Eleven's elaborate con by way of Moonlight's lesbian intimacy, set in a tense, period caper.",
  },
  {
    parents: [
      { id: 419430, title: "Get Out", year: 2017, poster_path: "/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg" },
      { id: 137, title: "Groundhog Day", year: 1993, poster_path: "/gCgt1WARPZaXnq523ySQEUKinCs.jpg" },
    ],
    child: { id: 440021, title: "Happy Death Day", year: 2017, poster_path: "/cTaEIUYTt52ooq9quVbAQ7NpGwo.jpg" },
    line: "Get Out's horror satire meets Groundhog Day's endless repeat, delivering dark comedy and a killer stuck in a time loop.",
  },
  {
    parents: [
      { id: 115, title: "The Big Lebowski", year: 1998, poster_path: "/3bv6WAp6BSxxYvB5ozKFUYuRA8C.jpg" },
      { id: 807, title: "Se7en", year: 1995, poster_path: "/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg" },
    ],
    child: { id: 86838, title: "Seven Psychopaths", year: 2012, poster_path: "/4ukEYAxlSivFcDG6vLxJB6PjTjg.jpg" },
    line: "Seven Psychopaths merges The Big Lebowski's slacker, nihilistic humor with Se7en's sin\u2011based serial killer plot, shot in darkly comic style.",
  },
  {
    parents: [
      { id: 157336, title: "Interstellar", year: 2014, poster_path: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg" },
      { id: 492188, title: "Marriage Story", year: 2019, poster_path: "/2JRyCKaRKyJAVpsIHeLvPw5nHmw.jpg" },
    ],
    child: { id: 24420, title: "The Time Traveler's Wife", year: 2009, poster_path: "/J3ewuzQwhFro0pDpdcbZ4j7MYy.jpg" },
    line: "Time-travel romance confronting inevitable separation, marrying Interstellar's temporal physics with Marriage Story's relentless marital conflict.",
  },
  {
    parents: [
      { id: 496243, title: "Parasite", year: 2019, poster_path: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg" },
      { id: 771, title: "Home Alone", year: 1990, poster_path: "/onTSipZ8R3bliBdKfPtsDuHTdlL.jpg" },
    ],
    child: { id: 19971, title: "The Little Girl Who Lives Down the Lane", year: 1976, poster_path: "/qlH7atDoN2iOmq6pNsoFIlebhgA.jpg" },
    line: "Parasite's tense class\u2011conflict thriller meets Home Alone's solitary child defending home against predators.",
  },
  {
    parents: [
      { id: 329865, title: "Arrival", year: 2016, poster_path: "/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg" },
      { id: 8363, title: "Superbad", year: 2007, poster_path: "/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg" },
    ],
    child: { id: 59678, title: "Attack the Block", year: 2011, poster_path: "/wzCMnA6NDruLzgWeqMcLPDrGAdF.jpg" },
    line: "Attack the Block fuses Arrival's alien contact urgency with Superbad's teenage gang chaos and night\u2011time mischief.",
  },
  {
    parents: [
      { id: 949, title: "Heat", year: 1995, poster_path: "/umSVjVdbVwtx5ryCA2QXL44Durm.jpg" },
      { id: 142, title: "Brokeback Mountain", year: 2005, poster_path: "/aByfQOQBNa4CMFwIgq3QrqY2ZHh.jpg" },
    ],
    child: { id: 9303, title: "Bound", year: 1996, poster_path: "/9qAy6UWVw44dGrsyKrdEMt5qIUM.jpg" },
    line: "Heat's meticulous heist tension fused with Brokeback's forbidden lesbian love, both locked in deadly cat\u2011and\u2011mouse.",
  },
  {
    parents: [
      { id: 37165, title: "The Truman Show", year: 1998, poster_path: "/vuza0WqY239yBXOadKlGwJsZJFE.jpg" },
      { id: 348, title: "Alien", year: 1979, poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg" },
    ],
    child: { id: 2666, title: "Dark City", year: 1998, poster_path: "/tNPEGju4DpTdbhBphNmZoEi9Bd3.jpg" },
    line: "The Truman Show\u2019s fabricated world by alien-like Strangers, merged with Alien\u2019s parasitic horror and claustrophobic chase.",
  },
  {
    parents: [
      { id: 641, title: "Requiem for a Dream", year: 2000, poster_path: "/9BTwsLaMVHOGFlmsSlx5QYCaXb.jpg" },
      { id: 252, title: "Willy Wonka & the Chocolate Factory", year: 1971, poster_path: "/vmpsZkrs4Uvkp9r1atL8B3frA63.jpg" },
    ],
    child: { id: 1417, title: "Pan's Labyrinth", year: 2006, poster_path: "/z7xXihu5wHuSMWymq5VAulPVuvg.jpg" },
    line: "Requiem's hallucinatory descent meets Wonka's whimsical trials, a dark fairy\u2011tale testing a child\u2019s survival.",
  },
];

function Thumb({ path, alt, className = "" }: { path: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`https://image.tmdb.org/t/p/w92${path}`}
      alt={alt}
      loading="lazy"
      className={`shrink-0 rounded object-cover ${className}`}
    />
  );
}

interface SearchHit {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
}

interface BlendPick {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  genres: string[];
  reason: string;
  tmdb_rating: number | null;
  imdb_rating: number | null;
  rt_rating: number | null;
  fromVault?: boolean;
}

export default function BlendGame() {
  const [parents, setParents] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [picks, setPicks] = useState<BlendPick[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chosen after mount, never during render — this component is server-rendered
  // and a random pick at render time would mismatch on hydration.
  // null until mounted: this component server-renders, and choosing during
  // render would mismatch on hydration. Starts on a random example so repeat
  // visits don't open on the same one, then cycles.
  const [exampleIdx, setExampleIdx] = useState<number | null>(null);
  const [holdExample, setHoldExample] = useState(false);
  useEffect(() => {
    setExampleIdx((cur) => cur ?? Math.floor(Math.random() * EXAMPLES.length));
  }, []);
  useEffect(() => {
    if (exampleIdx === null || holdExample) return;
    const t = setInterval(
      () => setExampleIdx((i) => ((i ?? 0) + 1) % EXAMPLES.length),
      EXAMPLE_ROTATE_MS,
    );
    return () => clearInterval(t);
  }, [exampleIdx, holdExample]);
  const example = exampleIdx === null ? null : EXAMPLES[exampleIdx];

  // A real splice is a model thinking for 10-20 seconds. Narrating it beats a
  // frozen button: the wait becomes the show instead of a suspected hang.
  const [stage, setStage] = useState<string>(SPLICE_STAGES[0]);
  useEffect(() => {
    if (!busy) {
      setStage(SPLICE_STAGES[0]);
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(i + 1, SPLICE_STAGES.length - 1);
      setStage(SPLICE_STAGES[i]);
    }, 2600);
    return () => clearInterval(t);
  }, [busy]);

  function search(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .catch(() => null);
      setResults(((data?.results ?? []) as SearchHit[]).slice(0, 6));
    }, 300);
  }

  function addParent(hit: SearchHit) {
    if (parents.length >= MAX_PARENTS || parents.some((p) => p.id === hit.id)) return;
    sfxPop();
    setParents((p) => [...p, hit]);
    setQuery("");
    setResults([]);
    setPicks(null); // the lineup changed — the last splice is stale
  }

  function removeParent(id: number) {
    setParents((p) => p.filter((x) => x.id !== id));
    setPicks(null);
  }

  async function splice() {
    if (parents.length < 2) return;
    sfxClick();
    setBusy(true);
    setError(null);
    setPicks(null);
    const res = await fetch("/api/blend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieIds: parents.map((p) => p.id) }),
    }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (!data) setError("The splice didn't take. Try again.");
    else if (!data.picks?.length) setError("No offspring survived. Swap one out.");
    else setPicks(data.picks as BlendPick[]);
    setBusy(false);
  }

  const canSplice = parents.length >= 2;

  return (
    <main className="flex min-h-dvh flex-col gap-4 px-5 py-8">
      <header className="text-center">
        <MarqueeBulbs />
        <p className="eyebrow mt-2">The splice</p>
        <h1 className="glow-amber neon-flicker font-display text-5xl text-amber">THIS MEETS THAT</h1>
        <p className="mt-1 font-mono text-[0.65rem] text-dim">
          Combine two or three. See what crawls out.
        </p>
      </header>

      {/* The bench. Always three slots, filled or waiting — the shape of the
          game is visible before you've done anything, and the next slot to
          fill breathes so it reads as the live one. */}
      <div className="rounded border border-line bg-surface/40 px-3 py-4">
        <div className="flex items-end justify-center gap-1.5">
          {Array.from({ length: MAX_PARENTS }).map((_, i) => {
            const p = parents[i];
            const isNext = !p && i === parents.length;
            return (
              <div key={p?.id ?? `slot-${i}`} className="flex items-end gap-1.5">
                {i > 0 && (
                  <span
                    className={`pb-8 font-display text-xs ${
                      p || isNext ? "text-amber" : "text-dim/40"
                    }`}
                  >
                    meets
                  </span>
                )}
                {p ? (
                  <button
                    onClick={() => removeParent(p.id)}
                    aria-label={`Remove ${p.title}`}
                    className="group relative w-[4.5rem] shrink-0 text-left"
                  >
                    {/* The button owns the width; Poster fills it (it applies
                        w-full), so never pass a width class here. */}
                    <span className={`block ${busy ? "specimen relative overflow-hidden rounded" : ""}`}>
                      <Poster
                        posterPath={p.poster_path}
                        title={p.title}
                        year={p.year}
                        className="rounded ring-1 ring-amber/40"
                      />
                    </span>
                    {!busy && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-bg text-[0.6rem] text-cream transition group-hover:border-ticket group-hover:text-ticket">
                        ✕
                      </span>
                    )}
                    <span className="mt-1 block truncate font-mono text-[0.55rem] text-dim">
                      {p.title}
                    </span>
                  </button>
                ) : (
                  <span className="w-[4.5rem] shrink-0">
                    <span
                      className={`flex aspect-[2/3] w-full items-center justify-center rounded border border-dashed text-xl ${
                        isNext ? "slot-live text-amber" : "border-line/50 text-dim/40"
                      }`}
                    >
                      ＋
                    </span>
                    <span className="mt-1 block text-center font-mono text-[0.55rem] text-dim/50">
                      {i === MAX_PARENTS - 1 ? "optional" : " "}
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* The wait is 10-20s of a model thinking. Narrate it rather than
            leaving a dead button — the lab doing work is half the fun. */}
        {busy && (
          <p className="mt-3 text-center font-mono text-[0.65rem] uppercase tracking-[0.2em] text-amber">
            <span className="helix">🧬</span> {stage}
          </p>
        )}
      </div>

      {parents.length < MAX_PARENTS && (
        <div className="mx-auto w-full max-w-sm">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search a film…"
            className="w-full rounded border border-line bg-surface px-3 py-2.5 font-mono text-sm text-cream placeholder:text-dim"
          />
          {results.length > 0 && (
            <ul className="mt-1.5 overflow-hidden rounded border border-line bg-surface">
              {results.map((r, i) => (
                <li key={r.id} className={i > 0 ? "border-t border-line" : ""}>
                  <button
                    onClick={() => addParent(r)}
                    className="flex w-full items-center gap-3 p-2 text-left hover:bg-bg/50"
                  >
                    {/* A plain img, not <Poster> — that component is built for
                        grid cells and hard-codes w-full, which fights a fixed
                        thumbnail width and stretches the row. */}
                    {r.poster_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://image.tmdb.org/t/p/w92${r.poster_path}`}
                        alt=""
                        loading="lazy"
                        className="h-[54px] w-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-[54px] w-9 shrink-0 items-center justify-center rounded border border-line bg-bg font-display text-base text-dim">
                        {r.title.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-cream">{r.title}</span>
                      <span className="block font-mono text-[0.65rem] text-dim">
                        {r.year ?? "—"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        {/* Only armed once it can actually fire — the carnival glow on a dead
            button is a promise the click won't keep. */}
        <button
          onClick={() => void splice()}
          disabled={!canSplice || busy}
          className={`rounded px-4 py-3.5 font-mono text-xs font-medium uppercase tracking-[0.2em] transition ${
            canSplice && !busy
              ? "pulse-cta bg-ticket text-cream"
              : "cursor-not-allowed border border-line bg-surface text-dim"
          }`}
        >
          {busy ? (
            <>
              <span className="helix">🧬</span> Splicing…
            </>
          ) : (
            "🧬 Splice them 🧬"
          )}
        </button>
        {!canSplice && (
          <p className="text-center font-mono text-[0.65rem] text-dim">
            {parents.length === 0 ? "Pick two films to begin." : "One more."}
          </p>
        )}
        {parents.length > 0 && !busy && (
          <button
            onClick={() => {
              setParents([]);
              setPicks(null);
              setError(null);
            }}
            className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-center font-mono text-xs text-ticket">{error}</p>}

      {/* Empty state only — once you're playing, it gets out of the way. */}
      {parents.length === 0 && !picks && !busy && example && (
        <section
          className="mx-auto w-full max-w-sm rounded border border-line bg-surface/60 p-3"
          // Hold the carousel while someone is actually reading it — three
          // seconds is not long enough to finish the line otherwise.
          onMouseEnter={() => setHoldExample(true)}
          onMouseLeave={() => setHoldExample(false)}
          onFocus={() => setHoldExample(true)}
          onBlur={() => setHoldExample(false)}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="eyebrow">For instance</p>
            <span className="flex gap-1" aria-hidden>
              {EXAMPLES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full transition ${
                    i === exampleIdx ? "bg-amber" : "bg-line"
                  }`}
                />
              ))}
            </span>
          </div>
          <button
            // Re-keying on the index restarts the fade, so each example
            // arrives rather than snapping in.
            key={exampleIdx}
            onClick={() => {
              sfxPop();
              setParents(example.parents);
              setPicks(null);
            }}
            className="example-swap w-full text-left"
          >
            <span className="flex items-center gap-1.5">
              {example.parents.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="font-display text-sm text-dim">+</span>}
                  <Thumb path={p.poster_path ?? ""} alt={p.title} className="h-[78px] w-[52px]" />
                </span>
              ))}
              <span className="px-1 font-display text-xl text-amber">→</span>
              <Thumb
                path={example.child.poster_path}
                alt={example.child.title}
                className="h-[102px] w-[68px] ring-1 ring-amber/60"
              />
            </span>
            <span className="mt-2 block font-mono text-[0.6rem] leading-relaxed text-dim">
              {example.parents.map((p) => p.title).join(" + ")} ={" "}
              <span className="text-cream">
                {example.child.title} ({example.child.year})
              </span>
            </span>
            <span className="mt-1 block font-body text-xs italic text-dim">
              “{example.line}”
            </span>
            <span className="mt-2 block font-mono text-[0.6rem] uppercase tracking-widest text-amber">
              Try this one ▸
            </span>
          </button>
        </section>
      )}

      {picks && (
        <section className="mx-auto w-full max-w-sm">
          <p className="eyebrow mb-2">The offspring</p>
          <ul className="flex flex-col gap-3">
            {picks.map((p, i) => (
              <li key={p.id} className="deal-in rounded border border-line bg-surface p-3">
                <Link href={`/m/${p.id}`} className="flex gap-3">
                  {/* Fixed-width wrapper, so Poster's own w-full resolves
                      against 5rem instead of the whole row. */}
                  <span className="block w-20 shrink-0">
                    <Poster
                      posterPath={p.poster_path}
                      title={p.title}
                      year={p.year}
                      genres={p.genres}
                      className="rounded"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl leading-tight text-cream">
                      {p.title} <span className="font-mono text-xs text-dim">{p.year ?? ""}</span>
                    </p>
                    {i === 0 && (
                      <p className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-amber">
                        ★ Closest match
                      </p>
                    )}
                    <RatingsBadges
                      ratings={{ imdb: p.imdb_rating, rt: p.rt_rating, tmdb: p.tmdb_rating }}
                      className="mt-1"
                    />
                    <p className="mt-1.5 line-clamp-3 font-body text-sm italic text-cream">
                      “{p.reason}”
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/"
        className="mt-2 text-center font-mono text-[0.65rem] uppercase tracking-widest text-dim underline"
      >
        ← Back to the theater
      </Link>
    </main>
  );
}
