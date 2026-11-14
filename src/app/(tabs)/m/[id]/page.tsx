import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie, getMovieCredits, getMovieTrailer } from "@/lib/tmdb";
import { SERVICES, type Service } from "@/lib/services";
import Poster from "@/components/Poster";
import ServiceBadges from "@/components/ServiceBadges";
import RatingsBadges from "@/components/RatingsBadges";
import MovieActions from "./MovieActions";
import ShareFilm from "@/components/ShareFilm";
import AdSlot from "@/components/AdSlot";
import ExternalReads from "@/components/ExternalReads";
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
  const [reads, mine, trailer, credits] = await Promise.all([
    db
      // user_id so the page can tell whose link it is. It is NOT sent to the
      // client — it becomes a `mine` boolean below, because the page has no
      // business publishing member ids next to their links.
      .from("external_reads")
      .select("id, title, url, user_id")
      .eq("movie_id", tmdbId)
      .order("created_at", { ascending: false })
      .limit(10),
    user
      ? db.from("user_services").select("service").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
    getMovieTrailer(tmdbId).catch(() => null), // best-effort — page works without one
    getMovieCredits(tmdbId).catch(() => ({ cast: [], crew: [] })),
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
          <h1 className="title-card rack-in text-3xl leading-tight">{movie.title}</h1>
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

      {credits.crew.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Crew</p>
          <ul className="flex flex-col gap-1">
            {credits.crew.map((c) => (
              <li key={`${c.id}-${c.job}`} className="text-sm text-cream">
                <span className="font-mono text-[0.6rem] uppercase tracking-wider text-dim">{c.job}</span>{" "}
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {credits.cast.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Cast</p>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {credits.cast.map((c) => (
              <li key={c.id} className="w-20 shrink-0">
                <Link href={`/person/${c.id}`} className="block">
                  {c.profilePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w185${c.profilePath}`}
                      alt={c.name}
                      className="h-28 w-20 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-20 items-center justify-center rounded border border-line bg-surface font-display text-3xl text-dim">
                      {c.name.charAt(0)}
                    </div>
                  )}
                  <p className="mt-1 font-mono text-[0.65rem] font-bold leading-tight text-cream">
                    {c.name}
                  </p>
                  {c.character && (
                    <p className="font-mono text-[0.55rem] leading-tight text-dim">{c.character}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {credits.crew.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Crew</p>
          <ul className="flex flex-col gap-1">
            {credits.crew.map((c) => (
              <li key={`${c.id}-${c.job}`} className="font-mono text-[0.7rem] text-dim">
                {c.job} —{" "}
                <Link href={`/person/${c.id}`} className="text-amber underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {user && <MovieActions movieId={movie.id} title={movie.title} />}

      {/* Passing it on. The share sheet works signed out too — the page is
          public, so a link to it is a real thing to send somebody. */}
      <ShareFilm movieId={movie.id} title={movie.title} signedIn={!!user} />

      <ExternalReads
        signedIn={!!user}
        reads={(reads.data ?? []).map((r) => ({
          id: r.id as string,
          title: r.title as string,
          url: r.url as string,
          // Resolved here so no member id crosses to the client.
          mine: !!user && r.user_id === user.id,
        }))}
      />

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
