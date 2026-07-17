// AdSense requires /ads.txt at the domain root. Generated from the same env
// var that turns on the ad units, so there's nothing to keep in sync.
export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // ca-pub-XXXXXXXXXXXXXXXX
  const pub = client?.replace(/^ca-/, "");
  if (!pub) return new Response("not configured", { status: 404 });
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain" },
  });
}
