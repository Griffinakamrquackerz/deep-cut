// Curated 40-film starter grid for onboarding — spread across genres and eras.
// IDs are TMDB ids; title/year are for typographic fallback cards before the
// TMDB cache warms. Metadata is always re-fetched from TMDB by id.

export interface StarterFilm {
  tmdbId: number;
  title: string;
  year: number;
}

export const STARTER_GRID: StarterFilm[] = [
  { tmdbId: 289, title: "Casablanca", year: 1942 },
  { tmdbId: 539, title: "Psycho", year: 1960 },
  { tmdbId: 935, title: "Dr. Strangelove", year: 1964 },
  { tmdbId: 429, title: "The Good, the Bad and the Ugly", year: 1966 },
  { tmdbId: 238, title: "The Godfather", year: 1972 },
  { tmdbId: 11, title: "Star Wars", year: 1977 },
  { tmdbId: 694, title: "The Shining", year: 1980 },
  { tmdbId: 78, title: "Blade Runner", year: 1982 },
  { tmdbId: 601, title: "E.T. the Extra-Terrestrial", year: 1982 },
  { tmdbId: 105, title: "Back to the Future", year: 1985 },
  { tmdbId: 9377, title: "Ferris Bueller's Day Off", year: 1986 },
  { tmdbId: 2493, title: "The Princess Bride", year: 1987 },
  { tmdbId: 274, title: "The Silence of the Lambs", year: 1991 },
  { tmdbId: 500, title: "Reservoir Dogs", year: 1992 },
  { tmdbId: 680, title: "Pulp Fiction", year: 1994 },
  { tmdbId: 278, title: "The Shawshank Redemption", year: 1994 },
  { tmdbId: 862, title: "Toy Story", year: 1995 },
  { tmdbId: 807, title: "Se7en", year: 1995 },
  { tmdbId: 19404, title: "Dilwale Dulhania Le Jayenge", year: 1995 },
  { tmdbId: 550, title: "Fight Club", year: 1999 },
  { tmdbId: 603, title: "The Matrix", year: 1999 },
  { tmdbId: 77, title: "Memento", year: 2000 },
  { tmdbId: 129, title: "Spirited Away", year: 2001 },
  { tmdbId: 194, title: "Amélie", year: 2001 },
  { tmdbId: 141, title: "Donnie Darko", year: 2001 },
  { tmdbId: 4935, title: "Howl's Moving Castle", year: 2004 },
  { tmdbId: 155, title: "The Dark Knight", year: 2008 },
  { tmdbId: 8321, title: "In Bruges", year: 2008 },
  { tmdbId: 27205, title: "Inception", year: 2010 },
  { tmdbId: 68718, title: "Django Unchained", year: 2012 },
  { tmdbId: 106646, title: "The Wolf of Wall Street", year: 2013 },
  { tmdbId: 120467, title: "The Grand Budapest Hotel", year: 2014 },
  { tmdbId: 76341, title: "Mad Max: Fury Road", year: 2015 },
  { tmdbId: 313369, title: "La La Land", year: 2016 },
  { tmdbId: 419430, title: "Get Out", year: 2017 },
  { tmdbId: 391713, title: "Lady Bird", year: 2017 },
  { tmdbId: 335984, title: "Blade Runner 2049", year: 2017 },
  { tmdbId: 324857, title: "Spider-Man: Into the Spider-Verse", year: 2018 },
  { tmdbId: 496243, title: "Parasite", year: 2019 },
  { tmdbId: 546554, title: "Knives Out", year: 2019 },
];
