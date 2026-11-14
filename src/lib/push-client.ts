// Browser push, from the browser's side.
//
// Worth knowing before changing anything here: a site cannot turn notifications
// on for somebody. Notification.requestPermission() has to be called from a
// real user gesture, and the answer is theirs. It is also ONE SHOT — if they
// click Block, no code can ever ask again; they'd have to go into browser
// settings and undo it themselves. So the prompt is a scarce resource and gets
// spent on purpose, at a moment when the reason for it is obvious, never on a
// cold page load.
//
// What CAN happen automatically is the other half: somebody who has already
// granted permission but has no subscription stored — a new device, cleared
// site data, or a rotated VAPID key — gets resubscribed silently, with no
// prompt at all, because they already said yes once.

/** VAPID public keys are base64url; the push manager wants a Uint8Array. */
function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The server's VAPID public key, or null when push isn't configured at all. */
export async function vapidKey(): Promise<string | null> {
  return fetch("/api/push/vapid")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.key as string | null) ?? null)
    .catch(() => null);
}

async function store(sub: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  }).catch(() => null);
  if (!res?.ok) return false;
  const body = await res.json().catch(() => ({}));
  return body.ok !== false;
}

/**
 * Subscribe with the server's current key, replacing a subscription minted
 * against an older one.
 *
 * Rotating the VAPID key silently orphans every existing subscription: the
 * browser keeps it, the server can no longer send to it, and from the user's
 * side notifications simply stop with the toggle still reading "On". Comparing
 * the key the subscription was made with against the one the server is serving
 * is what catches that.
 */
async function subscribeWith(
  reg: ServiceWorkerRegistration,
  key: string,
): Promise<PushSubscription | null> {
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const madeWith = existing.options?.applicationServerKey;
    const same =
      madeWith &&
      btoa(String.fromCharCode(...new Uint8Array(madeWith)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "") === key;
    if (same) return existing;
    await existing.unsubscribe().catch(() => null); // stale key — start over
  }
  return reg.pushManager
    .subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) })
    .catch(() => null);
}

/**
 * Silently make sure an already-permitted browser is subscribed and stored.
 *
 * Prompts nobody: returns false the moment permission isn't already "granted".
 * Safe to call on every page load.
 */
export async function ensureSubscribed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const key = await vapidKey();
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return false;
  const sub = await subscribeWith(reg, key);
  return sub ? store(sub) : false;
}

export type AskResult = "on" | "denied" | "dismissed" | "unavailable";

/**
 * Ask, then subscribe. MUST be called from a user gesture — a click — or the
 * browser will refuse, and on some it counts as a denial.
 */
export async function askAndSubscribe(): Promise<AskResult> {
  if (!pushSupported()) return "unavailable";
  const key = await vapidKey();
  if (!key) return "unavailable";
  try {
    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm === "denied") return "denied";
    if (perm !== "granted") return "dismissed"; // closed it without deciding
    const reg = await navigator.serviceWorker.ready;
    const sub = await subscribeWith(reg, key);
    return sub && (await store(sub)) ? "on" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Turn it off: drop the row server-side, then unsubscribe locally. */
export async function unsubscribe(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
    method: "DELETE",
  }).catch(() => null);
  await sub.unsubscribe().catch(() => null);
}
