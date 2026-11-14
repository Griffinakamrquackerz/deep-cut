"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { playerEmbedUrl } from "@/lib/player-embed";
import { sfxClick } from "@/lib/sfx";

// Deep Cut Theatre, on the web — the same room as the app's /tv screen, against
// the same /api/shorts programme.
//
// Everything plays through the filmmaker's own Vimeo player. Nothing is hosted,
// copied or re-uploaded: they keep their plays and their control, and if they
// pull a film it stops playing here the same minute. That is the whole basis on
// which this room is allowed to exist.

interface Short {
  id: string;
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  source: "vimeo" | "youtube";
  videoId: string;
  channels: string[];
  pedigree: string;
  synopsis: string;
}
interface DashKey {
  action: string;
  n?: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Dash {
  image: string;
  aspect: number;
  x: number;
  bottom: number;
  w: number;
  /** degrees of tilt toward the viewer, about the console's bottom edge. */
  tilt: number;
  dome: { x: number; y: number };
  keys: DashKey[];
}
interface Scene {
  image: string | null;
  aspect: number;
  /** width / height of the window you look through — narrower than the room. */
  view: number;
  /** how much taller than the window the room is drawn — a push-in. */
  zoom: number;
  screen: { x: number; y: number; w: number; h: number };
  /** where the eyes rest, as fractions of the room. */
  eye: { x: number; y: number };
  /** Fractions of the view, not the room: the console is bolted to the chair. */
  dash: Dash;
}
interface Channel {
  key: string;
  glyph: string;
  label: string;
  blurb: string;
}

const TAPE_MS = 1250; // how long the tape spends riding in or out of the deck

/** A flourish nobody can dismiss is a toll booth. */
function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function runtime(sec: number) {
  return `${Math.max(1, Math.round(sec / 60))} MIN`;
}

/** Deal a film from a channel, avoiding the one just shown where possible. */
function pick(pool: Short[], notId?: string): Short | null {
  if (!pool.length) return null;
  const fresh = pool.filter((f) => f.id !== notId);
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

/** The camera's outline, drawn once. Stacked at several depths, it's a solid. */
function CamPlane({ z, dim }: { z: number; dim: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 block h-full w-full text-[#8ff6ff]"
      style={{ transform: `translateZ(${z}px)`, opacity: dim }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g fill="rgba(125,249,255,0.10)">
        <rect x="27" y="43" width="43" height="30" rx="4" />
        <circle cx="65" cy="58" r="12.5" />
        <circle cx="36" cy="33" r="9" />
      </g>
      <rect x="27" y="43" width="43" height="30" rx="4" />
      <circle cx="65" cy="58" r="12.5" />
      <circle cx="65" cy="58" r="5.5" />
      <circle cx="36" cy="33" r="9" />
      <circle cx="36" cy="33" r="2.5" />
      <path d="M36 42 L36 43 M27 51 L18 47" />
      <circle cx="15" cy="46" r="3" />
    </svg>
  );
}

/**
 * The camera standing in the console's beam — drawn, not photographed, which
 * is the entire point: a photograph of a hologram doesn't turn.
 *
 * It is genuinely three-dimensional rather than a flat drawing spun about its
 * middle. A single plane rotating on Y just squashes and reads as a turning
 * sheet of paper; the same outline stacked at five depths inside a
 * preserve-3d parent has volume, and edge-on at 90 degrees you see the stack
 * itself rather than nothing at all. The tripod legs splay in depth for the
 * same reason.
 */
function HoloCamera() {
  const DEPTHS = [-13, -6.5, 0, 6.5, 13];
  return (
    <span className="holo-flicker pointer-events-none absolute inset-0 block">
      {/* the cone of light it stands in */}
      <span
        className="holo-beam absolute bottom-0 left-1/2 block -translate-x-1/2"
        style={{
          width: "62%",
          height: "62%",
          background:
            "linear-gradient(to top, rgba(125,249,255,0.55), rgba(125,249,255,0.06) 70%, transparent)",
          clipPath: "polygon(41% 100%, 59% 100%, 100% 0%, 0% 0%)",
        }}
      />
      <span
        className="absolute inset-0 block"
        style={{ perspective: "320px", perspectiveOrigin: "50% 45%" }}
      >
        <span
          className="holo-spin absolute inset-0 block"
          style={{ transformStyle: "preserve-3d" }}
        >
          {DEPTHS.map((z, i) => (
            <CamPlane
              key={z}
              z={z}
              // The far planes sit back in the haze, the near one carries the
              // edge — otherwise the stack reads as five drawings rather than
              // one object.
              dim={i === DEPTHS.length - 1 ? 1 : 0.34 + i * 0.1}
            />
          ))}
        </span>
      </span>
    </span>
  );
}

function RKey({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "grey" | "orange" | "dead";
  onClick?: () => void;
}) {
  const dead = tone === "dead";
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center">
      <span
        className={`mb-0.5 truncate font-mono text-[0.4rem] tracking-wide ${
          dead ? "text-[#6d6a63]" : "text-[#e4e0d6]"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={label}
        onClick={dead ? undefined : onClick}
        className={`h-5 w-full rounded-sm border transition-transform active:translate-y-px active:opacity-75 ${
          tone === "orange"
            ? "border-[#a83e13] bg-[#e0551d]"
            : "border-[#8d887e] bg-[#b4aea3]"
        }`}
      />
    </span>
  );
}

export default function LateShow() {
  const [films, setFilms] = useState<Short[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  // A scene that 404s must not take the room down with it — the plain cabinet
  // is always there behind it.
  const [sceneBroken, setSceneBroken] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [film, setFilm] = useState<Short | null>(null);
  const [stage, setStage] = useState<"guide" | "playing">("guide");
  // The deck runs on its own clock now. The tape ride used to gate the picture,
  // which meant every channel change bought you a second and a half of static
  // before a film you'd already asked for. Now the film starts at once and the
  // tape rides in underneath it, where a tape actually is.
  const [deck, setDeck] = useState<"load" | "swap" | null>(null);
  const [big, setBig] = useState(false);
  const [power, setPower] = useState(true);
  const [muted, setMuted] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // The full-screen surface itself, so the browser's own fullscreen can be
  // asked for by the element that is actually full screen.
  const bigBox = useRef<HTMLDivElement>(null);
  // Which way your head is pointed, and whether it's pointed away from the set.
  const room = useRef<HTMLDivElement>(null);
  const [turned, setTurned] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  // A flat photograph slid sideways reads as a flat photograph slid sideways.
  // What makes it read as a room is that the walls swing: the window tilts on a
  // vertical axis through its own centre while you're moving, and settles back
  // to square the moment you stop. Driven by speed rather than position, so
  // it's a head turning rather than a claim about where the walls are — and so
  // there is no transform at all on the player while you're actually watching.
  const tilt = useRef<HTMLDivElement>(null);
  const last = useRef({ x: 0, y: 0 });
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The badge a television flashes in the corner after you press a number. It
  // is also how a remote with fixed numeric keys can tell you that 2 is
  // Heartache — the labels live on the screen, not on the buttons.
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // MENU on the console scrolls here rather than opening anything: the guide
  // is already on the page, and every line of it is a channel button.
  const guideRef = useRef<HTMLDivElement>(null);
  const [gate, setGate] = useState(false); // signed out — the room is members only
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/shorts")
      .then(async (r) => {
        if (r.status === 401) {
          setGate(true);
          setFilms([]);
          return null;
        }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setChannels(d.channels ?? []);
        setFilms(d.films ?? []);
        setScene(d.scene ?? null);
      })
      .catch(() => {
        setError("The set won't warm up. Try again in a minute.");
        setFilms([]);
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (osdTimer.current) clearTimeout(osdTimer.current);
      if (settle.current) clearTimeout(settle.current);
      if (digitTimer.current) clearTimeout(digitTimer.current);
    };
  }, []);

  const onChannel = useCallback(
    (ch: Channel, ejectFirst = false) => {
      const pool = (films ?? []).filter((f) => f.channels.includes(ch.key));
      const next = pick(pool, film?.id);
      sfxClick();
      setChannel(ch);
      setBig(false);
      setPower(true);
      const n = String(channels.indexOf(ch) + 1).padStart(2, "0");
      if (!next) {
        // A channel with nothing on it yet — a real set doesn't refuse to
        // turn the dial just because the next click over is static. CH ▲/▼
        // used to do exactly that: it stayed on the channel you were already
        // watching rather than ever landing on an empty one.
        setFilm(null);
        setStage("playing");
        setDeck(null);
        setOsd(`CH ${n}  ${ch.label.toUpperCase()} — NO SIGNAL`);
        if (osdTimer.current) clearTimeout(osdTimer.current);
        osdTimer.current = setTimeout(() => setOsd(null), 2400);
        return;
      }
      setFilm(next);
      // The picture comes up on the same frame as the click. Whatever the deck
      // is doing, it does behind the film.
      setStage("playing");
      setOsd(`CH ${n}  ${ch.label.toUpperCase()}`);
      if (osdTimer.current) clearTimeout(osdTimer.current);
      osdTimer.current = setTimeout(() => setOsd(null), 2400);
      // Under reduced motion the tape isn't there at all — a still tape parked
      // over the deck for a second is worse than no tape.
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setDeck(null);
        return;
      }
      // Remount the tape so the animation restarts even on the same class.
      setDeck(null);
      requestAnimationFrame(() => setDeck(ejectFirst ? "swap" : "load"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDeck(null), TAPE_MS);
    },
    [films, film?.id, channels],
  );

  // ⏏ still ejects: the old tape rides out and the next one goes down after it.
  // The film underneath changes immediately, because nobody pressed a button
  // labelled "next tape" hoping to watch a second of nothing first.
  const eject = useCallback(() => {
    if (!channel) return;
    onChannel(channel, true);
  }, [channel, onChannel]);

  /**
   * Mute the film that's actually playing. On the web the player is a
   * cross-origin iframe, so the <video> element is out of reach — but both
   * Vimeo and YouTube accept commands by postMessage, which is why the YouTube
   * embed carries enablejsapi=1. Re-applied whenever the film changes, since a
   * fresh player starts unmuted and a MUTE key that forgets itself is worse
   * than a dead one.
   */
  const applyMute = useCallback(
    (m: boolean) => {
      const w = frame.current?.contentWindow;
      if (!w || !film) return;
      if (film.source === "vimeo") {
        w.postMessage(JSON.stringify({ method: "setMuted", value: m }), "https://player.vimeo.com");
      } else {
        w.postMessage(
          JSON.stringify({ event: "command", func: m ? "mute" : "unMute", args: [] }),
          "https://www.youtube-nocookie.com",
        );
      }
    },
    [film],
  );

  useEffect(() => {
    if (stage === "playing") applyMute(muted);
  }, [stage, muted, film?.id, applyMute]);

  /** Put a word in the corner of the screen and take it away again. */
  const flash = useCallback((text: string, ms = 1500) => {
    setOsd(text);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), ms);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      applyMute(next);
      setOsd(next ? "MUTE" : "VOL  ▮▮▮▮");
      if (osdTimer.current) clearTimeout(osdTimer.current);
      osdTimer.current = setTimeout(() => setOsd(null), 1400);
      return next;
    });
  }, [applyMute]);

  /** A numbered key. Dead numbers click and do nothing, like a real remote. */
  const press = useCallback(
    (n: number) => {
      const ch = channels[n - 1];
      if (!ch) {
        setOsd(`CH ${String(n).padStart(2, "0")}  NO SIGNAL`);
        if (osdTimer.current) clearTimeout(osdTimer.current);
        osdTimer.current = setTimeout(() => setOsd(null), 1600);
        return;
      }
      onChannel(ch);
    },
    [channels, onChannel],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!channels.length) return;
      const at = channel ? channels.indexOf(channel) : -1;
      onChannel(channels[(at + dir + channels.length) % channels.length]);
    },
    [channels, channel, onChannel],
  );

  // Two-digit dialing. Fourteen channels means some of them don't fit on a
  // single key — this is how a real remote's 0-9 pad reaches channel 12
  // without a button labelled "12" existing anywhere on it: click 1, click 2
  // within the window, and the two digits become one number. Below ten
  // channels this never waits at all — the buffer completes on the first
  // click, so a four-channel guide behaves exactly as it did before.
  const digits = useRef("");
  const digitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDigits = channels.length > 9 ? 2 : 1;

  const pressDigit = useCallback(
    (d: number) => {
      const typed = (digits.current + String(d)).slice(-maxDigits);
      digits.current = typed;
      if (digitTimer.current) clearTimeout(digitTimer.current);

      if (typed.length < maxDigits) {
        // Still typing — show the digits so far, the way a real set does,
        // rather than going quiet until the second key lands.
        setOsd(`CH ${typed}_`);
        digitTimer.current = setTimeout(() => {
          digits.current = "";
          press(Number(typed));
        }, 900);
        return;
      }
      digits.current = "";
      press(Number(typed));
    },
    [maxDigits, press],
  );

  const togglePower = useCallback(() => {
    setPower((on) => {
      if (on) {
        setStage("guide");
        setOsd(null);
      }
      return !on;
    });
  }, []);

  // Is the room on screen — and, since full screen takes the room out of the
  // tree to give the film the whole window, is it the room we are looking at
  // right now? Declared up here rather than down with the rest of the geometry
  // because the effect that faces the set has to run whenever this flips.
  const sceneOn = !!scene?.image && !sceneBroken && !big;

  // Where the head rests: the set, centred. Everything else is a turn away from
  // it in one direction or the other. Measured off the live element rather than
  // stored, so it stays right at any width.
  const faceTheSet = useCallback(
    (behavior: ScrollBehavior) => {
      const el = room.current;
      if (!el || !scene) return;
      const eye = scene.eye;
      const left = el.scrollWidth * eye.x - el.clientWidth / 2;
      const top = el.scrollHeight * eye.y - el.clientHeight / 2;
      el.scrollTo({
        left: Math.max(0, Math.min(el.scrollWidth - el.clientWidth, left)),
        top: Math.max(0, Math.min(el.scrollHeight - el.clientHeight, top)),
        behavior,
      });
    },
    [scene],
  );

  const lookBack = useCallback(() => faceTheSet("smooth"), [faceTheSet]);

  /**
   * Settle the room back to square.
   *
   * The swing is written straight onto the element by the scroll handler, which
   * means it outlives the element it was written to unless somebody puts it
   * back — and it also leaves a transform on the box, which quietly re-anchors
   * any fixed-position descendant to it. Both are worth clearing whenever the
   * room is set up again.
   */
  const resetTilt = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    last.current = { x: 0, y: 0 };
    const box = tilt.current;
    if (box) {
      box.style.transition = "";
      box.style.transform = "";
    }
  }, []);

  // Face the set the moment the room is measured, and without an animation —
  // you were always sitting here, you didn't pan into position.
  //
  // Keyed on `sceneOn`, not on `faceTheSet`. Leaving full width takes the room
  // out of the tree, and coming back mounts a fresh scroll container sitting at
  // 0,0 — the far corner of the photograph rather than the set. `faceTheSet`'s
  // own identity only changes when the programme loads, so on its own this
  // fired exactly once and every return trip landed off kilter.
  useLayoutEffect(() => {
    if (!sceneOn) return;
    resetTilt();
    faceTheSet("instant");
  }, [sceneOn, faceTheSet, resetTilt]);

  // Change the channel and your eyes go back to the set on their own. Nobody
  // presses 3 while facing the Nerf shelf and means to keep facing it. Under
  // reduced motion that becomes a straight cut — a pan nobody asked for is
  // exactly the kind of flourish a flourish nobody can dismiss is.
  useEffect(() => {
    if (film) faceTheSet(reducedMotion() ? "instant" : "smooth");
  }, [film?.id, faceTheSet]);

  // The room is cut to the window, so anything that changes the window changes
  // where "the set" is. Rotating, the phone's URL bar tidying itself away, and
  // a film handed off to the platform's own fullscreen all reflow the
  // photograph and leave the browser holding a scroll offset that no longer
  // means what it did. None of that used to be noticed, so the head stayed
  // wherever the clamp landed — which is how a fullscreen round trip ends up
  // looking at the ceiling.
  //
  // Deliberately not a plain re-centre on every size change: turning the phone
  // to landscape while you're reading the Ghostbusters poster shouldn't whip
  // your head back to the television. A resize keeps the *fraction* of the room
  // you were already looking at; only the end of a fullscreen asks for the set.
  useEffect(() => {
    let raf = 0;
    const holdYourPlace = () => {
      cancelAnimationFrame(raf);
      const el = room.current;
      if (!el) return;
      const fx = el.scrollWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5;
      const fy = el.scrollHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0.5;
      raf = requestAnimationFrame(() => {
        const now = room.current;
        if (!now) return;
        last.current = { x: 0, y: 0 };
        now.scrollLeft = fx * now.scrollWidth - now.clientWidth / 2;
        now.scrollTop = fy * now.scrollHeight - now.clientHeight / 2;
      });
    };
    const backToTheSet = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        resetTilt();
        faceTheSet("instant");
      });
    };
    // iOS is the one that actually knows the URL bar moved, and it does not
    // always say so through `resize`.
    window.visualViewport?.addEventListener("resize", holdYourPlace);
    window.addEventListener("resize", holdYourPlace);
    window.addEventListener("orientationchange", holdYourPlace);
    document.addEventListener("fullscreenchange", backToTheSet);
    return () => {
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener("resize", holdYourPlace);
      window.removeEventListener("resize", holdYourPlace);
      window.removeEventListener("orientationchange", holdYourPlace);
      document.removeEventListener("fullscreenchange", backToTheSet);
    };
  }, [faceTheSet, resetTilt]);

  /**
   * Ask the browser for its own fullscreen, when it has one to give.
   *
   * Desktop browsers hand it over, which takes the page chrome out of the
   * film's way. iOS Safari has no element fullscreen at all, so this declines
   * quietly and the fixed overlay — already the whole window — is what full
   * screen means on a phone.
   */
  const goNativeFullscreen = useCallback(async () => {
    const el = bigBox.current;
    if (!el?.requestFullscreen) return;
    try {
      await el.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* refused, or nothing to fullscreen: the overlay is already the window */
    }
  }, []);

  // Full width takes the page out of the equation: the film gets the window to
  // itself, whatever is behind it stops scrolling, and Escape puts it back.
  useEffect(() => {
    if (!big) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void goNativeFullscreen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        flash("PUTTING IT BACK");
        setBig(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [big, goNativeFullscreen, flash]);

  // F does what every other player on the web does. Guarded against typing in
  // an input, and against firing with a modifier held — ⌘F is somebody's find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!film) return;
      flash(big ? "PUTTING IT BACK" : "FULL SCREEN");
      setBig((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big, film, flash]);

  // Left fullscreen by the browser's own means — Escape, the back gesture, the
  // system bar — and the overlay has to go with it, or it is left covering a
  // page the viewer has already dismissed.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setBig(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Drag to look. A scroll container already handles touch, trackpads and the
  // arrow keys; this is the one gesture it doesn't give you, and on a desktop
  // it's the only one anybody will try.
  const grab = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = room.current;
    if (!el || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
  }, []);
  const look = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = room.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  }, []);
  const release = useCallback(() => {
    drag.current = null;
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of films ?? []) for (const c of f.channels) m[c] = (m[c] ?? 0) + 1;
    return m;
  }, [films]);

  // The room: one image with the picture behind its transparent screen and the
  // remote on its empty armrest. Percentages throughout, so it lands correctly
  // at any width without measuring the bitmap.
  const pct = (n: number) => `${n * 100}%`;

  // Built by lib/player-embed, which is the one place that knows a film has to
  // be asked to play inline — see the note there. Held constant for the length
  // of a film: a URL that changes remounts the player and sends the picture
  // back to its opening frame, which is why mute goes out over postMessage
  // rather than into this string.
  const src = film ? playerEmbedUrl(film) : null;

  // The player fills the glass rather than fitting inside it. A 16:9 film in a
  // 1.27 hole letterboxes if you size it to the hole, and black bars inside a
  // photograph of a switched-on television read as a bug, not as a film. So it
  // is sized by height and allowed to overhang, and the glass crops the sides.
  // That is pan-and-scan, which is exactly what a widescreen film looked like
  // on a set this shape.
  const glass = scene ? (scene.screen.w * scene.aspect) / scene.screen.h : 4 / 3;
  const fill = sceneOn ? (16 / 9 / glass) * 100 : 100;

  // Built once, placed twice — plain cabinet, or inside the room. One
  // definition each, so playback and the keys can't drift between frames.
  //
  // Deliberately not a button. It used to be one, so that clicking the picture
  // went full width — but a button wrapped around an iframe only ever catches
  // the clicks the player itself doesn't want, which in practice was none of
  // them. The way out to full screen is a labelled key on the frame instead.
  const tube = (
        <div
          className={`crt-glass relative block w-full overflow-hidden bg-[#05060a] ${
            // In the room the tube takes the screen's own measurements \u2014 the
            // hole is a 1.27 rectangle, not a 4:3 one, and a 4:3 box inside it
            // leaves the picture short of the glass along the bottom edge.
            sceneOn ? "h-full rounded-none" : big ? "aspect-video rounded" : "aspect-[4/3] rounded-lg"
          }`}
        >
          {!power ? (
            <span className="absolute inset-0 bg-[#04050a]" />
          ) : stage === "playing" && src ? (
            <span
              className="absolute inset-y-0 block"
              style={{ width: `${fill}%`, left: `${(100 - fill) / 2}%` }}
            >
              <iframe
                ref={frame}
                onLoad={() => applyMute(muted)}
                src={src}
                title={film?.title ?? "Now playing"}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </span>
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-[#141414]">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-dim">
                No signal
              </span>
            </span>
          )}

          {osd && power && (
            <span className="absolute left-2.5 top-2.5 rounded-sm bg-[#040810]/70 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.2em] text-[#7ef0a0]">
              {osd}
            </span>
          )}

          {!big && <span className="crt-scanlines pointer-events-none absolute inset-0" />}
        </div>
  );

  /**
   * The console. It replaces a hand-drawn remote that was two keys wide
   * because a wider one would have covered the television — this is a
   * photograph of a real-looking dash instead, run flush to the bottom of the
   * frame with the recliner's own arms still showing either side of it.
   *
   * Every key on it is painted into the picture and can't move, so the
   * controls are transparent hit boxes measured off the image and positioned
   * as fractions of it. That means the console scales to any width and the
   * keys stay on their paint, and it means the app and the web read the same
   * rectangles off the server rather than each guessing at them.
   */
  const dashOf = (d: Dash) => {
    const fire = (k: DashKey) => {
      switch (k.action) {
        case "power":
          return togglePower();
        case "num":
          return press(k.n ?? 1);
        case "ch-up":
          return step(1);
        case "ch-down":
          return step(-1);
        case "eject":
          return eject();
        case "mute":
          return toggleMute();
        case "vol-down":
          setMuted(true);
          applyMute(true);
          return flash("MUTE");
        case "vol-up":
          setMuted(false);
          applyMute(false);
          return flash("VOL  \u25AE\u25AE\u25AE\u25AE");
        case "guide":
          return guideRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        case "exit":
          return big ? setBig(false) : lookBack();
        // SOURCE has one source. The keys are on the photograph either way, so
        // they answer rather than doing nothing at all — the same courtesy the
        // old remote's dead keys got.
        case "source":
          return flash(k.label.toUpperCase());
        default:
          return;
      }
    };
    return (
      <div
        className="absolute"
        style={{
          left: pct(d.x),
          bottom: pct(d.bottom),
          width: pct(d.w),
          // Stand its face up a few degrees. The photograph looks steeply down
          // at the console; hinging it back about its own bottom edge points it
          // at you without flattening it into a poster. The keys ride the same
          // transform, so their hit boxes tilt with the paint.
          perspective: "900px",
          perspectiveOrigin: "50% 100%",
        }}
      >
        <div
          className="relative"
          style={{
            aspectRatio: String(d.aspect),
            transform: `rotateX(-${d.tilt}deg)`,
            transformOrigin: "50% 100%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={d.image}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none"
          />
          {/* The hologram stands on the console's own projector lens, sized
              off the dome so it scales with the picture rather than drifting
              off it at another width. */}
          <span
            className="pointer-events-none absolute block"
            style={{
              left: `${(d.dome.x - 0.065) * 100}%`,
              bottom: `${(1 - d.dome.y) * 100}%`,
              width: "13%",
              aspectRatio: "0.82",
            }}
          >
            <HoloCamera />
          </span>
          {d.keys.map((k, i) => (
            <button
              key={`${k.action}-${k.n ?? i}`}
              type="button"
              aria-label={k.label}
              onClick={() => fire(k)}
              className="absolute rounded-[3px] active:bg-[#7df9ff]/25"
              style={{ left: pct(k.x), top: pct(k.y), width: pct(k.w), height: pct(k.h) }}
            />
          ))}
        </div>
      </div>
    );
  };

  const remote = (
          <div className="mx-auto w-full rounded-xl border border-[#2c2c30] bg-[#141416] px-2.5 py-3 shadow-2xl">
            <div className="flex items-end gap-1.5">
              <RKey label="POWER" tone="orange" onClick={togglePower} />
              <RKey
                label="⛶ FULL"
                tone="grey"
                onClick={() => {
                  flash(big ? "PUTTING IT BACK" : "FULL SCREEN");
                  setBig((v) => !v);
                }}
              />
              <RKey label="SLEEP" tone="dead" />
              <span className="mx-1 self-stretch border-l border-[#3a3a3f]" />
              <span className="shrink-0 font-mono text-[0.4rem] tracking-widest text-[#d6d2c8]">
                CHANNEL
              </span>
            </div>

            <div className="mt-2.5 flex gap-2">
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <RKey
                    key={n}
                    label={String(n)}
                    // Greyed only by whether n alone is ever meaningful. Past
                    // nine channels every single digit is also the start of a
                    // two-digit one, so a key can't be marked dead just for
                    // failing to name a channel on its own.
                    tone={channels[n - 1] || maxDigits > 1 ? "grey" : "dead"}
                    onClick={() => pressDigit(n)}
                  />
                ))}
                <span />
                <RKey label="0" tone={maxDigits > 1 ? "grey" : "dead"} onClick={() => pressDigit(0)} />
                <span />
              </div>
              <div className="flex w-14 shrink-0 flex-col gap-1.5">
                <RKey label="CH ▲" tone="grey" onClick={() => step(1)} />
                <RKey label="CH ▼" tone="grey" onClick={() => step(-1)} />
                <RKey label="EJECT" tone="orange" onClick={eject} />
              </div>
            </div>

            <div className="mt-2.5 flex items-end gap-1.5">
              <RKey label="MENU" tone="orange" />
              <RKey
                label="SELECT"
                tone="orange"
                onClick={() => channel && press(channels.indexOf(channel) + 1)}
              />
              <RKey label="MUTE" tone={muted ? "orange" : "grey"} onClick={toggleMute} />
            </div>

            <p className="mt-2 font-mono text-[0.45rem] tracking-widest text-[#7c7a74]">8650-EO</p>
            <p className="font-display text-base tracking-[0.15em] text-[#d6d2c8]">DEEP CUT</p>
          </div>

  );

  return (
    <section className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-16 pt-6 sm:max-w-lg md:max-w-2xl">
      <header>
        <p className="slate"><b>Monthly showcase</b></p>
        <h1 className="title-card rack-in mt-2.5 text-5xl">
          Deep Cut <em>Theatre</em>
        </h1>
        <p className="mt-1 text-sm text-dim">
          Award-winning indie films you&apos;ve never seen. New bill every month. Pick a
          channel, then have a look around the room.
        </p>
      </header>

      {/* ── The set ─────────────────────────────────────────────────── */}
      {sceneOn && scene?.image ? (
        <div
          key="room"
          className="relative mx-auto w-full overflow-hidden"
          style={{ aspectRatio: String(scene.view) }}
        >
          {/* Everything that swings goes in here and nothing else: the tilt
              pivots on this box's own centre, which is exactly the point you
              are looking at, and the remote and the chip stay square to you
              because your hand and your eyes don't turn with your head. */}
          <div ref={tilt} className="absolute inset-0">
          {/* The head turn. The room is wider than the window, and dragging
              slides it — the set is against the left wall, so the sweep goes
              right, across the posters and the shelves and the arsenal. The
              film keeps playing the whole time you're looking away, which is
              the entire point of being allowed to look away. */}
          <div
            ref={room}
            tabIndex={0}
            role="group"
            aria-label="The theatre. Drag or use the arrow keys to look around."
            onScroll={(e) => {
              const el = e.currentTarget;
              if (!scene) return;
              const mid = el.scrollWidth * scene.eye.x - el.clientWidth / 2;
              setTurned(Math.abs(el.scrollLeft - Math.max(0, mid)) > 24);
              const box = tilt.current;
              if (!box || reducedMotion()) return;
              // The swing runs off how fast you're moving rather than where
              // you've got to: a head turning, not a claim about where the
              // walls are — and no transform on the player while you watch.
              // Away from the direction of travel, in both planes: sweeping
              // right swings the left of the room away from you, and the
              // ceiling leans back as you raise your eyes to it.
              const dx = el.scrollLeft - last.current.x;
              const dy = el.scrollTop - last.current.y;
              last.current = { x: el.scrollLeft, y: el.scrollTop };
              const cap = (n: number) => Math.max(-7, Math.min(7, n * -0.5));
              box.style.transition = "transform 90ms linear";
              box.style.transform =
                `perspective(900px) rotateY(${cap(dx)}deg) rotateX(${-cap(dy) * 0.6}deg)`;
              if (settle.current) clearTimeout(settle.current);
              settle.current = setTimeout(() => {
                box.style.transition = "transform 320ms cubic-bezier(0.2,0.7,0.3,1)";
                box.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg)";
              }, 110);
            }}
            onPointerDown={grab}
            onPointerMove={look}
            onPointerUp={release}
            onPointerLeave={release}
            className="no-scrollbar absolute inset-0 cursor-grab overflow-auto overscroll-contain active:cursor-grabbing"
          >
            {/* The room itself: wider and taller than the window by exactly the
                amount you're allowed to look. Percentages of the window, so it
                lands right at any size without measuring the bitmap. */}
            <div
              className="relative"
              style={{
                width: pct((scene.aspect * scene.zoom) / scene.view),
                height: pct(scene.zoom),
              }}
            >
                {/* Photograph first, picture composited on top of it and
                    clipped to the screen. No alpha channel required anywhere. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scene.image}
                  alt=""
                  draggable={false}
                  onError={() => setSceneBroken(true)}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <div
                  className="absolute overflow-hidden bg-[#04050a]"
                  style={{
                    left: pct(scene.screen.x),
                    top: pct(scene.screen.y),
                    width: pct(scene.screen.w),
                    height: pct(scene.screen.h),
                  }}
                >
                  {tube}
                </div>
            </div>
          </div>
          </div>

          {/* The frame is a hole you look through, not a picture hung on a
              wall — the edges have to fall off. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 78% 78% at 50% 48%, transparent 40%, rgba(0,0,0,0.5) 100%)",
            }}
          />

          {/* Turn far enough and the set is behind you. Nothing here is ever a
              dead end: one click puts your eyes back on it. */}
          {turned && (
            <button
              type="button"
              onClick={lookBack}
              className="absolute left-2.5 top-2.5 rounded-full border border-line bg-[#040810]/80 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-amber"
            >
              Back to the set
            </button>
          )}

          {/* The way out to a real watch, and where it lives matters: on the
              frame rather than over the television. A hit box the size of the
              glass is a hit box over the player's own controls, and a film you
              can't pause is worse than a film in a small box. */}
          <button
            type="button"
            onClick={() => {
              flash("FULL SCREEN");
              setBig(true);
            }}
            aria-label="Watch full screen"
            className="absolute right-2.5 top-2.5 rounded-full border border-line bg-[#040810]/80 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-amber"
          >
            ⛶ Full screen
          </button>

          {/* The console is bolted to the chair, and the chair doesn't turn —
              so it stays put while the room slides behind it. Pinned also
              means the keys can never be looked away from. */}
          {dashOf(scene.dash)}
        </div>
      ) : big ? (
        /* Full screen. Fixed rather than merely wide: inside the page's own
           column a 16:9 box is still a box you can scroll away from, and the
           whole point of this state is to get out of the film's way. On a
           desktop browser this element is also the thing the real Fullscreen
           API is asked for; on a phone, where there is no element fullscreen to
           be had, it is simply the whole window. */
        <div
          key="full"
          ref={bigBox}
          className="fixed inset-0 z-[80] flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-bg px-2"
        >
          <div className="flex w-full max-w-5xl justify-center">{tube}</div>
          <button
            type="button"
            onClick={() => setBig(false)}
            className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
          >
            ⏏ put it back in the set
          </button>
        </div>
      ) : (
      <div
        key="cabinet"
        className="mx-auto w-full rounded-2xl border-2 border-[#4a3b31] bg-[#2b221c] p-2.5 shadow-2xl"
      >
        {tube}

        {!big && (
          <div className="relative mt-2 overflow-hidden">
            {/* Paint order IS the illusion: mouth, tape, then face plate. */}
            <div className="mx-3 h-4 rounded-sm border border-[#0f0d0b] bg-[#08070a]" />
            {film && deck && (
              <div
                className={`absolute left-4 right-4 top-0 rounded-sm border border-[#3b332a] bg-[#17140f] px-2 py-1.5 ${
                  deck === "swap" ? "tape-swap" : "tape-load"
                }`}
              >
                <div className="flex justify-around">
                  <span className="block h-[22px] w-[22px] rounded-full border-[3px] border-[#584a3d] bg-[#0d0b08]" />
                  <span className="block h-[22px] w-[22px] rounded-full border-[3px] border-[#584a3d] bg-[#0d0b08]" />
                </div>
                <div className="mt-1 rounded-sm bg-[#e8e0cd] px-1.5 py-1">
                  <span className="block truncate font-display text-sm leading-none text-[#1a1410]">
                    {film.title.toUpperCase()}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[0.5rem] text-[#5a4c3e]">
                    {film.director} · {film.year}
                  </span>
                </div>
              </div>
            )}
            <div className="relative bg-[#2b221c] pt-1.5">
              <div className="mx-3 h-[3px] rounded-sm bg-[#3d312a]" />
              <div className="flex items-center gap-2 px-1 pt-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${stage === "playing" ? "bg-avail" : "bg-ticket"}`}
                />
                <span className="flex-1 font-mono text-[0.55rem] uppercase tracking-widest text-[#8d7a68]">
                  {channel
                    ? `CH ${String(channels.indexOf(channel) + 1).padStart(2, "0")} \u00b7 ${channel.label}`
                    : "Deep Cut \u00b7 4-head hi-fi"}
                </span>
                <span className="h-3 w-3 rounded-full border border-[#584a3d] bg-[#1d1712]" />
                <span className="h-3 w-3 rounded-full border border-[#584a3d] bg-[#1d1712]" />
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── What's on ───────────────────────────────────────────────── */}
      {film && !big && (
        <div className="rounded border border-line bg-surface p-4">
          <h2 className="font-display text-3xl leading-none text-amber">
            {film.title.toUpperCase()}
          </h2>
          <p className="mt-1 font-mono text-[0.7rem] text-dim">
            {film.director} · {film.year} · {runtime(film.runtimeSec)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream">{film.synopsis}</p>
          <p className="mt-2 font-mono text-[0.6rem] leading-relaxed text-avail">
            🏆 {film.pedigree}
          </p>
          <button
            type="button"
            onClick={eject}
            className="mt-3 rounded-full border border-amber px-3.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-amber"
          >
            ⏏ Eject · next tape
          </button>
        </div>
      )}

      {/* ── The remote ───────────────────────────────────────────────
          Numbered keys, not a list of channel names — a real remote has 0-9 and
          the television tells you where you landed, which is what the OSD above
          is for. It also means no button ever has to fit "TRUE STORIES" on it.
          The card beneath is the paper one taped inside the cabinet door. */}
      {gate ? (
        <p className="rounded border border-dashed border-line p-4 text-center text-sm text-dim">
          The theatre is members only.{" "}
          <Link href="/login?next=/tv" className="text-amber underline">
            Sign in
          </Link>{" "}
          and pull up a beanbag.
        </p>
      ) : error ? (
        <p className="text-center font-mono text-xs text-ticket">{error}</p>
      ) : films === null ? (
        <p className="text-center font-mono text-xs text-dim">Warming up the tube…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {!sceneOn && <div className="mx-auto w-[82%] max-w-[300px]">{remote}</div>}

          <div ref={guideRef} className="rounded border border-line bg-surface p-4">
            <p className="eyebrow">What&apos;s on</p>
            {/* Every line is a button: the compact remote on the armrest only
                numbers channels 1-4 — growing it to reach all fourteen is what
                made it too big to see the television in the first place — so
                the guide is the other way to reach 5 and up, same as pointing
                at the paper card taped inside a real cabinet and saying
                "that one." */}
            {channels.map((ch, i) => (
              <button
                key={ch.key}
                type="button"
                onClick={() => onChannel(ch)}
                aria-label={`Watch ${ch.label}`}
                className="block w-full py-0.5 text-left font-mono text-xs leading-6 text-cream hover:text-amber"
              >
                <span className="font-medium text-ticket">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {"  "}
                {ch.glyph} {ch.label.toUpperCase()}
                <span className="text-[0.6rem] text-dim">  ({counts[ch.key] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-center font-mono text-[0.55rem] leading-relaxed text-dim/80">
        Every film plays from its maker&apos;s own account. Their views, their numbers — we just
        keep the room dark.
      </p>

      <Link
        href="/"
        className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-dim underline"
      >
        ← Back to the theater
      </Link>
    </section>
  );
}
