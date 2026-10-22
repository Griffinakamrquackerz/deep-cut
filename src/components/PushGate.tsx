"use client";
import { useEffect, useState } from "react";
import { askAndSubscribe, ensureSubscribed, pushSupported, vapidKey } from "@/lib/push-client";

// Getting notifications turned on, without spending the one prompt badly.
//
// Two jobs.
//
// Silent: anyone who has already granted permission gets subscribed on every
// page load, no prompt, no UI. That covers a new device, cleared site data, and
// — the one that actually bites — a rotated VAPID key, which orphans every
// existing subscription while the Settings toggle still cheerfully reads "On".
//
// The ask: everyone else sees a bar, once. It exists because the real browser
// prompt cannot be un-asked. Click Block and no code can ever raise it again;
// it takes a trip into browser settings to undo. Firing that on a cold page
// load, before anybody has seen why it would be worth it, is how a site gets
// permanently muted for most of the people who visit it — and Chrome compounds
// it by auto-suppressing prompts from sites with poor accept rates. So this
// waits for a moment where the reason is already obvious, and "Not now" is a
// real answer that costs nothing.

const SNOOZE_KEY = "dc_push_ask_snoozed";
const SNOOZE_DAYS = 30;

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false; // private mode: just don't remember
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400_000));
  } catch {
    /* nothing to remember it with */
  }
}

/**
 * Mounted app-wide. Does the silent half always; shows the bar only when
 * `ask` is true — i.e. from a screen where notifications have just become
 * obviously relevant.
 */
export default function PushGate({ ask = false }: { ask?: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!pushSupported()) return;

      // Already said yes: keep them subscribed, say nothing.
      if (Notification.permission === "granted") {
        void ensureSubscribed();
        return;
      }
      // Already said no: the browser won't let us ask again, so don't pretend.
      if (Notification.permission === "denied") return;
      if (!ask || snoozed()) return;
      // A bar promising notifications is a lie if the server has no keys.
      if (!(await vapidKey())) return;
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, [ask]);

  if (!show) return null;

  async function turnOn() {
    setBusy(true);
    const result = await askAndSubscribe();
    setBusy(false);
    // Denied or dismissed, it's gone either way — re-asking is not ours to do.
    if (result !== "on") snooze();
    setShow(false);
  }

  function notNow() {
    snooze();
    setShow(false);
  }

  return (
    <div className="mb-3 flex items-center gap-3 rounded border border-amber/40 bg-amber/5 p-3">
      <span aria-hidden className="text-xl">
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-cream">Get told when someone sends you a film</p>
        <p className="font-mono text-[0.6rem] text-dim">
          tags and films only — turn it off any time in Settings
        </p>
      </div>
      <button
        onClick={() => void turnOn()}
        disabled={busy}
        className="shrink-0 rounded bg-amber px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-bg disabled:opacity-50"
      >
        {busy ? "…" : "Turn on"}
      </button>
      <button
        onClick={notNow}
        className="shrink-0 font-mono text-[0.55rem] uppercase tracking-widest text-dim underline"
      >
        Not now
      </button>
    </div>
  );
}
