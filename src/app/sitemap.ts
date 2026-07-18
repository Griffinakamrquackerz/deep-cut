import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site";

// Crawlable surface: the landing page, the public modes, every cached film
// page, and member profiles with handles. Regenerates on each crawl (Next
// serves this at /sitemap.xml).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const statics: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/settle`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/roll`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];

  // Best-effort: a DB hiccup should degrade to the static list, never a 500.
  let movies: MetadataRoute.Sitemap = [];
  let profiles: MetadataRoute.Sitemap = [];
  try {
    const db = supabaseAdmin();
    const [{ data: films }, { data: people }] = await Promise.all([
      db.from("movies").select("id").order("popularity", { ascending: false }).limit(5000),
      db.from("users").select("handle").not("handle", "is", null).limit(1000),
    ]);
    movies = (films ?? []).map((m) => ({
      url: `${base}/m/${m.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
    profiles = (people ?? []).map((p) => ({
      url: `${base}/u/${p.handle}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    }));
  } catch {
    // fall through with statics only
  }

  return [...statics, ...movies, ...profiles];
}
