import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeTasteStats } from "@/lib/rank";

// Link preview for a shared profile — a member card in the house palette, so
// "@so-and-so on Deep Cut" arrives as a ticket stub, not a bare URL.
export const alt = "A Deep Cut member card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#171210";
const SURFACE = "#231B17";
const LINE = "#3B2E27";
const CREAM = "#F3E9D7";
const DIM = "#B7A491";
const AMBER = "#FFB454";
const TICKET = "#E4573D";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProfileOgImage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = supabaseAdmin();

  const byId = UUID_RE.test(key);
  const q = db.from("users").select("id, handle, display_name, avatar_url");
  const { data: person } = await (byId
    ? q.eq("id", key).maybeSingle()
    : q.eq("handle", key.toLowerCase()).maybeSingle());

  // Fall back to the brand card if the handle doesn't resolve.
  if (!person) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
            fontFamily: "sans-serif",
          }}
        >
          <span style={{ color: AMBER, fontSize: 130, fontWeight: 800, letterSpacing: 3 }}>
            DEEP CUT
          </span>
        </div>
      ),
      size,
    );
  }

  const [{ data: profile }, { count: lovedCount }, { count: followerCount }, loved, watches] =
    await Promise.all([
      db.from("taste_profiles").select("threads").eq("user_id", person.id).maybeSingle(),
      db.from("loved_movies").select("movie_id", { count: "exact", head: true }).eq("user_id", person.id),
      db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", person.id),
      db.from("loved_movies").select("movies(id, vote_count)").eq("user_id", person.id).limit(200),
      db.from("watch_logs").select("movies(id, vote_count)").eq("user_id", person.id).limit(200),
    ]);

  const votes = [...(loved.data ?? []), ...(watches.data ?? [])]
    .map((r) => r.movies as unknown as { id: number; vote_count: number | null } | null)
    .filter((m): m is { id: number; vote_count: number | null } => !!m);
  const stats = computeTasteStats(votes);

  const name = person.display_name ?? (person.handle ? `@${person.handle}` : "A film person");
  const threads = (profile?.threads ?? []) as Array<{ title: string; line: string }>;
  const topThread = threads[0] ?? null;
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, padding: 40, fontFamily: "sans-serif" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            background: SURFACE,
            border: `4px dashed ${LINE}`,
            borderRadius: 20,
            padding: 52,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: DIM, fontSize: 24, letterSpacing: 6 }}>
            <span>MEMBER CARD</span>
            <span>DEEP CUT</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatar_url}
                alt=""
                width={168}
                height={168}
                style={{ width: 168, height: 168, borderRadius: 84, objectFit: "cover", border: `4px solid ${AMBER}` }}
              />
            ) : (
              <div
                style={{
                  width: 168,
                  height: 168,
                  borderRadius: 84,
                  border: `4px solid ${AMBER}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: AMBER,
                  fontSize: 68,
                  fontWeight: 800,
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: AMBER, fontSize: 76, fontWeight: 800, lineHeight: 1 }}>
                {name.toUpperCase().slice(0, 20)}
              </span>
              <span style={{ color: DIM, fontSize: 30, marginTop: 12 }}>
                {stats.rank.glyph} {stats.rank.title} · {followerCount ?? 0} followers
              </span>
            </div>
          </div>

          {topThread ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: TICKET, fontSize: 26, letterSpacing: 3, textTransform: "uppercase" }}>
                {topThread.title}
              </span>
              <span style={{ color: CREAM, fontSize: 40, marginTop: 8, lineHeight: 1.25 }}>
                {topThread.line.slice(0, 90)}
              </span>
            </div>
          ) : (
            <span style={{ color: CREAM, fontSize: 40 }}>Dealing themselves films they haven&apos;t met yet.</span>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `2px dashed ${LINE}`,
              paddingTop: 24,
              color: DIM,
              fontSize: 26,
              letterSpacing: 3,
            }}
          >
            <span>{lovedCount ?? 0} FILMS LOVED</span>
            <span>{stats.deepCuts} DEEP CUTS</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
