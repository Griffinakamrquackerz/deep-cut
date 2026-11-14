"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// The projector, and the light it throws.
//
// The front page is a microcinema: a 16mm machine on a crate, pointed at a
// wall, and the pitch is whatever lands on the wall. This component owns the
// three things CSS can't work out alone:
//
//   1. Where the beam goes. The lens and the lit rectangle are laid out by the
//      stylesheet and land somewhere different at every width, so the wedge
//      between them is measured — lens point plus the screen's four corners,
//      convex hull, handed back as a clip-path. The machine's head is tilted
//      to face the wall by the same measurement.
//   2. Dust in the beam. A small canvas of motes that only exist inside the
//      wedge, brightest at the glass.
//   3. The motor. Off until asked for — nobody wants a page that starts
//      making noise — and one tap on the machine's switch away.
//
// Everything a reader needs is server-rendered children. With scripting off
// the wall still lights and the copy still racks into focus; only the beam
// and the dust are missing.

type Pt = [number, number];

/** Convex hull, counter-clockwise (Andrew's monotone chain). */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

interface Mote {
  /** 0–1 across the fan, between its two outer rays. */
  u: number;
  /** 0–1 along the throw, lens to wall. */
  t: number;
  du: number;
  dt: number;
  r: number;
  phase: number;
}

// Where the head pivots, in the drawing's own units (see the viewBox).
const PIVOT: Pt = [222, 244];

export default function ProjectorHero({
  children,
  cta,
  bill,
}: {
  /** What's on the wall. */
  children: ReactNode;
  /** The box office, under the wall. */
  cta: ReactNode;
  /** Tonight's bill — the letterboard, desktop only. */
  bill: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const head = useRef<SVGGElement>(null);
  const lens = useRef<SVGCircleElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const [sound, setSound] = useState(false);
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);

  useEffect(() => {
    const stageEl = stage.current;
    const screenEl = screen.current;
    const beamEl = beam.current;
    const canvas = dust.current;
    const svgEl = svg.current;
    const headEl = head.current;
    const lensEl = lens.current;
    if (!stageEl || !screenEl || !beamEl || !canvas || !svgEl || !headEl || !lensEl) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const g2d = canvas.getContext("2d");

    // The fan the dust lives in: lens, and the two hull points either side of it.
    let fan: { L: Pt; A: Pt; B: Pt } | null = null;
    let motes: Mote[] = [];
    let dpr = 1;

    const seed = () => {
      const n = window.innerWidth < 700 ? 36 : 80;
      motes = Array.from({ length: n }, () => ({
        u: Math.random(),
        t: 0.06 + Math.random() * 0.9,
        du: (Math.random() - 0.5) * 0.00035,
        dt: (Math.random() - 0.35) * 0.0005,
        r: 0.5 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const measure = () => {
      const s = stageEl.getBoundingClientRect();
      const r = screenEl.getBoundingClientRect();
      if (!s.width || !r.width) return;

      // Tilt the head at the middle of the wall. Measured from the pivot, which
      // doesn't move, so one pass settles it. The machine faces left, so a
      // clockwise turn raises the lens. Clamped: much past 25° it stops reading as
      // a projector on a table and starts reading as one falling off it.
      const box = svgEl.getBoundingClientRect();
      const k = box.width / 360;
      const px = box.left + PIVOT[0] * k;
      const py = box.top + PIVOT[1] * k;
      const cx = r.left + r.width * 0.5;
      const cy = r.top + r.height * 0.5;
      const aim = Math.max(4, Math.min(27, (Math.atan2(py - cy, px - cx) * 180) / Math.PI));
      headEl.setAttribute("transform", `rotate(${aim.toFixed(2)} ${PIVOT[0]} ${PIVOT[1]})`);

      const l = lensEl.getBoundingClientRect();
      const L: Pt = [l.left + l.width / 2 - s.left, l.top + l.height / 2 - s.top];
      // Inset a touch so the wedge meets the lit area, not its soft edge.
      const x0 = r.left - s.left + 4;
      const y0 = r.top - s.top + 4;
      const x1 = r.right - s.left - 4;
      const y1 = r.bottom - s.top - 4;
      const poly = hull([L, [x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

      // The wall's own rectangle is cut back out of the wedge (even-odd, with a
      // bridge from the first hull point): haze belongs to the air between the
      // glass and the wall, and laid over the copy it only muddies it.
      const px2 = ([x, y]: Pt) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      const hole: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      beamEl.style.clipPath = `polygon(evenodd, ${[...poly, poly[0], ...hole].map(px2).join(",")})`;
      beamEl.style.setProperty("--lx", `${L[0].toFixed(1)}px`);
      beamEl.style.setProperty("--ly", `${L[1].toFixed(1)}px`);

      const i = poly.indexOf(L);
      fan =
        i < 0
          ? null // the lens is inside the wall's rectangle: no wedge to fill
          : { L, A: poly[(i + poly.length - 1) % poly.length], B: poly[(i + 1) % poly.length] };

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(s.width * dpr);
      canvas.height = Math.round(s.height * dpr);
      stageEl.setAttribute("data-ready", "");
      if (still) draw(0);
    };

    const draw = (now: number) => {
      if (!g2d || !fan) return;
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2d.clearRect(0, 0, canvas.width, canvas.height);
      const { L, A, B } = fan;
      for (const m of motes) {
        if (!still) {
          m.u += m.du;
          m.t += m.dt;
          if (m.u < 0 || m.u > 1) m.du *= -1;
          if (m.t > 0.98) m.t = 0.05;
          if (m.t < 0.04) m.t = 0.96;
        }
        const ex = A[0] + (B[0] - A[0]) * m.u;
        const ey = A[1] + (B[1] - A[1]) * m.u;
        const x = L[0] + (ex - L[0]) * m.t;
        const y = L[1] + (ey - L[1]) * m.t;
        // Bright at the glass, gone by the wall, each one catching the light
        // on its own schedule.
        const twinkle = 0.55 + 0.45 * Math.sin(now * 0.0016 + m.phase);
        const a = Math.pow(1 - m.t, 0.8) * twinkle * 0.75;
        if (a < 0.02) continue;
        g2d.beginPath();
        g2d.fillStyle = `rgba(255,238,205,${a.toFixed(3)})`;
        g2d.arc(x, y, m.r * (0.7 + m.t * 0.9), 0, Math.PI * 2);
        g2d.fill();
      }
    };

    seed();
    measure();

    // Fonts land after first paint and move the wall; so does any resize.
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    ro.observe(screenEl);
    void document.fonts?.ready.then(measure);

    if (still) return () => ro.disconnect();

    // One loop for the dust and the burn-in clock, at film-ish cadence, and
    // only while the hero is actually on screen.
    let raf = 0;
    let last = 0;
    let visible = true;
    const t0 = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden || now - last < 40) return;
      last = now;
      draw(now);
      if (clock.current) {
        const f = Math.floor(((now - t0) / 1000) * 24);
        const pad = (n: number) => String(n).padStart(2, "0");
        clock.current.textContent = `01:${pad(Math.floor(f / 1440) % 60)}:${pad(Math.floor(f / 24) % 60)}:${pad(f % 24)}`;
      }
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(stageEl);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // The motor: a second of filtered noise with twenty-four claw-clicks in it,
  // looped. Built on first use, from a tap, so no autoplay rule is in the way.
  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      if (!audio.current) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const len = ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < len; i++) {
          brown = (brown + (Math.random() * 2 - 1) * 0.04) / 1.02;
          const sinceClick = (i % Math.floor(len / 24)) / ctx.sampleRate;
          const click = (Math.random() * 2 - 1) * Math.exp(-sinceClick * 900) * 0.5;
          d[i] = brown * 1.6 + click;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const tone = ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = 2600;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(tone).connect(gain).connect(ctx.destination);
        src.start();
        audio.current = { ctx, gain };
      }
      const { ctx, gain } = audio.current;
      if (ctx.state === "suspended") void ctx.resume();
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.linearRampToValueAtTime(next ? 0.11 : 0, ctx.currentTime + 0.35);
    } catch {
      /* no audio on this device — the picture runs silent */
    }
  }
  useEffect(
    () => () => {
      void audio.current?.ctx.close().catch(() => {});
    },
    [],
  );

  return (
    <div ref={stage} className="lp-stage lp-wrap">
      <div ref={beam} className="lp-beam" aria-hidden="true">
        <div className="lp-beam-light" />
        <div className="lp-beam-haze" />
      </div>
      <canvas ref={dust} className="lp-dust" aria-hidden="true" />

      <div ref={screen} className="lp-screen">
        <div className="lp-leader" aria-hidden="true">
          <div className="lp-leader-dial">
            <span className="lp-leader-hand" />
          </div>
          <b>3</b>
          <b>2</b>
          <b>1</b>
        </div>
        <div className="lp-screen-fx" aria-hidden="true">
          <i />
          <i />
          <i />
          <svg className="lp-hair" viewBox="0 0 60 26" fill="none">
            <path
              d="M6 26c2-9 9-17 20-18 9-1 12 5 9 9-3 4-9 2-8-3 1-6 9-11 18-11 5 0 8 1 11 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="lp-burnin" aria-hidden="true">
          <b>●</b> REEL 1 · <span ref={clock}>01:00:00:00</span>
        </p>
        <div className="lp-screen-content">{children}</div>
      </div>

      <div className="lp-cta">{cta}</div>

      {bill}

      <div className="lp-projector">
        <svg ref={svg} viewBox="0 0 360 310" role="img" aria-label="A 16mm film projector, running">
          <defs>
            <linearGradient id="lp-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a2c25" />
              <stop offset="0.45" stopColor="#221915" />
              <stop offset="1" stopColor="#120d0b" />
            </linearGradient>
            <linearGradient id="lp-barrel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5a4636" />
              <stop offset="0.4" stopColor="#2a1f1a" />
              <stop offset="1" stopColor="#0e0a09" />
            </linearGradient>
            <radialGradient id="lp-glass" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#fff1d6" />
              <stop offset="1" stopColor="#ffb454" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lp-pool" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffb454" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ffb454" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* light spilling onto the table */}
          <ellipse cx="200" cy="296" rx="170" ry="14" fill="url(#lp-pool)" />

          {/* what it's standing on: a crate, and the cans the print came in */}
          <g>
            <rect x="128" y="252" width="190" height="52" rx="2" fill="#19120f" stroke="#3b2e27" />
            <path d="M128 269h190M128 287h190" stroke="#2c211c" />
            <path d="M150 252v52M296 252v52" stroke="#2c211c" strokeWidth="3" />
            <text x="223" y="283" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="8" letterSpacing="2" fill="#6f5a4b">
              FRAGILE · FILM
            </text>
            <g>
              <rect x="34" y="282" width="86" height="22" rx="4" fill="#1d1512" stroke="#4a392f" />
              <rect x="40" y="264" width="80" height="20" rx="4" fill="#241a16" stroke="#4a392f" />
              <path d="M34 293h86M40 274h80" stroke="#0e0a09" />
              <rect x="62" y="268" width="36" height="9" fill="#e4573d" opacity="0.75" />
            </g>
          </g>

          {/* the cradle it tilts in — drawn level, so any angle looks meant */}
          <path d="M196 254 206 226h32l10 28z" fill="#1d1512" stroke="#4a392f" />

          <g ref={head} transform={`rotate(22 ${PIVOT[0]} ${PIVOT[1]})`}>
            {/* reel arms */}
            <path d="M176 156 124 82" stroke="#2a1f1a" strokeWidth="13" strokeLinecap="round" />
            <path d="M176 156 124 82" stroke="#57422f" strokeWidth="2" strokeLinecap="round" transform="translate(-3 -4)" />
            <path d="M246 150 268 92" stroke="#2a1f1a" strokeWidth="13" strokeLinecap="round" />
            <path d="M246 150 268 92" stroke="#57422f" strokeWidth="2" strokeLinecap="round" transform="translate(-4 -2)" />

            {/* the film's path through the machine */}
            <path
              className="lp-film-run"
              d="M96 136c20 14 38 22 44 34v40c2 16 22 20 34 8 30-30 66-58 96-74"
              fill="none"
              stroke="#c9a06a"
              strokeOpacity="0.55"
              strokeWidth="2.4"
              strokeDasharray="5 2"
            />

            {/* feed reel */}
            <g transform="translate(124 82)">
              <g className="lp-reel-spin">
                <circle r="64" fill="#15100e" stroke="#c9a06a" strokeOpacity="0.55" strokeWidth="1.6" />
                <circle r="51" fill="#0b0807" stroke="#2c211c" strokeWidth="6" />
                {[0, 72, 144, 216, 288].map((a) => (
                  <circle key={a} r="13.5" cx="34" fill="#1e1612" stroke="#c9a06a" strokeOpacity="0.4" transform={`rotate(${a})`} />
                ))}
                <circle r="11" fill="#2c211c" stroke="#c9a06a" strokeOpacity="0.6" />
                <path d="M-6 0h12M0-6v12" stroke="#c9a06a" strokeOpacity="0.8" strokeWidth="1.5" />
              </g>
            </g>
            {/* take-up reel */}
            <g transform="translate(268 92)">
              <g className="lp-reel-spin lp-reel-spin--rear">
                <circle r="54" fill="#15100e" stroke="#c9a06a" strokeOpacity="0.45" strokeWidth="1.6" />
                <circle r="30" fill="#0b0807" stroke="#2c211c" strokeWidth="5" />
                {[20, 92, 164, 236, 308].map((a) => (
                  <circle key={a} r="11" cx="38" fill="#1e1612" stroke="#c9a06a" strokeOpacity="0.35" transform={`rotate(${a})`} />
                ))}
                <circle r="9.5" fill="#2c211c" stroke="#c9a06a" strokeOpacity="0.55" />
                <path d="M-5 0h10M0-5v10" stroke="#c9a06a" strokeOpacity="0.8" strokeWidth="1.5" />
              </g>
            </g>

            {/* lamp house, light leaking through the vents */}
            <rect x="238" y="128" width="64" height="46" rx="9" fill="url(#lp-body)" stroke="#4a392f" />
            <g className="lp-vent" stroke="#ffb454" strokeWidth="2.2" strokeLinecap="round">
              <path d="M252 138h36M252 146h36M252 154h36M252 162h36" />
            </g>

            {/* body */}
            <rect x="146" y="150" width="158" height="94" rx="11" fill="url(#lp-body)" stroke="#4a392f" strokeWidth="1.4" />
            <path d="M158 152h134" stroke="#8a6d50" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
            <rect x="186" y="170" width="88" height="17" rx="2" fill="#0e0a09" stroke="#57422f" />
            <text x="230" y="182" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="8.5" letterSpacing="2.2" fill="#ffb454">
              DEEP CUT·16
            </text>
            <circle cx="206" cy="214" r="11" fill="#0e0a09" stroke="#6f5a4b" />
            <path d="M206 205v9" stroke="#f3e9d7" strokeWidth="2" strokeLinecap="round" />
            <circle cx="240" cy="216" r="7" fill="#0e0a09" stroke="#6f5a4b" />
            <circle cx="272" cy="214" r="3.5" fill="#e4573d" className="lp-vent" />
            <path d="M262 228h30M262 233h30" stroke="#3b2e27" strokeWidth="1.5" />

            {/* gate and lens */}
            <rect x="138" y="166" width="20" height="62" rx="3" fill="#120d0b" stroke="#4a392f" />
            <rect x="100" y="180" width="42" height="34" rx="3" fill="url(#lp-barrel)" stroke="#4a392f" />
            <path d="M112 180v34M124 180v34" stroke="#0e0a09" strokeWidth="1.5" />
            <rect x="88" y="175" width="14" height="44" rx="3" fill="url(#lp-barrel)" stroke="#6f5a4b" />
            <g className="lp-lens-glow">
              <ellipse cx="86" cy="197" rx="20" ry="30" fill="url(#lp-glass)" opacity="0.5" />
              <ellipse cx="87" cy="197" rx="5" ry="19" fill="#fff8ea" />
            </g>
            <circle ref={lens} cx="86" cy="197" r="1" fill="none" />
          </g>

          {/* the hinge pin, over everything */}
          <circle cx={PIVOT[0]} cy={PIVOT[1]} r="8" fill="#0e0a09" stroke="#8a6d50" />
          <circle cx={PIVOT[0]} cy={PIVOT[1]} r="2.5" fill="#c9a06a" />
        </svg>

        <button type="button" className="lp-sound" aria-pressed={sound} onClick={toggleSound}>
          <i aria-hidden="true" />
          {sound ? "Motor on" : "Hear it run"}
        </button>
      </div>
    </div>
  );
}
