import Link from "next/link";
import ShrinePrints from "./ShrinePrints";
import ProfileTheme from "./ProfileTheme";

/**
 * The signature-film shrine: production stills scattered like photo prints
 * taped to a bedroom wall — overlapping, tilted, unmistakably THAT film.
 * Layout is seeded by the movie id, so each shrine has its own arrangement
 * but never shifts between visits. Pure CSS transforms; no client JS.
 */

interface Slot {
  left: string;
  top: string;
  width: string;
  rotate: number;
  z: number;
}

// Base arrangement for up to 6 prints — tuned to overlap without burying.
const SLOTS: Slot[] = [
  { left: "-5%", top: "12%", width: "40%", rotate: -8, z: 3 },
  { left: "24%", top: "-10%", width: "44%", rotate: 5, z: 2 },
  { left: "52%", top: "6%", width: "42%", rotate: -5, z: 4 },
  { left: "76%", top: "40%", width: "38%", rotate: 8, z: 2 },
  { left: "6%", top: "52%", width: "38%", rotate: 6, z: 5 },
  { left: "40%", top: "46%", width: "44%", rotate: -7, z: 6 },
];

/** Small deterministic jitter so two shrines never look identical. */
function jitter(seed: number, i: number, range: number): number {
  const h = (seed * 2654435761 + i * 40503) >>> 0;
  return (h % (range * 2 + 1)) - range;
}

export default function SignatureShrine({
  movieId,
  title,
  year,
  stills,
  posterPath,
  isMe = false,
  themeMusic = null,
}: {
  movieId: number;
  title: string;
  year: number | null;
  stills: string[];
  posterPath: string | null;
  isMe?: boolean;
  themeMusic?: { kind: "track" | "album"; id: string } | null;
}) {
  const prints = stills.slice(0, 6);
  const usePoster = prints.length < 2; // too few stills → single lobby card

  return (
    <div className="relative -mx-4">
      <div className="relative h-48 overflow-hidden bg-black/50">
        {usePoster ? (
          posterPath && (
            <div
              className="shrine-photo absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2"
              style={{ transform: `translate(-50%,-50%) rotate(${jitter(movieId, 1, 6)}deg)` }}
            >
              <span className="shrine-tape" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://image.tmdb.org/t/p/w342${posterPath}`}
                alt={`${title} poster`}
                loading="lazy"
                decoding="async"
                className="block w-full"
              />
            </div>
          )
        ) : (
          <ShrinePrints movieId={movieId} stills={stills} />
        )}

        {/* Legibility scrim + projector vignette, light enough to keep the wall loud. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.45)_100%)]"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />

        {/* The plaque */}
        <Link
          href={`/m/${movieId}`}
          className="absolute bottom-2 left-4 z-10 block rounded border border-amber/60 bg-bg/85 px-3 py-1.5 backdrop-blur-sm"
        >
          <span className="block font-mono text-[0.55rem] uppercase tracking-[0.25em] text-ticket">
            🎞 Signature film
          </span>
          <span className="font-display text-lg leading-tight text-amber">
            {title} <span className="font-mono text-[0.65rem] text-dim">{year ?? ""}</span>
          </span>
        </Link>
      </div>
      {/* Sprocket rails top & bottom — the shrine sits on a strip of film. */}
      <div className="film-strip" aria-hidden />

      {/* Theme music — the profile's soundtrack, played through Spotify's own
          licensed embed. Dark until Spotify keys are configured. */}
      <div className="px-4">
        <ProfileTheme
          movieId={movieId}
          filmTitle={title}
          posterPath={posterPath}
          isMe={isMe}
          override={themeMusic}
        />
      </div>
    </div>
  );
}
