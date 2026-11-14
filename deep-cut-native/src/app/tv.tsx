import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  Easing,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { WebView } from "react-native-webview";
import YoutubePlayer from "react-native-youtube-iframe";
import { api } from "@/lib/api";
import { colors, fonts, mono } from "@/lib/theme";
import BackButton from "@/components/BackButton";
import HouseNav from "@/components/HouseNav";
import { Eyebrow, Marquee, MarqueeBulbs } from "@/components/ui";

// Deep Cut Theatre — a television in a basement that only plays short films.
//
// Everything here is embedded through the filmmaker's own player. We never
// host, copy or re-upload a frame, which is the entire legal basis for the room
// existing, so the WebView points at Vimeo/YouTube and nowhere else.
//
// The room is bigger than the window onto it in both directions, which is what
// lets you turn your head: drag and the photograph slides, the set staying dead
// centre with a wall of the hoard either side and the ceiling and the carpet a
// short look up and down. The film keeps playing while you're looking away,
// because a room you can't look around isn't a room, it's a wallpaper.
//
// The picture fills the photographed glass rather than fitting inside it: it is
// sized by height and cropped at the sides, which is pan-and-scan, and which is
// exactly what a widescreen film looked like on a set this shape. Black bars
// inside a photograph of a switched-on television read as a bug rather than as
// a film. When someone actually commits to watching, the bezel gets out of the
// way (tap the picture) and the film goes full width, uncropped.

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
  /** Fractions of the view, not the room: the console is bolted to the chair. */
  dash: Dash;
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
interface Channel {
  key: string;
  glyph: string;
  label: string;
  blurb: string;
}

type Stage = "guide" | "playing";

const TAPE_MS = 1250; // how long the tape spends riding in or out of the deck
const TAPE_TRAVEL = 74; // how far the tape rides out of the mouth

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

const HOLO = "#8ff6ff";
/** Depth of each stacked plane, in the camera's own 100-unit space. */
const HOLO_PLANES: { z: number; dim: number }[] = [
  { z: -13, dim: 0.34 },
  { z: -6.5, dim: 0.44 },
  { z: 0, dim: 0.54 },
  { z: 6.5, dim: 0.64 },
  { z: 13, dim: 1 },
];

/**
 * One plane of the camera, at one depth.
 *
 * RN's transform has no translateZ, so the projection is done by hand — which
 * is all translateZ would have done anyway. A point sitting at depth z, once
 * the whole object has turned by theta, lands at x = z*sin(theta), and the
 * plane's own face foreshortens by cos(theta). Two transforms, and the stack
 * has real volume: face-on the planes coincide, edge-on they spread into the
 * object's depth rather than vanishing the way a single sheet would.
 */
function CamPlane({
  z,
  dim,
  size,
  spin,
}: {
  z: number;
  dim: number;
  size: number;
  spin: SharedValue<number>;
}) {
  const u = size / 100;
  const boxH = size / 0.82;
  const yOff = (boxH - size) / 2;
  const sw = Math.max(1, 2.4 * u);

  const style = useAnimatedStyle(() => {
    const t = (spin.value * Math.PI) / 180;
    return {
      opacity: dim,
      transform: [{ translateX: z * Math.sin(t) * u }, { scaleX: Math.cos(t) }],
    };
  });

  const ring = (cx: number, cy: number, r: number, fill?: boolean) => ({
    position: "absolute" as const,
    left: (cx - r) * u,
    top: yOff + (cy - r) * u,
    width: r * 2 * u,
    height: r * 2 * u,
    borderRadius: r * u,
    borderWidth: sw,
    borderColor: HOLO,
    ...(fill ? { backgroundColor: "rgba(125,249,255,0.10)" } : null),
  });
  // Each strut is a hairline box stood on its midpoint and turned — cheaper
  // than a path and identical on screen at this size.
  const strut = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const deg = (Math.atan2(x2 - x1, y2 - y1) * 180) / Math.PI;
    return {
      position: "absolute" as const,
      left: ((x1 + x2) / 2) * u - sw / 2,
      top: yOff + ((y1 + y2) / 2 - len / 2) * u,
      width: sw,
      height: len * u,
      backgroundColor: HOLO,
      transform: [{ rotate: `${-deg}deg` }],
    };
  };

  return (
    <Animated.View style={[{ position: "absolute", width: size, height: boxH }, style]}>
      <View
        style={{
          position: "absolute",
          left: 27 * u,
          top: yOff + 43 * u,
          width: 43 * u,
          height: 30 * u,
          borderRadius: 4 * u,
          borderWidth: sw,
          borderColor: HOLO,
          backgroundColor: "rgba(125,249,255,0.10)",
        }}
      />
      <View style={ring(65, 58, 12.5, true)} />
      <View style={ring(65, 58, 5.5)} />
      <View style={ring(36, 33, 9, true)} />
      <View style={ring(36, 33, 2.5)} />
      <View style={ring(15, 46, 3)} />
      <View style={strut(27, 51, 18, 47)} />
      <View style={strut(50, 73, 30, 96)} />
      <View style={strut(50, 73, 70, 96)} />
      <View style={strut(50, 73, 50, 97)} />
    </Animated.View>
  );
}

/**
 * The camera standing in the console's beam — drawn, not photographed, which
 * is the entire point: a photograph of a hologram doesn't turn.
 *
 * The same five stacked planes as the web twin, at the same depths, so both
 * platforms show the same object. The flicker steps rather than eases: a
 * hologram that fades smoothly is a dimmer switch, one that drops a frame and
 * snaps back is a projection struggling to hold.
 */
function HoloCamera({ size, reduced }: { size: number; reduced: boolean }) {
  const spin = useSharedValue(0);
  const dim = useSharedValue(0.92);
  const boxH = size / 0.82;

  useEffect(() => {
    if (reduced) return;
    // Slow. A hologram spinning like a rotisserie reads as a toy; one turning
    // like it's being examined reads like a message someone left you.
    spin.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1, false);
    const hold = (v: number, ms: number) => withTiming(v, { duration: ms, easing: Easing.steps(1, true) });
    dim.value = withRepeat(
      withSequence(
        hold(0.92, 250),
        hold(0.34, 45),
        hold(0.72, 40),
        hold(0.34, 45),
        hold(0.92, 700),
        hold(0.55, 60),
        hold(0.92, 800),
        hold(0.28, 55),
        hold(0.8, 40),
        hold(0.28, 55),
        hold(0.92, 900),
        hold(0.6, 90),
        hold(0.92, 620),
      ),
      -1,
      false,
    );
  }, [reduced, spin, dim]);

  const flicker = useAnimatedStyle(() => ({ opacity: dim.value }));

  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: boxH }, flicker]}>
      {/* the cone of light it stands in */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: size * 0.19,
          width: size * 0.62,
          height: boxH * 0.62,
          opacity: 0.5,
        }}
      >
        {Array.from({ length: 14 }).map((_, i) => {
          const t = i / 13;
          return (
            <View
              key={i}
              style={{
                alignSelf: "center",
                width: size * 0.62 * (1 - t * 0.82),
                height: (boxH * 0.62) / 14 + 1,
                backgroundColor: HOLO,
                opacity: 0.06 + t * 0.34,
              }}
            />
          );
        })}
      </View>
      {HOLO_PLANES.map((p) => (
        <CamPlane key={p.z} z={p.z} dim={p.dim} size={size} spin={spin} />
      ))}
    </Animated.View>
  );
}

/**
 * One key on the remote. `dead` keys are real: every remote had buttons that
 * did nothing useful, and a keypad where only four of ten numbers exist would
 * look broken rather than vintage. They depress and click and go nowhere.
 */
function RKey({
  label,
  tone,
  wide,
  onPress,
}: {
  label: string;
  tone: "grey" | "orange" | "dead";
  wide?: boolean;
  onPress?: () => void;
}) {
  const dead = tone === "dead";
  return (
    <View style={[styles.keyWrap, wide && { flex: 1 }]}>
      <Text style={[styles.keyLabel, dead && { color: "#6d6a63" }]} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={() => {
          if (dead) {
            void Haptics.selectionAsync();
            return;
          }
          onPress?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.key,
          tone === "orange" ? styles.keyOrange : styles.keyGrey,
          pressed && styles.keyDown,
        ]}
      />
    </View>
  );
}

export default function TvScreen() {
  const [films, setFilms] = useState<Short[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  // A scene that 404s or decodes badly must not take the room down with it —
  // the plain cabinet is always there behind it.
  const [sceneBroken, setSceneBroken] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [film, setFilm] = useState<Short | null>(null);
  const [stage, setStage] = useState<Stage>("guide");
  // The deck runs on its own clock now. The tape ride used to gate the picture,
  // which meant every channel change bought you a second and a half of static
  // before a film you'd already asked for. Now the film starts at once and the
  // tape rides in underneath it, where a tape actually is.
  const [deckBusy, setDeckBusy] = useState(false);
  const [big, setBig] = useState(false); // picture out of the bezel
  const [power, setPower] = useState(true);
  const [muted, setMuted] = useState(false);
  const webRef = useRef<WebView>(null);
  // Which way your head is pointed, and whether it's pointed away from the set.
  const roomRef = useRef<ScrollView>(null);
  const roomYRef = useRef<ScrollView>(null);
  // The page itself, and where the channel guide sits down it — MENU on the
  // console scrolls here rather than opening anything.
  const pageRef = useRef<ScrollView>(null);
  const guideY = useRef(0);
  const [turned, setTurned] = useState(false);
  // The channel badge a real television flashes in the corner after you press
  // a number. It's also how a remote with fixed numeric keys can tell you that
  // 2 is Heartache — the labels live on the screen, not on the buttons.
  const [osd, setOsd] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clunk = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  // Measured rather than read once. `Dimensions.get` is a snapshot taken at the
  // first render, and every measurement below — the window, the room, the hole
  // in the glass, where the armrest lands, where the head rests — is derived
  // from it. A snapshot means a rotation, or a window that changes size after a
  // video fullscreen hands the screen back, leaves all of that pointing at a
  // room that is no longer on screen.
  const { width: screenW } = useWindowDimensions();

  // ── The tape going in ───────────────────────────────────────────────
  const tape = useSharedValue(0); // 0 = seated in the deck, 1 = proud of the mouth

  // ── Turning your head ───────────────────────────────────────────────
  // A flat photograph slid sideways reads as a flat photograph slid sideways.
  // What makes it read as a room is that the walls swing: the window tilts on a
  // vertical axis through its own centre while you're moving, and settles back
  // to square the moment you stop. Driven by speed rather than position, so
  // it's a head turning rather than a claim about where the walls are — and so
  // there is no transform at all on the player while you're actually watching.
  const yaw = useSharedValue(0);
  const pitch = useSharedValue(0);
  const last = useRef({ x: 0, y: 0 });
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yawStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateY: `${yaw.value}deg` },
      { rotateX: `${pitch.value}deg` },
    ],
  }));

  useEffect(() => {
    void api<{ channels: Channel[]; films: Short[]; scene: Scene }>("/api/shorts").then((res) => {
      if (!res.ok || !res.data) {
        setError("The set won't warm up. Try again in a minute.");
        setFilms([]);
        return;
      }
      setChannels(res.data.channels ?? []);
      setFilms(res.data.films ?? []);
      setScene(res.data.scene ?? null);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (clunk.current) clearTimeout(clunk.current);
      if (osdTimer.current) clearTimeout(osdTimer.current);
      if (settle.current) clearTimeout(settle.current);
      if (digitTimer.current) clearTimeout(digitTimer.current);
    };
  }, []);

  const onChannel = useCallback(
    (ch: Channel, ejectFirst = false) => {
      const pool = (films ?? []).filter((f) => f.channels.includes(ch.key));
      const next = pick(pool, film?.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        setDeckBusy(false);
        setOsd(`CH ${n}  ${ch.label.toUpperCase()} — NO SIGNAL`);
        if (osdTimer.current) clearTimeout(osdTimer.current);
        osdTimer.current = setTimeout(() => setOsd(null), 2400);
        return;
      }
      setFilm(next);
      // The picture comes up on the same frame as the button press. Whatever
      // the deck is doing, it does behind the film.
      setStage("playing");
      setOsd(`CH ${n}  ${ch.label.toUpperCase()}`);
      if (osdTimer.current) clearTimeout(osdTimer.current);
      osdTimer.current = setTimeout(() => setOsd(null), 2400);
      // Reduced motion gets a straight cut. The animation is decoration, and
      // decoration is never worth making someone feel unwell.
      if (reduced) {
        setDeckBusy(false);
        return;
      }
      setDeckBusy(true);
      // A front-loading VCR takes the tape straight down into the slot. `tape`
      // is the tape's own travel: 1 = held proud of the mouth, 0 = swallowed.
      // The deck's face is drawn OVER the tape, so descending reads as going
      // inside the machine rather than fading out. Ejecting runs the same
      // travel in reverse first — the old tape out, then the new one in.
      if (ejectFirst) {
        tape.value = 0;
        tape.value = withSequence(
          withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }), // out it comes
          withTiming(0.12, { duration: 560, easing: Easing.in(Easing.cubic) }), // and the next goes down
          withTiming(0, { duration: 140 }),
        );
      } else {
        tape.value = 1;
        tape.value = withSequence(
          withTiming(1, { duration: 260 }), // held out, waiting to be taken
          withTiming(0.12, { duration: 620, easing: Easing.in(Easing.cubic) }), // drawn in
          withTiming(0, { duration: 140 }), // the mechanism seats it
        );
      }
      if (clunk.current) clearTimeout(clunk.current);
      // The clunk lands when the mechanism bottoms out, not when the tape
      // starts moving — the haptic has to agree with what you're watching.
      clunk.current = setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 900);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDeckBusy(false), TAPE_MS);
    },
    [films, film?.id, reduced, tape, channels],
  );

  // ⏏ still ejects: the old tape rides out and the next one goes down after it.
  // The film underneath changes immediately, because nobody pressed a button
  // labelled "next tape" hoping to watch a second of nothing first.
  const nextTape = useCallback(() => {
    if (!channel) return;
    onChannel(channel, true);
  }, [channel, onChannel]);

  // 1 = proud of the mouth, 0 = fully inside. Nothing fades: the deck face
  // covers it, the way a real slot does.
  const tapeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - tape.value) * TAPE_TRAVEL }],
  }));

  /**
   * Mute the film that's actually playing. The WebView loads player.vimeo.com
   * as its own document rather than as an iframe inside ours, so the real
   * <video> element is right there to talk to — no player SDK required.
   * Re-applied whenever the film changes, because a fresh player starts unmuted
   * and a MUTE key that silently forgets itself is worse than a dead one.
   */
  const applyMute = useCallback((m: boolean) => {
    webRef.current?.injectJavaScript(
      `(function(){var v=document.querySelector('video');if(v){v.muted=${m};}})();true;`,
    );
  }, []);

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
    void Haptics.selectionAsync();
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
        void Haptics.selectionAsync();
        setOsd(`CH ${String(n).padStart(2, "0")}  NO SIGNAL`);
        if (osdTimer.current) clearTimeout(osdTimer.current);
        osdTimer.current = setTimeout(() => setOsd(null), 1600);
        return;
      }
      onChannel(ch);
    },
    [channels, onChannel],
  );

  // Two-digit dialing. Fourteen channels means some of them don't fit on a
  // single key — this is how a real remote's 0-9 pad reaches channel 12
  // without a button labelled "12" existing anywhere on it: press 1, press 2
  // within the window, and the two digits become one number. Below ten
  // channels this never waits at all — the buffer completes on the first
  // press, so a four-channel guide behaves exactly as it did before.
  const digitsRef = useRef("");
  const digitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDigits = channels.length > 9 ? 2 : 1;

  const pressDigit = useCallback(
    (d: number) => {
      void Haptics.selectionAsync();
      const typed = (digitsRef.current + String(d)).slice(-maxDigits);
      digitsRef.current = typed;
      if (digitTimer.current) clearTimeout(digitTimer.current);

      if (typed.length < maxDigits) {
        // Still typing — show the digits so far, the way a real set does,
        // rather than going quiet until the second key lands.
        setOsd(`CH ${typed}_`);
        digitTimer.current = setTimeout(() => {
          digitsRef.current = "";
          press(Number(typed));
        }, 900);
        return;
      }
      digitsRef.current = "";
      press(Number(typed));
    },
    [maxDigits, press],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!channels.length) return;
      const at = channel ? channels.indexOf(channel) : -1;
      const next = (at + dir + channels.length) % channels.length;
      onChannel(channels[next]);
    },
    [channels, channel, onChannel],
  );

  const togglePower = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setPower((on) => {
      if (on) {
        setStage("guide");
        setOsd(null);
      }
      return !on;
    });
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of films ?? []) for (const c of f.channels) m[c] = (m[c] ?? 0) + 1;
    return m;
  }, [films]);

  // The room. You are in the chair and the room is wider than what you can see
  // of it, so the photograph runs past both edges of the window and swiping
  // turns your head. Geometry arrives as fractions — of the room for anything
  // nailed to a wall, of the window for anything within arm's reach — so it
  // lands right at any width without measuring the bitmap.
  const sceneOn = !!scene?.image && !sceneBroken && !big;
  const sceneW = screenW - 40; // the window
  const sceneH = scene ? Math.round(sceneW / scene.view) : 0;
  // The room is drawn taller than the window and hung from the bottom of it.
  // That is what pushes in on the set without ever cropping the lap.
  const roomH = scene ? Math.round(sceneH * scene.zoom) : 0;
  const roomW = scene ? Math.round(roomH * scene.aspect) : 0;
  // Where the overflow is taken from. Derived from the set's own place in the
  // photograph, so the push-in crops around the television rather than sliding
  // it up the frame: at any zoom the set sits at the same height it sits at in
  // the picture.
  // Where the eyes rest vertically. Derived from the set's own place in the
  // photograph, so the push-in crops around the television rather than sliding
  // it up the frame — and so looking up finds the ceiling and looking down
  // finds the carpet, with the set in between.
  const roomTop = scene
    ? Math.max(0, Math.min(roomH - sceneH, Math.round(roomH * scene.eye.y - sceneH / 2)))
    : 0;
  const hole = scene && {
    left: Math.round(roomW * scene.screen.x),
    top: Math.round(roomH * scene.screen.y),
    width: Math.round(roomW * scene.screen.w),
    height: Math.round(roomH * scene.screen.h),
  };
  // Pinned to the window: your body doesn't turn, only your head.
  // The console, bolted across the front of the chair. Width comes from the
  // view rather than the room, because turning your head doesn't move it.
  const dashW = scene ? Math.round(sceneW * scene.dash.w) : 0;
  const dashH = scene ? Math.round(dashW / scene.dash.aspect) : 0;
  const armrest = scene && {
    left: Math.round(sceneW * scene.dash.x),
    bottom: Math.round(sceneH * scene.dash.bottom),
    width: dashW,
    height: dashH,
  };

  // The tube. In the room it takes the glass's own measurements, which are a
  // 1.27 rectangle rather than a 4:3 one. Outside the room there is no
  // photograph to agree with, so it's a plain 4:3 box.
  const inRoom = sceneOn && hole;
  const tubeW = inRoom ? hole.width : big ? screenW : screenW - 40;
  const tubeH = inRoom ? hole.height : Math.round((tubeW * 3) / 4);

  // The player fills the glass rather than fitting inside it. A 16:9 film in a
  // 1.27 hole letterboxes if you size it to the hole, and the black bars sit
  // inside a photograph of a switched-on television — which reads as a bug, not
  // as a film. So it is sized by height and allowed to overhang, and the glass
  // crops the sides. That is pan-and-scan, which is exactly what a widescreen
  // film looked like on a set this shape.
  const fillW = inRoom ? Math.round((tubeH * 16) / 9) : tubeW;
  const fillX = Math.round((tubeW - fillW) / 2);

  // Where the head rests: the set, centred. Everything else is a turn away from
  // it in one direction or the other.
  const panMax = Math.max(0, roomW - sceneW);
  const home = scene
    ? Math.max(0, Math.min(panMax, Math.round(roomW * scene.eye.x - sceneW / 2)))
    : 0;

  /**
   * One frame of looking around. The swing runs off how fast you're moving
   * rather than where you've got to: it is a head turning, not a claim about
   * where the walls are, and it means there is no transform on the player at
   * all while you're actually watching something.
   */
  const look = useCallback(
    (at: number, axis: "x" | "y") => {
      if (axis === "x") setTurned(Math.abs(at - home) > 24);
      if (reduced) return;
      const d = at - last.current[axis];
      last.current[axis] = at;
      const swing = Math.max(-7, Math.min(7, d * -0.5));
      // Away from the direction of travel: sweeping right swings the left of
      // the room away from you, which is what turning your head towards the
      // right wall actually does to the left one. Up is the same in the other
      // plane — the ceiling leans back as you raise your eyes to it.
      if (axis === "x") yaw.value = withTiming(swing, { duration: 90 });
      else pitch.value = withTiming(-swing * 0.6, { duration: 90 });
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        yaw.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
        pitch.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) });
      }, 110);
    },
    [home, reduced, yaw, pitch],
  );

  const lookBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    roomRef.current?.scrollTo({ x: home, animated: true });
    roomYRef.current?.scrollTo({ y: roomTop, animated: true });
  }, [home, roomTop]);

  // Face the set the moment the room is measured, and without an animation —
  // you were always sitting here, you didn't pan into position.
  //
  // Keyed on the room being on screen as well as on where home is. Leaving full
  // width takes the room out of the tree, and coming back mounts a fresh pair of
  // ScrollViews sitting at 0,0. `home` and `roomTop` are numbers that did not
  // change, so on their own they never put the head back — which is how a
  // fullscreen round trip ends up looking at the corner of the photograph
  // rather than at the set.
  useEffect(() => {
    if (!inRoom) return;
    if (home > 0) roomRef.current?.scrollTo({ x: home, animated: false });
    if (roomTop > 0) roomYRef.current?.scrollTo({ y: roomTop, animated: false });
    yaw.value = 0;
    pitch.value = 0;
    last.current = { x: 0, y: 0 };
  }, [home, roomTop, inRoom, yaw, pitch]);

  // A film handed over to the platform's own fullscreen and given back leaves
  // the room mounted but not necessarily where you left it: the player has been
  // over the top of everything, and on iOS a video fullscreen can come back to a
  // re-measured window. Returning to the app is the only moment that is always
  // ours to act on, so it is where the set gets faced again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      yaw.value = 0;
      pitch.value = 0;
      last.current = { x: 0, y: 0 };
      if (home > 0) roomRef.current?.scrollTo({ x: home, animated: false });
      if (roomTop > 0) roomYRef.current?.scrollTo({ y: roomTop, animated: false });
    });
    return () => sub.remove();
  }, [home, roomTop, yaw, pitch]);

  // Change the channel and your eyes go back to the set on their own. Nobody
  // presses 3 while facing the Nerf shelf and means to keep facing it.
  useEffect(() => {
    if (film) roomRef.current?.scrollTo({ x: home, animated: true });
  }, [film?.id, home]);

  const playerSrc =
    film?.source === "vimeo"
      ? // playsinline keeps iOS from seizing the film into its own fullscreen
        // player the moment it starts — the same reason the web embed asks for
        // it, and the same bug when it is missing.
        `https://player.vimeo.com/video/${film.videoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1&playsinline=1`
      : null;

  // The tube and the remote are built once and placed twice: in the plain
  // cabinet, or inside the room's transparent screen and on its armrest. One
  // definition each, so playback and the keys cannot drift between frames — and
  // only ever one player mounted.
  const tube = (
          <View
            style={[
              styles.tube,
              { width: tubeW, height: tubeH },
              // Square inside the room: a rounded corner against the
              // photograph's square glass reads as a gap, not as a bezel.
              inRoom ? { borderRadius: 0 } : null,
            ]}
          >
          <Pressable
            onPress={() => setBig((v) => !v)}
            style={{ position: "absolute", left: fillX, top: 0, width: fillW, height: tubeH }}
          >
            {!power ? (
              <View style={styles.dead} />
            ) : stage === "playing" && film ? (
              film.source === "vimeo" ? (
                <WebView
                  ref={webRef}
                  onLoadEnd={() => applyMute(muted)}
                  source={{ uri: playerSrc! }}
                  style={styles.player}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo
                />
              ) : (
                // Width as well as height: left to itself the iframe takes the
                // whole window, which inside the room's screen means the film
                // hangs off the glass to the right.
                <YoutubePlayer height={tubeH} width={fillW} play mute={muted} videoId={film.videoId} />
              )
            ) : (
              <View style={styles.deck}>
                <View style={styles.staticBars} />
                <Text style={styles.noSignal}>NO SIGNAL</Text>
              </View>
            )}
          </Pressable>

            {/* Badge and scanlines belong to the glass, not to the film — the
                film overhangs it, and a channel number cropped in half by the
                bezel would be worse than none. */}
            {osd && power && (
              <View style={styles.osd}>
                <Text style={styles.osdText}>{osd}</Text>
              </View>
            )}

            {!big && (
              <View pointerEvents="none" style={styles.scanlines}>
                {Array.from({ length: 42 }).map((_, i) => (
                  <View key={i} style={styles.scanline} />
                ))}
              </View>
            )}
          </View>
  );

  /**
   * The console. It replaces a hand-drawn handset that was two keys wide
   * because a wider one would have covered the television — this is a
   * photograph of a real-looking dash instead, run flush to the bottom of the
   * frame with the recliner's own arms still showing either side of it.
   *
   * Every key on it is painted into the picture and can't move, so the
   * controls are transparent hit boxes measured off the image and positioned
   * as fractions of it — the same rectangles the web reads, off the same
   * server, rather than each platform guessing at them separately.
   */
  const fireKey = useCallback(
    (k: DashKey) => {
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
          return nextTape();
        case "mute":
          return toggleMute();
        case "vol-down":
          void Haptics.selectionAsync();
          setMuted(true);
          applyMute(true);
          return flash("MUTE");
        case "vol-up":
          void Haptics.selectionAsync();
          setMuted(false);
          applyMute(false);
          return flash("VOL  \u25AE\u25AE\u25AE\u25AE");
        case "guide":
          void Haptics.selectionAsync();
          // The guide is already on the page and every line of it is a
          // channel button, so MENU brings the page to it rather than opening
          // anything. Its offset is recorded by the card's own onLayout.
          return pageRef.current?.scrollTo({ y: Math.max(0, guideY.current - 40), animated: true });
        case "exit":
          void Haptics.selectionAsync();
          return big ? setBig(false) : lookBack();
        // SOURCE has one source. The keys are on the photograph either way, so
        // they answer rather than doing nothing at all — the same courtesy the
        // old remote's dead keys got.
        case "source":
          void Haptics.selectionAsync();
          return flash(k.label.toUpperCase());
        default:
          return;
      }
    },
    [togglePower, press, step, nextTape, toggleMute, applyMute, flash, big, lookBack],
  );

  const dashboard = scene && (
    <View
      style={{
        width: dashW,
        height: dashH,
        // Stand its face up a few degrees. The photograph looks steeply down
        // at the console; hinging it back points it at you without flattening
        // it into a poster. The keys ride the same transform, so their hit
        // boxes tilt with the paint.
        transform: [
          { perspective: 900 },
          { translateY: dashH / 2 },
          { rotateX: `-${scene.dash.tilt}deg` },
          { translateY: -dashH / 2 },
        ],
      }}
    >
      <Image
        source={{ uri: scene.dash.image }}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        pointerEvents="none"
      />
      {/* The hologram stands on the console's own projector lens, sized off
          the dome so it scales with the picture rather than drifting off it
          at another width. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: dashW * (scene.dash.dome.x - 0.065),
          bottom: dashH * (1 - scene.dash.dome.y),
        }}
      >
        <HoloCamera size={dashW * 0.13} reduced={reduced} />
      </View>
      {scene.dash.keys.map((k, i) => (
        <Pressable
          key={`${k.action}-${k.n ?? i}`}
          onPress={() => fireKey(k)}
          accessibilityRole="button"
          accessibilityLabel={k.label}
          hitSlop={8}
          style={({ pressed }) => [
            {
              position: "absolute",
              left: dashW * k.x,
              top: dashH * k.y,
              width: dashW * k.w,
              height: dashH * k.h,
              borderRadius: 3,
            },
            pressed && { backgroundColor: "rgba(125,249,255,0.25)" },
          ]}
        />
      ))}
    </View>
  );

  const remote = (
            <View style={styles.remote}>
              {/* Top: power and the two dead keys every remote had. */}
              <View style={styles.rRow}>
                <RKey label="POWER" tone="orange" onPress={togglePower} />
                <RKey label="⛶ FULL" tone="grey" onPress={() => setBig((v) => !v)} />
                <RKey label="SLEEP" tone="dead" />
                <View style={styles.rDivider} />
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.rColHead}>CHANNEL</Text>
                </View>
              </View>

              <View style={styles.rBody}>
                {/* Keypad */}
                <View style={styles.rPad}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <RKey
                      key={n}
                      label={String(n)}
                      // Greyed only by whether n alone is ever meaningful. Past
                      // nine channels every single digit is also the start of a
                      // two-digit one, so a key can't be marked dead just for
                      // failing to name a channel on its own.
                      tone={channels[n - 1] || maxDigits > 1 ? "grey" : "dead"}
                      wide
                      onPress={() => pressDigit(n)}
                    />
                  ))}
                  <View style={styles.rZero}>
                    <RKey
                      label="0"
                      tone={maxDigits > 1 ? "grey" : "dead"}
                      wide
                      onPress={() => pressDigit(0)}
                    />
                  </View>
                </View>

                {/* Channel column */}
                <View style={styles.rCol}>
                  <RKey label="CH ▲" tone="grey" onPress={() => step(1)} />
                  <RKey label="CH ▼" tone="grey" onPress={() => step(-1)} />
                  <RKey label="EJECT" tone="orange" onPress={nextTape} />
                </View>
              </View>

              <View style={styles.rRow}>
                <RKey label="MENU" tone="orange" />
                <RKey label="SELECT" tone="orange" onPress={() => channel && press(channels.indexOf(channel) + 1)} />
                <RKey label="MUTE" tone={muted ? "orange" : "grey"} onPress={toggleMute} />
              </View>

              <Text style={styles.rModel}>8650-EO</Text>
              <Text style={styles.rBrand}>DEEP CUT</Text>
            </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView ref={pageRef} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <BackButton />

        <View>
          <MarqueeBulbs />
          <Eyebrow style={{ marginTop: 10 }}>Monthly showcase</Eyebrow>
          <Marquee size={38}>DEEP CUT THEATRE</Marquee>
          <Text style={styles.lead}>
            Award-winning indie films you&apos;ve never seen. New bill every month. Pick a
            channel, then have a look around the room.
          </Text>
        </View>

        {/* ── The set ─────────────────────────────────────────────────
            With a scene, the television is in the photograph: the picture sits
            behind the image's transparent screen and the remote rests on its
            empty armrest, so the room stays photographic while the controls
            stay legible and unbranded. Without one — or once the picture is
            pulled full width — it's the plain cabinet. */}
        {sceneOn && scene?.image && hole ? (
          <View
            style={{ width: sceneW, height: sceneH, alignSelf: "center", overflow: "hidden" }}
          >
            {/* Everything that swings goes in here and nothing else: the tilt
                pivots on this box's own centre, which is exactly the point you
                are looking at, and the remote and the chip stay square to you
                because your hand and your eyes don't turn with your head. */}
            <Animated.View style={[StyleSheet.absoluteFill, yawStyle]}>
            {/* The head turn. The room is bigger than the window in both
                directions, and dragging it is looking around: left along the
                Goonies wall, right into the Nerf arsenal, up to the string
                lights on the ceiling, down to the carpet. The film keeps
                playing the whole time you're looking away, which is the entire
                point of being allowed to look away.

                Two scrollers rather than one gesture, because a scroller
                already knows about momentum, rubber-banding at the limits and
                handing the drag back to the page when it runs out of room. The
                outer one is the neck; the inner one is the head. */}
            <ScrollView
              ref={roomYRef}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => look(e.nativeEvent.contentOffset.y, "y")}
              style={StyleSheet.absoluteFill}
              contentContainerStyle={{ height: roomH }}
            >
            <ScrollView
              ref={roomRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={(e) => look(e.nativeEvent.contentOffset.x, "x")}
              style={{ height: roomH }}
              contentContainerStyle={{ width: roomW, height: roomH }}
            >
              <View style={{ width: roomW, height: roomH }}>
                {/* Photograph first, picture composited on top and clipped to
                    the screen. No alpha channel required anywhere. */}
                <Image
                  source={{ uri: scene.image }}
                  style={StyleSheet.absoluteFill}
                  contentFit="fill"
                  pointerEvents="none"
                  onError={() => setSceneBroken(true)}
                />
                <View style={[styles.hole, hole]}>{tube}</View>
                {/* Tapping the television takes the film full width — the room
                    is for flipping channels, not for watching twenty minutes
                    inside a box that's a third of the screen. */}
                <Pressable
                  style={[styles.holeHit, hole]}
                  onPress={() => setBig(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Watch full width"
                />
              </View>
            </ScrollView>
            </ScrollView>
            </Animated.View>

            {/* The frame is a hole you look through, not a picture hung on a
                wall — the edges have to fall off. Stacked bars rather than a
                gradient, because a gradient would mean a new dependency for
                four soft edges. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {Array.from({ length: 6 }).map((_, i) => {
                const w = 6 + i * 5;
                const o = 0.05 + i * 0.035;
                return (
                  <React.Fragment key={i}>
                    <View style={[styles.vigL, { width: w, backgroundColor: `rgba(0,0,0,${o})` }]} />
                    <View style={[styles.vigR, { width: w, backgroundColor: `rgba(0,0,0,${o})` }]} />
                    <View style={[styles.vigT, { height: w, backgroundColor: `rgba(0,0,0,${o})` }]} />
                    <View style={[styles.vigB, { height: w, backgroundColor: `rgba(0,0,0,${o})` }]} />
                  </React.Fragment>
                );
              })}
            </View>

            {/* Turn far enough and the set is behind you. Nothing here is ever
                a dead end: one tap puts your eyes back on it. */}
            {turned && (
              <Pressable style={styles.recenter} onPress={lookBack}>
                <Text style={styles.recenterText}>BACK TO THE SET</Text>
              </Pressable>
            )}

            {/* The remote sits on the arm of the chair, and the chair doesn't
                turn — so it stays put while the room slides behind it. Pinned
                also means the keys can never be looked away from. */}
            {armrest && <View style={[styles.armrest, armrest]}>{dashboard}</View>}
          </View>
        ) : (
        <View style={[styles.cabinet, big && styles.cabinetBare]}>
          {tube}

          {!big && (
            <View style={styles.deckFace}>
              {/* Paint order IS the illusion: mouth, then tape, then the face
                  plate on top. The tape slides BEHIND the plate, which is what
                  makes it read as going inside the machine instead of fading. */}
              <View style={styles.slotMouth} />
              {film && deckBusy && (
                <Animated.View style={[styles.tape, tapeStyle]}>
                  <View style={styles.tapeSpools}>
                    <View style={styles.spool} />
                    <View style={styles.spool} />
                  </View>
                  <View style={styles.tapeLabel}>
                    <Text style={styles.tapeTitle} numberOfLines={1}>
                      {film.title.toUpperCase()}
                    </Text>
                    <Text style={styles.tapeSub} numberOfLines={1}>
                      {film.director} · {film.year}
                    </Text>
                  </View>
                </Animated.View>
              )}
              <View style={styles.facePlate}>
                <View style={styles.slotLip} />
                <View style={styles.deckRow}>
                  <View style={[styles.led, stage === "playing" && { backgroundColor: colors.avail }]} />
                  <Text style={styles.deckText}>
                    {channel
                      ? `CH ${String(channels.indexOf(channel) + 1).padStart(2, "0")} \u00b7 ${channel.label.toUpperCase()}`
                      : "DEEP CUT \u00b7 4-HEAD HI-FI"}
                  </Text>
                  <View style={styles.knobs}>
                    <View style={styles.knob} />
                    <View style={styles.knob} />
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
        )}

        {big && (
          <Text style={styles.hint} onPress={() => setBig(false)}>
            tap the picture to put it back in the set
          </Text>
        )}

        {/* ── What's on ───────────────────────────────────────────── */}
        {film && !big && (
          <View style={styles.card}>
            <Text style={styles.filmTitle}>{film.title.toUpperCase()}</Text>
            <Text style={styles.filmMeta}>
              {film.director} · {film.year} · {runtime(film.runtimeSec)}
            </Text>
            <Text style={styles.synopsis}>{film.synopsis}</Text>
            <Text style={styles.pedigree}>🏆 {film.pedigree}</Text>
            <Pressable onPress={nextTape} style={styles.nextTape}>
              <Text style={styles.nextTapeText}>⏏ Eject · next tape</Text>
            </Pressable>
          </View>
        )}

        {/* ── The remote ─────────────────────────────────────────────
            Numbered keys, not a list of channel names. A real remote has 0-9
            and the television tells you where you landed, which is why the OSD
            above exists — and it means the buttons never have to fit the words
            "TRUE STORIES" on them. The card under the remote is the paper one
            that lived taped inside the cabinet door. */}
        {error && <Text style={styles.error}>{error}</Text>}
        {films === null ? (
          <Text style={styles.dim}>Warming up the tube…</Text>
        ) : (
          <View style={styles.remoteWrap}>
            {!sceneOn && <View style={styles.remoteHolder}>{remote}</View>}

            {/* The card taped inside the cabinet door. Every line is a button:
                the compact remote on the armrest only numbers channels 1-4 —
                growing it to reach all fourteen is what made it too big to
                see the television in the first place — so the guide is the
                other way to reach 5 and up, same as pointing at the paper
                card taped inside a real cabinet and saying "that one." */}
            <View
              style={styles.card}
              onLayout={(e) => {
                guideY.current = e.nativeEvent.layout.y;
              }}
            >
              <Eyebrow>What&apos;s on</Eyebrow>
              {channels.map((ch, i) => (
                <Pressable
                  key={ch.key}
                  onPress={() => onChannel(ch)}
                  accessibilityRole="button"
                  accessibilityLabel={`Watch ${ch.label}`}
                  style={({ pressed }) => [styles.guideRow, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.guideLine}>
                    <Text style={styles.guideNum}>{String(i + 1).padStart(2, "0")}</Text>
                    {"  "}
                    {ch.glyph} {ch.label.toUpperCase()}
                    <Text style={styles.guideCount}>  ({counts[ch.key] ?? 0})</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footnote}>
          Every film plays from its maker&apos;s own account. Their views, their numbers — we
          just keep the room dark.
        </Text>
      </ScrollView>
      <HouseNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  lead: { color: colors.dim, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 6 },

  // The set — a chunky plastic cabinet with the tube sunk into it.
  cabinet: {
    alignSelf: "center",
    backgroundColor: "#2b221c",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#4a3b31",
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cabinetBare: { backgroundColor: "transparent", borderWidth: 0, padding: 0, borderRadius: 0 },
  tube: { backgroundColor: "#05060a", borderRadius: 10, overflow: "hidden" },
  player: { flex: 1, backgroundColor: "#000" },
  deck: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0a1020" },
  staticBars:{ ...StyleSheet.absoluteFill, backgroundColor: "#141414", opacity: 0.9 },
  noSignal: { color: colors.dim, fontFamily: mono, fontSize: 11, letterSpacing: 3 },

  // The deck. overflow:hidden is what swallows the tape, and the face plate
  // sits above it in paint order so nothing has to fade out.
  deckFace: { marginTop: 8, overflow: "hidden" },
  slotMouth: {
    height: 16,
    marginHorizontal: 12,
    borderRadius: 3,
    backgroundColor: "#08070a",
    borderWidth: 1,
    borderColor: "#0f0d0b",
  },
  tape: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    backgroundColor: "#17140f",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#3b332a",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 5,
  },
  tapeSpools: { flexDirection: "row", justifyContent: "space-around" },
  spool: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#584a3d",
    backgroundColor: "#0d0b08",
  },
  tapeLabel: { backgroundColor: "#e8e0cd", borderRadius: 2, paddingVertical: 4, paddingHorizontal: 6 },
  tapeTitle: { color: "#1a1410", fontFamily: fonts.display, fontSize: 14, lineHeight: 15 },
  tapeSub: { color: "#5a4c3e", fontFamily: mono, fontSize: 8, marginTop: 1 },
  facePlate: { backgroundColor: "#2b221c", paddingTop: 6 },
  slotLip: { height: 3, marginHorizontal: 12, borderRadius: 2, backgroundColor: "#3d312a" },
  deckRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 7, paddingHorizontal: 4 },
  deckText: { flex: 1, color: "#8d7a68", fontFamily: mono, fontSize: 9, letterSpacing: 1.5 },

  scanlines: { ...StyleSheet.absoluteFill, justifyContent: "space-between" },
  scanline: { height: 1, backgroundColor: "rgba(0,0,0,0.22)" },

  led: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ticket },
  knobs: { flexDirection: "row", gap: 6 },
  knob: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#1d1712", borderWidth: 1, borderColor: "#584a3d" },

  hint: { color: colors.dim, fontFamily: mono, fontSize: 10, textAlign: "center", letterSpacing: 1 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  filmTitle: { color: colors.amber, fontFamily: fonts.display, fontSize: 26, lineHeight: 28 },
  filmMeta: { color: colors.dim, fontFamily: mono, fontSize: 11 },
  synopsis: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 2 },
  pedigree: { color: colors.avail, fontFamily: mono, fontSize: 10, lineHeight: 16, marginTop: 2 },
  nextTape: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  nextTapeText: { color: colors.amber, fontFamily: mono, fontSize: 11, letterSpacing: 1.5 },

  dead: { flex: 1, backgroundColor: "#04050a" },
  // The picture, sunk into the photograph's screen.
  hole: { position: "absolute", overflow: "hidden", backgroundColor: "#04050a" },
  recenter: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(4,8,16,0.78)",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  recenterText: { color: colors.amber, fontFamily: mono, fontSize: 9, letterSpacing: 1.4 },
  holeHit: { position: "absolute" },
  vigL: { position: "absolute", left: 0, top: 0, bottom: 0 },
  vigR: { position: "absolute", right: 0, top: 0, bottom: 0 },
  vigT: { position: "absolute", left: 0, right: 0, top: 0 },
  vigB: { position: "absolute", left: 0, right: 0, bottom: 0 },
  osd: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(4,8,16,0.72)",
    borderRadius: 2,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  osdText: { color: "#7ef0a0", fontFamily: mono, fontSize: 10, letterSpacing: 2 },

  // The remote. A slab of black plastic on a wood table — grey rubber keys,
  // orange for the ones that matter, silkscreened labels above each.
  remoteWrap: { gap: 12 },
  armrest: { position: "absolute" },
  remoteHolder: { alignSelf: "center", width: "82%", maxWidth: 300 },
  remote: {
    width: "100%",
    backgroundColor: "#141416",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2c2c30",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  rRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  rDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#3a3a3f", marginHorizontal: 4 },
  rColHead: { color: "#d6d2c8", fontFamily: mono, fontSize: 7, letterSpacing: 1.5 },
  rBody: { flexDirection: "row", gap: 8 },
  rPad: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rZero: { width: "100%", alignItems: "center" },
  rCol: { width: 54, gap: 6 },

  keyWrap: { alignItems: "center", minWidth: 30 },
  keyLabel: { color: "#e4e0d6", fontFamily: mono, fontSize: 7, letterSpacing: 0.8, marginBottom: 2 },
  key: {
    width: "100%",
    minWidth: 26,
    height: 22,
    borderRadius: 3,
    borderWidth: 1,
  },
  keyGrey: { backgroundColor: "#b4aea3", borderColor: "#8d887e" },
  keyOrange: { backgroundColor: "#e0551d", borderColor: "#a83e13" },
  keyDown: { transform: [{ translateY: 1 }], opacity: 0.75 },
  rModel: { color: "#7c7a74", fontFamily: mono, fontSize: 8, letterSpacing: 1, marginTop: 2 },
  rBrand: { color: "#d6d2c8", fontFamily: fonts.display, fontSize: 15, letterSpacing: 2 },

  guideRow: { paddingVertical: 2 },
  guideLine: { color: colors.cream, fontFamily: mono, fontSize: 11, lineHeight: 19 },
  guideNum: { color: colors.ticket, fontFamily: fonts.monoSemi },
  guideCount: { color: colors.dim, fontSize: 9 },

  dim: { color: colors.dim, fontFamily: mono, fontSize: 12, textAlign: "center" },
  error: { color: colors.ticket, fontFamily: mono, fontSize: 12, textAlign: "center" },
  footnote: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 9,
    lineHeight: 15,
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
