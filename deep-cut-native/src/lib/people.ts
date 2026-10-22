import { api } from "./api";

// Reading /api/people, which answers in two shapes — mirror of
// ../src/lib/people.ts.
//
// With a ?q= it returns { results }. Without one it returns the two halves of
// your address book separately — { following, followers } — because the People
// view draws them as two lists. Anywhere you're picking a person to hand
// something to, that split is noise: you want everyone you know, once.
//
// Followers come first when there's no query. If you're tagging or sending
// without having typed a name, it's usually to somebody who came to you.

export interface Person {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface PeopleResponse {
  results?: Person[];
  followers?: Person[];
  following?: Person[];
}

export function peopleFrom(data: PeopleResponse | null): Person[] {
  if (!data) return [];
  if (data.results) return data.results;

  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of [...(data.followers ?? []), ...(data.following ?? [])]) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Everyone you could hand something to, best-effort — never throws. */
export async function fetchPeople(query?: string): Promise<Person[]> {
  const path = query?.trim()
    ? `/api/people?q=${encodeURIComponent(query.trim())}`
    : "/api/people";
  const res = await api<PeopleResponse>(path);
  return res.ok ? peopleFrom(res.data) : [];
}
