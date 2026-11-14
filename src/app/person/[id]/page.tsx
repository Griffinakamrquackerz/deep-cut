import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPerson } from "@/lib/tmdb";
import Poster from "@/components/Poster";
import ShowMore from "@/components/ShowMore";

// An actor/director page: bio + their films, best-known first. Public and
// crawlable like a movie page — the same compounding-discovery move, and the
// other half of "tap anyone on a film page and see their work."

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) return {};
  const person = await getPerson(personId).catch(() => null);
  if (!person) return {};
  const known = person.knownFor ? `${person.knownFor} · ` : "";
  return {
    title: `${person.name} — Deep Cut`,
    description:
      person.biography.slice(0, 155) ||
      `${known}${person.films.length} films on Deep Cut.`,
    openGraph: person.profilePath
      ? { images: [`https://image.tmdb.org/t/p/w342${person.profilePath}`] }
      : undefined,
  };
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) notFound();
  const person = await getPerson(personId).catch(() => null);
  if (!person) notFound();

  const born = [
    person.birthday ? new Date(person.birthday).getFullYear() : null,
    person.placeOfBirth,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex flex-col gap-5 px-5 py-8">
      <header className="flex gap-4">
        {person.profilePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
            alt={person.name}
            className="h-36 w-24 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded border border-line bg-surface font-display text-5xl text-dim">
            {person.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          {person.knownFor && <p className="eyebrow">{person.knownFor}</p>}
          <h1 className="title-card rack-in text-4xl leading-tight">{person.name}</h1>
          {born && <p className="mt-1 font-mono text-[0.65rem] text-dim">{born}</p>}
          <p className="mt-1 font-mono text-[0.65rem] text-dim">{person.films.length} films</p>
        </div>
      </header>

      {person.biography && (
        <section>
          <p className="eyebrow mb-1.5">Bio</p>
          {/* Bios run long; reveal the rest on demand rather than a wall of text. */}
          <ShowMore initial={1} step={20} label="Read more" wrapperClassName="flex flex-col gap-2">
            {person.biography.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-dim">
                {para}
              </p>
            ))}
          </ShowMore>
        </section>
      )}

      {person.films.length > 0 && (
        <section>
          <p className="eyebrow mb-2">Filmography</p>
          <ShowMore initial={12} step={18} wrapperClassName="grid grid-cols-3 gap-2.5">
            {person.films.map((f) => (
              <Link key={f.id} href={`/m/${f.id}`} className="block">
                <Poster posterPath={f.poster_path} title={f.title} year={f.year} className="w-full rounded" />
                <p className="mt-1 truncate font-mono text-[0.6rem] font-bold text-cream">{f.title}</p>
                {f.role && (
                  <p className="truncate font-mono text-[0.55rem] text-dim">{f.role}</p>
                )}
              </Link>
            ))}
          </ShowMore>
        </section>
      )}

      <Link
        href="/"
        className="text-center font-mono text-[0.65rem] uppercase tracking-widest text-dim underline"
      >
        ← Back to the theater
      </Link>
    </main>
  );
}
