"use client";
import { useEffect, useState } from "react";

// VAPID public keys are base64url; the push manager wants a Uint8Array.
function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "working";

/**
 * The Friday Night Deal opt-in. Subscribes the browser to web push and stores
 * the subscription server-side. Degrades to a clear "not available" when the
 * browser can't do push or the house hasn't wired VAPID keys yet — never an
 * error the user has to decode.
 */
export default function NotificationsToggle() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) return alive && setState("unsupported");
      // Push must be configured on the server for the toggle to mean anything.
      const key = await fetch("/api/push/vapid")
        .then((r) => r.json())
        .then((d) => d.key as string | null)
        .catch(() => null);
      if (!key) return alive && setState("unsupported");
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
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const key = await fetch("/api/push/vapid")
        .then((r) => r.json())
        .then((d) => d.key as string | null);
      if (!key) return setState("unsupported");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const body = await res.json().catch(() => ({}));
      setState(res.ok && body.ok !== false ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        }).catch(() => null);
        await sub.unsubscribe().catch(() => null);
      }
    } finally {
      setState("off");
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  const on = state === "on";
  const busy = state === "working";
  const denied = state === "denied";

  return (
    <div>
      <p className="eyebrow mb-2">Friday Night Deal</p>
      <button
        onClick={() => (on ? void disable() : void enable())}
        disabled={busy || denied}
        aria-pressed={on}
        className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3 disabled:opacity-60"
      >
        <span className="text-left">
          <span className="block font-mono text-xs uppercase tracking-wider text-cream">
            🎬 Weekly deal alert
          </span>
          <span className="font-mono text-[0.6rem] text-dim">
            {denied
              ? "blocked in your browser settings — turn it back on there"
              : "one deep cut, dealt to you every Friday night"}
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
