import { ImageResponse } from "next/og";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics";

export const maxDuration = 30;

const BG = "#171210";
const SURFACE = "#231B17";
const LINE = "#3B2E27";
const CREAM = "#F3E9D7";
const DIM = "#B7A491";
const AMBER = "#FFB454";
const TICKET = "#E4573D";

/** Shareable ticket-stub taste card, rendered server-side as a PNG. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const db = supabaseAdmin();
  const [{ data: profile }, { data: me }, { count: lovedCount }] = await Promise.all([
    db.from("taste_profiles").select("threads, version").eq("user_id", user.id).maybeSingle(),
    db.from("users").select("handle, display_name").eq("id", user.id).maybeSingle(),
    db
      .from("loved_movies")
      .select("movie_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const threads = (profile?.threads ?? []) as Array<{ title: string; line: string }>;
  if (threads.length === 0) return new Response("no profile yet", { status: 404 });

  const name = me?.handle ? `@${me.handle}` : (me?.display_name ?? "a deep cutter");
  const serial = String(profile?.version ?? 1).padStart(3, "0");

  await track(user.id, "taste_card_shared", { version: profile?.version ?? 1 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            background: SURFACE,
            border: `4px dashed ${LINE}`,
            borderRadius: 16,
            padding: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: DIM,
              fontSize: 22,
              letterSpacing: 4,
            }}
          >
            <span>ADMIT ONE</span>
            <span>TASTE PROFILE №{serial}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 40,
            }}
          >
            <span style={{ color: AMBER, fontSize: 88, fontWeight: 800, letterSpacing: 2 }}>
              DEEP CUT
            </span>
            <span style={{ color: CREAM, fontSize: 30, marginTop: 4 }}>
              the taste of {name}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 48,
              gap: 36,
              flexGrow: 1,
            }}
          >
            {threads.slice(0, 5).map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    color: TICKET,
                    fontSize: 26,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  {String(i + 1).padStart(2, "0")} · {t.title}
                </span>
                <span style={{ color: CREAM, fontSize: 32, marginTop: 6, lineHeight: 1.3 }}>
                  {t.line}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `2px dashed ${LINE}`,
              paddingTop: 28,
              color: DIM,
              fontSize: 22,
              letterSpacing: 3,
            }}
          >
            <span>{lovedCount ?? 0} FILMS LOVED</span>
            <span>MOVIES YOU HAVEN&apos;T SEEN YET</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1620 },
  );
}
