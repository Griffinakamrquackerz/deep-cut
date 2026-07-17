import type { MetadataRoute } from "next";

// PWA manifest — Next serves this at /manifest.webmanifest and links it
// automatically. Icons are rendered on the fly by /api/icon/[size].
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deep Cut",
    short_name: "Deep Cut",
    description: "Movies you haven't met yet.",
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#171210",
    theme_color: "#171210",
    icons: [
      { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/api/icon/512?maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
