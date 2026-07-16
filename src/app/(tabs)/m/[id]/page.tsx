import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie } from "@/lib/tmdb";
import { SERVICES, type Service } from "@/lib/services";
import Poster from "@/components/Poster";
import ServiceBadges from "@/components/ServiceBadges";
import RatingsBadges from "@/components/RatingsBadges";
import MovieActions from "./MovieActions";

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound();

  const movie = await cacheMovie(tmdbId).catch(() => null);
  if (!movie) notFound();

  const user = await currentUser();
  const db = supabaseAdmin();
  const [takes, reads, mine] = await Promise.all([
    db
      .from("takes")
      .select("id, body, created_at, users(id, handle, display_name)")
      .eq("movie_id", tmdbId)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("external_reads")
      .select("id, title, url")
      .eq("movie_id", tmdbId)
      .order("created_at", { ascending: false })
      .limit(10),
    user
      ? db.from("user_services").select("service").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
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

      <p className="text-sm leading-relaxed text-cream/90">{movie.overview}</p>

      {user && <MovieActions movieId={movie.id} title={movie.title} />}

      <div>
        <p className="eyebrow mb-2">Takes on this film</p>
        {(takes.data ?? []).length === 0 ? (
          <p className="text-sm text-dim">No takes yet. Be the first voice in the lobby.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(takes.data ?? []).map((t) => {
              const author = t.users as unknown as {
                handle: string | null;
                display_name: string | null;
              } | null;
              return (
                <li key={t.id} className="rounded border border-line bg-surface p-3">
                  <p className="font-mono text-[0.65rem] text-amber">
                    {author?.handle ? `@${author.handle}` : (author?.display_name ?? "someone")}
                  </p>
                  <p className="mt-1 text-sm text-cream">{t.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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

      <p className="font-mono text-[0.55rem] text-dim/70">
        Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is not
        endorsed or certified by TMDB.
      </p>
    </section>
  );
}
