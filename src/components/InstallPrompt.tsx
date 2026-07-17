"use client";
import { useEffect, useState } from "react";

// Chrome/Android fire this before showing the native install banner. We stash
// the event so we can trigger the real install from our own button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; sniff for touch to catch it.
  const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || isIpad) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag instead of display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Platform-aware "add to home screen" helper.
 * - Already installed → renders nothing.
 * - Android/desktop Chrome → real one-tap install button (via beforeinstallprompt).
 * - iOS → the manual Safari share → Add to Home Screen steps.
 */
export default function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function nativeInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setDone(true);
    setDeferred(null);
  }

  // Already running as an installed app, or the user just installed it.
  if (installed || done) return null;
  if (!platform) return null; // pre-hydration: render nothing to avoid flash

  const canNativeInstall = deferred !== null;

  return (
    <div
      className={`ticket-edge w-full rounded bg-surface ${compact ? "p-4" : "p-5"}`}
    >
      <p className="eyebrow text-ticket">Take it with you</p>
      <h2 className={`font-display text-amber ${compact ? "text-2xl" : "text-3xl"}`}>
        ADD DEEP CUT TO YOUR HOME SCREEN
      </h2>
      <p className="mt-1 text-sm text-dim">
        Runs full-screen like a real app — no browser bars, loads instantly, works
        even on a weak signal.
      </p>

      {canNativeInstall ? (
        <button
          onClick={nativeInstall}
          className="pulse-cta mt-4 w-full rounded bg-ticket px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream"
        >
          ★ Install app ★
        </button>
      ) : platform === "ios" ? (
        <ol className="mt-4 flex flex-col gap-3">
          <Step n={1}>
            Tap the <ShareGlyph /> <b className="text-cream">Share</b> button in
            Safari&apos;s toolbar.
          </Step>
          <Step n={2}>
            Scroll down and tap <b className="text-cream">Add to Home Screen</b>.
          </Step>
          <Step n={3}>
            Tap <b className="text-cream">Add</b> — the Deep Cut ticket lands on your
            home screen.
          </Step>
          <p className="mt-1 font-mono text-[0.65rem] text-dim/80">
            On iPhone this only works in <b className="text-dim">Safari</b>, not
            Chrome.
          </p>
        </ol>
      ) : platform === "android" ? (
        <ol className="mt-4 flex flex-col gap-3">
          <Step n={1}>
            Tap the <b className="text-cream">⋮</b> menu (top-right) in Chrome.
          </Step>
          <Step n={2}>
            Tap <b className="text-cream">Add to Home screen</b> (or{" "}
            <b className="text-cream">Install app</b>).
          </Step>
          <Step n={3}>
            Confirm with <b className="text-cream">Add</b> / <b className="text-cream">Install</b>.
          </Step>
        </ol>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          <Step n={1}>
            Click the <b className="text-cream">install icon</b> (a monitor with a
            down-arrow) on the right of the address bar.
          </Step>
          <Step n={2}>
            Click <b className="text-cream">Install</b> — Deep Cut opens in its own
            window.
          </Step>
        </ol>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber font-mono text-xs text-amber">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-cream/90">{children}</span>
    </li>
  );
}

// The iOS share icon, inline so the steps read at a glance.
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="inline-block h-4 w-4 -translate-y-0.5 fill-none stroke-amber"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Share"
    >
      <path d="M12 3v13" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
