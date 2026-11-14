import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bebas_Neue, IBM_Plex_Mono, Karla } from "next/font/google";
import PwaSetup from "@/components/PwaSetup";
import JsonLd from "@/components/JsonLd";
import { siteUrl } from "@/lib/site";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import "./globals.css";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});
const karla = Karla({ subsets: ["latin"], variable: "--font-karla" });

const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Deep Cut — an independent streaming house",
    template: "%s · Deep Cut",
  },
  description:
    "Watch independent shorts, discover films matched to your taste, and help fund the next feature.",
  applicationName: "Deep Cut",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Deep Cut",
  },
  openGraph: {
    type: "website",
    siteName: "Deep Cut",
    title: "Deep Cut — an independent streaming house",
    description:
      "Watch independent shorts, discover films matched to your taste, and help fund the next feature.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Deep Cut — an independent streaming house",
    description: "Independent shorts, hidden gems, and a film fund powered by members.",
  },
  // How AdSense confirms we own thedeepcut.xyz.
  //
  // One of Google's three accepted proofs (the others being the loader snippet
  // in <head> and an ads.txt line — /ads.txt serves that one from the same env
  // var, so two of the three are covered by setting it). This is the reliable
  // one here: `metadata` is rendered into the flushed document head on the
  // server, so it's in the very first bytes a crawler receives, before any
  // streaming or hydration. Absent entirely until the publisher id is set —
  // an empty content="" would be a claim to own nothing.
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export const viewport: Viewport = {
  themeColor: "#171210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // standalone mode: paint behind the iPhone notch
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${plexMono.variable} ${karla.variable}`}>
      <body className="min-h-dvh text-cream">
        {/*
          The ad loader. Mounted in the body on purpose: beforeInteractive would
          put it in the flushed <head> but fetch it at high priority on every
          page, paying for advertising with load time on a site that mostly
          isn't showing an ad yet.

          Site verification does NOT depend on this tag — it can't, since a
          crawler reading the initial HTML sees this arrive in the streamed
          payload rather than the head. That job belongs to the
          google-adsense-account meta tag in `metadata` above, which Next emits
          into the real head server-side.
        */}
        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <PwaSetup />
        {/* schema.org WebSite — tells Google the site's canonical name/home */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Deep Cut",
            alternateName: "The Deep Cut",
            url: SITE_URL,
            description:
              "Independent shorts, personalized movie recommendations, and a member-supported film fund.",
          }}
        />
        {/* Projected-film atmosphere — fixed, non-interactive overlays */}
        <div className="reel-beam" aria-hidden />
        <div className="reel-scratch" aria-hidden />
        <div className="reel-grain" aria-hidden />
        <div className="reel-vignette" aria-hidden />
        <div className="cue-mark" aria-hidden />
        <div className="relative z-10 mx-auto min-h-dvh w-full max-w-md sm:max-w-lg md:max-w-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
