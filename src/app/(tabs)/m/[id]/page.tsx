import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie, getMovieTrailer } from "@/lib/tmdb";
import { SERVICES, type Service } from "@/lib/services";
import Poster from "@/components/Poster";
import ServiceBadges from "@/components/ServiceBadges";
import RatingsBadges from "@/components/RatingsBadges";
import MovieActions from "./MovieActions";
import AdSlot from "@/components/AdSlot";
import { isPremium } from "@/lib/premium";
import TrailerPlayer from "@/components/TrailerPlayer";
import JsonLd from "@/components/JsonLd";
import CurtainReveal from "@/components/CurtainReveal";
import HotTakesWall from "@/components/HotTakesWall";
import { siteUrl } from "@/lib/site";

// SEO: every film page is public and crawlable with its own title, description,
// and poster card — free, compounding top-of-funnel discovery (the IMDb move).
// cacheMovie hits our DB cache, so the render call right after is cheap.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return {};
  const movie = await cacheMovie(tmdbId).catch(() => null);
  if (!movie) return {};

  const title = `${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
  const description = movie.overview
    ? `${movie.overview.slice(0, 150)}${movie.overview.length > 150 ? "…" : ""} Where to stream it, the trailer, and whether it's worth your night — the Deep Cut take.`
    : `Where to stream ${movie.title}, the trailer, and whether it's worth your night — the Deep Cut take.`;
  const poster = movie.poster_path
    ? [{ url: `https://image.tmdb.org/t/p/w500${movie.poster_path}`, width: 500, height: 750 }]
    : undefined;

  return {
    title,
    description,
    openGraph: { title: `${title} · Deep Cut`, description, images: poster },
    twitter: { card: "summary", title: `${title} · Deep Cut`, description },
  };
}

export default async function MoviePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trailer?: string }>;
}) {
  const { id } = await params;
  const { trailer: trailerParam } = await searchParams;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  const movie = await cacheMovie(tmdbId).catch(() => null);
  if (!movie) notFound();

  const user = await currentUser();
  const db = supabaseAdmin();
  const [reads, mine, trailer] = await Promise.all([
    db
      .from("external_reads")
      .select("id, title, url")
      .eq("movie_id", tmdbId)
      .order("created_at", { ascending: false })
      .limit(10),
    user
      ? db.from("user_services").select("service").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
    getMovieTrailer(tmdbId).catch(() => null), // best-effort — page works without one
  ]);

  const available = SERVICES.filter((s) => movie.providers[s]);
  const myServices = ((mine.data ?? []) as Array<{ service: string }>).map(
    (r) => r.service as Service,
  );

  // schema.org Movie — earns the rich result (poster, stars) on Google.
  const movieLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    url: `${siteUrl()}/m/${movie.id}`,
    ...(movie.year ? { dateCreated: String(movie.year) } : {}),
    ...(movie.poster_path
      ? { image: `https://image.tmdb.org/t/p/w500${movie.poster_path}` }
      : {}),
    ...(movie.overview ? { description: movie.overview } : {}),
    ...(movie.genres.length ? { genre: movie.genres } : {}),
    ...(movie.runtime ? { duration: `PT${movie.runtime}M` } : {}),
    ...(movie.imdb_id ? { sameAs: `https://www.imdb.com/title/${movie.imdb_id}/` } : {}),
    ...(movie.vote_average && movie.vote_count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: movie.vote_average,
            bestRating: 10,
            ratingCount: movie.vote_count,
          },
        }
      : {}),
  };

  return (
    <section className="flex flex-col gap-5">
      <JsonLd data={movieLd} />
      <CurtainReveal />
      <div className="flex gap-4">
        <div className="w-32 shrink-0">
          <Poster
            posterPath={movie.poster_path}
            title={movie.title}
            year={movie.year}
            genres={movie.genres}
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight text-cream">{movie.title}</h1>
          <p className="mt-1 font-mono text-xs text-dim">
            {movie.year ?? "—"}
            {movie.runtime ? ` · ${movie.runtime} min` : ""}
          </p>
          <p className="mt-1 font-mono text-[0.65rem] text-dim">{movie.genres.join(" · ")}</p>
          <RatingsBadges className="mt-2" ratings={movie.ratings} />
          <div className="mt-2">
            <ServiceBadges available={available} mine={myServices} />
          </div>
        </div>
      </div>

      {trailer && (
        <div>
          <p className="eyebrow mb-2">Trailer</p>
          <TrailerPlayer videoKey={trailer.key} title={movie.title} autoplay={trailerParam === "1"} />
        </div>
      )}

      <p className="text-sm leading-relaxed text-cream/90">{movie.overview}</p>

      {user && <MovieActions movieId={movie.id} title={movie.title} />}

      <div>
        <p className="eyebrow mb-2">External reads</p>
        {(reads.data ?? []).length === 0 ? (
          <p className="text-sm text-dim">No articles linked yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(reads.data ?? []).map((r) => (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-amber underline"
                >
                  {r.title} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The wall, scoped to this film — takes are content, visible to all */}
      <div>
        <p className="eyebrow mb-2 text-ticket">🔥 Hot takes</p>
        <HotTakesWall movieId={movie.id} movieTitle={movie.title} signedIn={!!user} />
      </div>

      {!(user && (await isPremium(user.id))) && <AdSlot index={2} slot="movie-page" />}

      <p className="font-mono text-[0.55rem] text-dim/70">
        Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </p>
    </section>
  );
}
