"use client";
import { useEffect, useState } from "react";
import { askAndSubscribe, pushSupported, unsubscribe, vapidKey } from "@/lib/push-client";

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "working";

/**
 * The off switch — and the deliberate way in for anyone who said "not now".
 *
 * One toggle covers everything the house sends: the Friday deal, tags, and
 * films people hand you. It used to say "Friday Night Deal" and only mean
 * that; the label has to keep pace with what turning it on signs you up for.
 *
 * Subscribing itself lives in lib/push-client, shared with the in-app prompts,
 * so the toggle and the prompts can't disagree about what "on" means.
 */
export default function NotificationsToggle() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!pushSupported()) return alive && setState("unsupported");
      // With no key on the server the toggle would be a switch wired to
      // nothing, so it hides rather than lying.
      if (!(await vapidKey())) return alive && setState("unsupported");
      if (Notification.permission === "denied") return alive && setState("denied");
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const existing = reg ? await reg.pushManager.getSubscription() : null;
      if (alive) setState(existing ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setState("working");
    const result = await askAndSubscribe();
    setState(result === "on" ? "on" : result === "denied" ? "denied" : "off");
  }

  async function disable() {
    setState("working");
    await unsubscribe();
    setState("off");
  }

  if (state === "loading" || state === "unsupported") return null;

  const on = state === "on";
  const busy = state === "working";
  const denied = state === "denied";

  return (
    <div>
      <p className="eyebrow mb-2">Notifications</p>
      <button
        onClick={() => (on ? void disable() : void enable())}
        disabled={busy || denied}
        aria-pressed={on}
        className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3 disabled:opacity-60"
      >
        <span className="text-left">
          <span className="block font-mono text-xs uppercase tracking-wider text-cream">
            🎬 Alerts
          </span>
          <span className="font-mono text-[0.6rem] text-dim">
            {denied
              ? "blocked in your browser settings — turn it back on there"
              : "the Friday deal, tags, and films people send you"}
          </span>
        </span>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest ${
            on ? "border-avail text-avail" : "border-line text-dim"
          }`}
        >
          {busy ? "…" : denied ? "Blocked" : on ? "On" : "Off"}
        </span>
      </button>
    </div>
  );
}
