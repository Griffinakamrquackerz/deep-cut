"use client";
// Tiny retro sound effects, generated with the Web Audio API — no asset files.
// Only ever called from user gestures, so autoplay policies never block them.
// Muting persists in localStorage.

const MUTE_KEY = "dc_muted";

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(m: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTE_KEY, m ? "1" : "0");
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function blip(freq: number, durationMs: number, type: OscillatorType, gain = 0.05) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + durationMs / 1000);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + durationMs / 1000);
}

/** Dry projector-shutter click for the "deal" action. */
export function sfxClick() {
  blip(180, 55, "square", 0.04);
}

/** Bright two-note chime for "loved it". */
export function sfxChime() {
  blip(660, 120, "triangle", 0.06);
  setTimeout(() => blip(880, 160, "triangle", 0.06), 90);
}

/** Soft pop for watchlist / cross-off. */
export function sfxPop() {
  blip(440, 70, "sine", 0.05);
}
