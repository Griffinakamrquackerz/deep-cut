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
import TrailerPlayer from "@/components/TrailerPlayer";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <section className="flex flex-col gap-5">
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
          <TrailerPlayer videoKey={trailer.key} title={movie.title} />
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

      <AdSlot index={2} slot="movie-page" />

      <p className="font-mono text-[0.55rem] text-dim/70">
        Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </p>
    </section>
  );
}
