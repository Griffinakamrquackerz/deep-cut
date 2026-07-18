import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Crawlers welcome on the public surface; keep them out of the API, auth
// plumbing, the admin booth, and per-user pages that need a session anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/auth/", "/settings", "/welcome"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
