import webpush from "web-push";

/**
 * Web push, kept optional the same way premium is: if the VAPID keys aren't
 * configured the whole feature no-ops cleanly instead of erroring. That lets
 * the dev team wire real keys (and, for the iOS wrapper, APNs) later without
 * touching code — set three env vars and it lights up.
 *
 *   VAPID_PUBLIC_KEY   — base64url, also handed to the browser to subscribe
 *   VAPID_PRIVATE_KEY  — base64url, server-only
 *   VAPID_SUBJECT      — "mailto:hello@thedeepcut.xyz" (contact for push services)
 *
 * Generate a keypair once with:  npx web-push generate-vapid-keys
 */
export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let configured = false;
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@thedeepcut.xyz",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type SendResult = "sent" | "expired" | "failed" | "disabled";

/**
 * Deliver one notification. Returns "expired" when the subscription is gone
 * (404/410) so the caller can prune it, "disabled" when push isn't configured.
 */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<SendResult> {
  if (!ensureVapid()) return "disabled";
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return "sent";
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return "expired";
    return "failed";
  }
}

/**
 * Run tasks with a ceiling on how many are in flight at once.
 *
 * Push services are happy with concurrency and slow one at a time: a Friday
 * fan-out that awaits each send serially gets through fifty or so before the
 * function is killed, and the rest of the list simply never hears from you.
 * Unbounded Promise.all is the other failure — a thousand simultaneous
 * connections is its own kind of broken — so this sits between the two.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
