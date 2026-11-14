import Link from "next/link";
import Poster from "@/components/Poster";
import { getFeaturedFilms } from "@/lib/featured-films";

export default async function FeaturedReel() {
  const films = await getFeaturedFilms();

  return (
    <div className="landing-film-reel mt-5" aria-label="Featured films">
      {films.map((film) => (
        <details key={`${film.title}-${film.year}`} className="landing-film">
          <summary className="landing-film-summary">
            <span className="landing-film-poster">
              <Poster posterPath={film.posterPath} title={film.title} year={film.year} />
              <span className="landing-film-stamp">House pick</span>
            </span>
            <span className="mt-3 block font-display text-xl leading-tight text-cream">{film.title}</span>
            <span className="mt-1 block font-mono text-[0.6rem] uppercase tracking-wider text-dim">
              {film.year} · View details
            </span>
          </summary>
          <div className="landing-film-info">
            <p>{film.description}</p>
            {film.id ? (
              <Link href={`/m/${film.id}`} className="landing-text-link mt-3 inline-block">
                More film info <span aria-hidden>↗</span>
              </Link>
            ) : (
              <p className="mt-3 text-xs text-dim">Full film info is temporarily unavailable.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
