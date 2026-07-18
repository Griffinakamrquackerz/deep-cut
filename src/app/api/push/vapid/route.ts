import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

// The browser needs the VAPID public key to create a subscription. Served from
// an endpoint (not baked at build) so the dev team can set the key in env and
// have it take effect on the next request — no rebuild. Returns { key: null }
// when push isn't configured, which the client reads as "notifications off".
export async function GET() {
  return NextResponse.json({ key: vapidPublicKey() });
}
