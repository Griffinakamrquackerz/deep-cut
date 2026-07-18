import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bebas_Neue, IBM_Plex_Mono, Karla } from "next/font/google";
import PwaSetup from "@/components/PwaSetup";
import JsonLd from "@/components/JsonLd";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

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
    default: "Deep Cut — movies you haven't met yet",
    template: "%s · Deep Cut",
  },
  description:
    "An AI repertory theater. Tell it your taste, it deals you a movie you haven't met yet.",
  applicationName: "Deep Cut",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Deep Cut",
  },
  openGraph: {
    type: "website",
    siteName: "Deep Cut",
    title: "Deep Cut — movies you haven't met yet",
    description:
      "An AI repertory theater. Tell it your taste, it deals you a movie you haven't met yet.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Deep Cut — movies you haven't met yet",
    description: "An AI repertory theater for films you haven't met yet.",
  },
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
              "An AI repertory theater. Tell it your taste, it deals you a movie you haven't met yet.",
          }}
        />
        {/* Projected-film atmosphere — fixed, non-interactive overlays */}
        <div className="reel-grain" aria-hidden />
        <div className="reel-vignette" aria-hidden />
        <div className="relative z-10 mx-auto min-h-dvh w-full max-w-md sm:max-w-lg md:max-w-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
