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
import { Sprig } from "@/components/house/Laurel";
import "./theatre.css";

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

/** Where the eyes rest on the web: on the television itself. The room's own
 *  eye line sits lower, to keep a console on the armrest in shot — and there
 *  is no console in the window any more. */
function eyeOf(scene: Scene) {
  return { x: scene.eye.x, y: scene.screen.y + scene.screen.h / 2 + 0.02 };
}

/** A key's icon. Drawn, so it inherits the key's colour and never arrives as
 *  somebody's emoji font. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
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
  // The same fact, readable from an observer without re-subscribing it.
  const turnedRef = useRef(false);
  // The photograph's own box: how big the room is drawn is decided in CSS, so
  // this is the element whose size says when that decision has changed.
  const roomInner = useRef<HTMLDivElement>(null);
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
  const [gate, setGate] = useState(false); // signed out — the room is members only
  // "This month's bill — 12 films", and the one pulled out of it this week.
  const [programme, setProgramme] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
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
        setProgramme(typeof d.programme === "string" ? d.programme : null);
        setFeatureId(typeof d.featureId === "string" ? d.featureId : null);
      })
      .catch(() => {
        setError("The set won't warm up. Try again in a minute.");
        setFilms([]);
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (osdTimer.current) clearTimeout(osdTimer.current);
      if (settle.current) clearTimeout(settle.current);
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

  // The guide can name one film outright — this week's feature — so there has
  // to be a way to put that tape in, rather than dealing one off its channel.
  const playFilm = useCallback(
    (f: Short) => {
      const ch = channels.find((c) => f.channels.includes(c.key)) ?? null;
      sfxClick();
      setChannel(ch);
      setFilm(f);
      setBig(false);
      setPower(true);
      setStage("playing");
      setDeck(null);
      if (ch) {
        const n = String(channels.indexOf(ch) + 1).padStart(2, "0");
        setOsd(`CH ${n}  ${ch.label.toUpperCase()}`);
        if (osdTimer.current) clearTimeout(osdTimer.current);
        osdTimer.current = setTimeout(() => setOsd(null), 2400);
      }
    },
    [channels],
  );

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
      const eye = eyeOf(scene);
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

  // How far the room is pushed in is the stylesheet's call (--zoom, --view),
  // and it changes at breakpoints — and, on a cold load, a beat after the
  // first measurement above. Either way the photograph's box changes size
  // under a scroll offset that no longer points at the set. So watch the box:
  // if you were facing the set, you still are. If you had turned to read a
  // poster, your head is left where you put it.
  useEffect(() => {
    const el = roomInner.current;
    if (!sceneOn || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!turnedRef.current) faceTheSet("instant");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sceneOn, faceTheSet]);

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
            // In the room the tube takes the screen's own measurements — the
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
          ) : stage === "playing" ? (
            // A channel with nothing on it. The set still turns to it.
            <span className="th-snow absolute inset-0">
              <span>No signal</span>
            </span>
          ) : (
            // Switched on and not yet tuned: the station's test card, which is
            // what a set showed between programmes.
            <span className="th-testcard absolute inset-0">
              <span>Deep Cut Theatre</span>
              <small>Pick a channel</small>
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

  const chNo = channel ? String(channels.indexOf(channel) + 1).padStart(2, "0") : null;
  const feature = featureId ? (films ?? []).find((f) => f.id === featureId) ?? null : null;
  const toggleBig = () => {
    flash(big ? "PUTTING IT BACK" : "FULL SCREEN");
    setBig((v) => !v);
  };

  /**
   * The remote.
   *
   * It used to be a photograph of a console with the keys painted on: ten
   * numbers for fourteen channels, hit boxes measured off the paint, and a
   * look that belonged to a different building. This one is drawn, so it has
   * a key for every channel there actually is, the lit key is the channel
   * you're on, and the window at the top says in words where you landed —
   * which is the job the corner of the television was doing alone.
   */
  const lcdTop = !power
    ? "OFF"
    : osd ?? (channel ? `CH ${chNo}  ${channel.label.toUpperCase()}` : "DEEP CUT THEATRE");
  const lcdSub = !power
    ? "Press power"
    : film && stage === "playing"
      ? `${film.title} · ${runtime(film.runtimeSec)}`
      : channel
        ? "Nothing on this channel yet"
        : "Pick a channel";
  const remote = (
    <div className="remote" role="group" aria-label="Remote control">
      <div className="remote-top">
        <button
          type="button"
          className="remote-power"
          aria-label={power ? "Power off" : "Power on"}
          aria-pressed={power}
          onClick={() => {
            sfxClick();
            togglePower();
          }}
        >
          <Glyph>
            <path d="M12 3.5v8.5" />
            <path d="M6.6 7.1a7.6 7.6 0 1 0 10.8 0" />
          </Glyph>
        </button>
        <div className={`remote-lcd ${power ? "" : "is-off"}`} aria-live="polite">
          <b>{lcdTop}</b>
          <small>
            <span>{lcdSub}</span>
            {muted && power ? <i>Mute</i> : null}
          </small>
        </div>
      </div>

      <p className="remote-label">Channel</p>
      <div className="remote-keys">
        {channels.map((ch, i) => {
          const on = power && channel?.key === ch.key;
          return (
            <button
              key={ch.key}
              type="button"
              aria-label={`Channel ${i + 1}: ${ch.label}`}
              aria-pressed={on}
              onClick={() => press(i + 1)}
              className={`remote-key ${on ? "is-on" : ""} ${counts[ch.key] ? "" : "is-empty"}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="remote-fn">
        <button type="button" onClick={() => step(-1)} aria-label="Channel down">
          <Glyph>
            <path d="M6 9.5l6 6 6-6" />
          </Glyph>
          <span>Ch −</span>
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Channel up">
          <Glyph>
            <path d="M6 14.5l6-6 6 6" />
          </Glyph>
          <span>Ch +</span>
        </button>
        <button type="button" onClick={toggleMute} aria-pressed={muted} className={muted ? "is-lit" : ""}>
          <Glyph>
            <path d="M4 9.5v5h3.5l5 4v-13l-5 4H4z" />
            {muted ? <path d="M16.5 9.5l4.5 5M21 9.5l-4.5 5" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7" />}
          </Glyph>
          <span>Mute</span>
        </button>
        <button type="button" onClick={eject} disabled={!channel} aria-label="Next tape">
          <Glyph>
            <path d="M12 5.5l6.5 8h-13l6.5-8z" />
            <path d="M5.5 18h13" />
          </Glyph>
          <span>Next tape</span>
        </button>
        <button type="button" onClick={toggleBig} disabled={!film} aria-label="Full screen">
          <Glyph>
            <path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15" />
          </Glyph>
          <span>Full screen</span>
        </button>
      </div>

      <p className="remote-brand">
        <b>Deep Cut</b>
        <span>{channels.length} channels</span>
      </p>
    </div>
  );

  // The programme card: what's in the machine right now.
  const nowPlaying =
    film && !big ? (
      <div key={film.id} className="th-now deal-in">
        <p className="th-now-top">
          <span>Now playing</span>
          {channel ? (
            <b>
              CH {chNo} · {channel.label}
            </b>
          ) : null}
        </p>
        <h2 className="th-now-title">{film.title}</h2>
        <p className="th-now-meta">
          {film.director} · {film.year} · {runtime(film.runtimeSec)}
        </p>
        <p className="th-now-syn">{film.synopsis}</p>
        {film.pedigree ? (
          <p className="pedigree mt-2">
            <Sprig />
            <span>{film.pedigree}</span>
          </p>
        ) : null}
        <div className="th-now-foot">
          <button type="button" onClick={eject} className="th-btn">
            Next tape
          </button>
          <button type="button" onClick={toggleBig} className="th-btn th-btn--amber">
            Full screen
          </button>
        </div>
      </div>
    ) : null;

  // One film pulled out of the bill each week. Not shown while it's the one
  // playing — the card above it already says so.
  const featureCard =
    feature && feature.id !== film?.id && !big ? (
      <button type="button" className="th-feature" onClick={() => playFilm(feature)}>
        <small>This week&apos;s feature</small>
        <b>{feature.title}</b>
        <span>
          {feature.director} · {feature.year} · {runtime(feature.runtimeSec)}
        </span>
        <i>Put this tape in</i>
      </button>
    ) : null;

  // The guide: the paper card taped inside the cabinet door, set like the
  // listings page it is. Every line is a channel button.
  const guide = (
    <div className="th-guide">
      <p className="th-guide-top">
        <b>Channel guide</b>
        {programme ? <span>{programme}</span> : null}
      </p>
      <ol style={{ "--rows": Math.ceil(channels.length / 2) } as React.CSSProperties}>
        {channels.map((ch, i) => {
          const n = counts[ch.key] ?? 0;
          const on = power && channel?.key === ch.key;
          return (
            <li key={ch.key}>
              <button
                type="button"
                onClick={() => onChannel(ch)}
                aria-label={`Watch ${ch.label}`}
                aria-current={on ? "true" : undefined}
                className={`th-ch ${on ? "is-on" : ""} ${n ? "" : "is-empty"}`}
              >
                <span className="th-ch-no">{String(i + 1).padStart(2, "0")}</span>
                <span className="th-ch-body">
                  <b>{ch.label}</b>
                  <i>{ch.blurb}</i>
                </span>
                <span className="th-ch-count">{on ? "On now" : n ? `${n} film${n === 1 ? "" : "s"}` : "Off air"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <section className="th">
      <header className="th-head">
        <Link href="/" className="th-back">
          Back to the lobby
        </Link>
        <p className="slate">
          <b>Monthly showcase</b>
        </p>
        <h1 className="title-card rack-in mt-2.5 text-5xl sm:text-6xl">
          Deep Cut <em>Theatre</em>
        </h1>
        <p className="th-lede">
          Award-winning indie films you&apos;ve never seen. New bill every month. Pick a channel,
          then have a look around the room.
        </p>
      </header>

      <div className="th-stage">
        <div className="th-main">
          {/* ── The set ─────────────────────────────────────────────── */}
          {sceneOn && scene?.image ? (
            <div key="room" className="th-window">
              {/* Everything that swings goes in here and nothing else: the tilt
                  pivots on this box's own centre, which is exactly the point you
                  are looking at, and the chips stay square to you because your
                  eyes don't turn with your head. */}
              <div ref={tilt} className="absolute inset-0">
                {/* The head turn. The room is wider than the window, and dragging
                    slides it across the posters and the shelves. The film keeps
                    playing the whole time you're looking away, which is the
                    entire point of being allowed to look away. */}
                <div
                  ref={room}
                  tabIndex={0}
                  role="group"
                  aria-label="The theatre. Drag or use the arrow keys to look around."
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (!scene) return;
                    const mid = el.scrollWidth * eyeOf(scene).x - el.clientWidth / 2;
                    const away = Math.abs(el.scrollLeft - Math.max(0, mid)) > 24;
                    turnedRef.current = away;
                    setTurned(away);
                    const box = tilt.current;
                    if (!box || reducedMotion()) return;
                    // The swing runs off how fast you're moving rather than where
                    // you've got to: a head turning, not a claim about where the
                    // walls are — and no transform on the player while you watch.
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
                  {/* The room itself: wider and taller than the window by exactly
                      the amount you're allowed to look. How far it is pushed in
                      is the window's business (--zoom and --view, in
                      theatre.css), so a phone and a desk can each frame the
                      set properly without this file measuring anything. */}
                  <div
                    ref={roomInner}
                    className="relative"
                    style={{
                      width: `calc(${scene.aspect} * var(--zoom, 2.4) / var(--view, 1) * 100%)`,
                      height: "calc(var(--zoom, 2.4) * 100%)",
                    }}
                  >
                    {/* Photograph first, picture composited on top of it and
                        clipped to the screen. No alpha channel required. */}
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
              <span aria-hidden className="th-window-vignette" />

              {/* Turn far enough and the set is behind you. Nothing here is
                  ever a dead end: one click puts your eyes back on it. */}
              {turned ? (
                <button type="button" onClick={lookBack} className="th-chip th-chip--tl">
                  Back to the set
                </button>
              ) : (
                <span className="th-chip th-chip--tl th-chip--hint" aria-hidden>
                  Drag to look around
                </span>
              )}

              {/* The way out to a real watch, on the frame rather than over the
                  television: a hit box the size of the glass is a hit box over
                  the player's own controls. */}
              <button
                type="button"
                onClick={() => {
                  flash("FULL SCREEN");
                  setBig(true);
                }}
                aria-label="Watch full screen"
                className="th-chip th-chip--tr"
              >
                <Glyph>
                  <path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15" />
                </Glyph>
                Full screen
              </button>
            </div>
          ) : big ? (
            /* Full screen. Fixed rather than merely wide: inside the page's own
               column a 16:9 box is still a box you can scroll away from, and the
               whole point of this state is to get out of the film's way. On a
               desktop browser this element is also the thing the real
               Fullscreen API is asked for; on a phone, where there is no element
               fullscreen to be had, it is simply the whole window. */
            <div
              key="full"
              ref={bigBox}
              className="fixed inset-0 z-[80] flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-bg px-2"
            >
              <div className="flex w-full max-w-5xl justify-center">{tube}</div>
              <button type="button" onClick={() => setBig(false)} className="th-btn">
                Put it back in the set
              </button>
            </div>
          ) : gate ? (
            /* Signed out: the room, still, with the door in front of it. */
            <div key="still" className="th-window th-window--still">
              <span aria-hidden className="th-window-vignette" />
              <div className="th-gate">
                <p className="th-gate-top">Members only</p>
                <p className="th-gate-line">A free account plays everything.</p>
                <Link href="/login?next=/tv" className="th-btn th-btn--amber">
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <div
              key="cabinet"
              className="mx-auto w-full rounded-2xl border-2 border-[#4a3b31] bg-[#2b221c] p-2.5 shadow-2xl"
            >
              {tube}
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
                      {channel ? `CH ${chNo} · ${channel.label}` : "Deep Cut · 4-head hi-fi"}
                    </span>
                    <span className="h-3 w-3 rounded-full border border-[#584a3d] bg-[#1d1712]" />
                    <span className="h-3 w-3 rounded-full border border-[#584a3d] bg-[#1d1712]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* On a desk the guide sits under the set, two columns wide; on a
              phone it goes last, after the remote and the card (the order is
              in theatre.css, so the markup stays one tree). */}
          {channels.length > 0 && !gate ? guide : null}
        </div>

        {gate ? null : (
          <div className="th-side">
            {error ? (
              <p className="th-status th-status--bad">{error}</p>
            ) : films === null ? (
              <p className="th-status">Warming up the tube…</p>
            ) : (
              <>
                {remote}
                {nowPlaying}
                {featureCard}
              </>
            )}
          </div>
        )}
      </div>

      <p className="th-foot">
        Every film plays from its maker&apos;s own account. Their views, their numbers — we just
        keep the room dark.
      </p>
    </section>
  );
}
