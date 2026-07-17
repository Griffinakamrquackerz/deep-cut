import type { Metadata, Viewport } from "next";
import { Bebas_Neue, IBM_Plex_Mono, Karla } from "next/font/google";
import PwaSetup from "@/components/PwaSetup";
import "./globals.css";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});
const karla = Karla({ subsets: ["latin"], variable: "--font-karla" });

export const metadata: Metadata = {
  title: "Deep Cut",
  description: "Movies you haven't met yet.",
  applicationName: "Deep Cut",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Deep Cut",
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
      <body className="min-h-dvh bg-bg text-cream">
        <PwaSetup />
        <div className="mx-auto min-h-dvh w-full max-w-md sm:max-w-lg md:max-w-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}
