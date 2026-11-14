// The Lobby feed is derived — a query over playlist + watch activity of
// followed users, merged and sorted. No feed table for MVP.

export interface FeedActor {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

export interface FeedMovie {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  tmdb: number | null;
  imdb: number | null;
  rt: number | null;
}

export type FeedItem =
  | {
      kind: "watch";
      id: string;
      at: string;
      actor: FeedActor;
      movie: FeedMovie;
      reaction: string;
      why: string | null;
      note: string | null;
    }
  | {
      /**
       * What somebody is putting on tonight. A plan rather than a log: it
       * appears before the film is watched, and goes stale on its own.
       */
      kind: "tonight";
      id: string;
      at: string;
      actor: FeedActor;
      movie: FeedMovie;
      note: string | null;
    }
  | {
      kind: "playlist";
      id: string;
      at: string;
      actor: FeedActor;
      name: string;
      filmCount: number;
      shareSlug: string;
    };

/** Merge activity streams newest-first, capped. */
export function mergeFeed(items: FeedItem[], limit = 50): FeedItem[] {
  return items
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

export function actorName(a: FeedActor): string {
  return a.handle ? `@${a.handle}` : (a.display_name ?? "someone");
}
