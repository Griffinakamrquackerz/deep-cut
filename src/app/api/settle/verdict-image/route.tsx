import { ImageResponse } from "next/og";

// A shareable "SETTLED" card for a Settle It ruling, rendered from query params
// (no verdict is persisted, so the caller passes what to draw). Portrait so it
// drops cleanly into a story or an iMessage.
//
//   /api/settle/verdict-image?title=...&year=...&poster=/x.jpg&vibe=...
//     &conviction=4&mode=settled&p1=Sam&p2=Alex
export const maxDuration = 30;

const BG = "#171210";
const SURFACE = "#231B17";
const LINE = "#3B2E27";
const CREAM = "#F3E9D7";
const DIM = "#B7A491";
const AMBER = "#FFB454";
const TICKET = "#E4573D";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const title = (q.get("title") || "TONIGHT'S PICK").slice(0, 40);
  const year = q.get("year") || "";
  const poster = q.get("poster");
  const vibe = (q.get("vibe") || "").slice(0, 120);
  const conviction = Math.max(0, Math.min(5, Number(q.get("conviction")) || 0));
  const overruled = q.get("mode") === "overruled";
  const p1 = (q.get("p1") || "").slice(0, 16);
  const p2 = (q.get("p2") || "").slice(0, 16);
  const posterUrl = poster ? `https://image.tmdb.org/t/p/w500${poster}` : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, padding: 36, fontFamily: "sans-serif" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            height: "100%",
            background: SURFACE,
            border: `4px dashed ${LINE}`,
            borderRadius: 20,
            padding: 44,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", color: DIM, fontSize: 24, letterSpacing: 5 }}>
            <span>SETTLE IT</span>
            <span>⚖️ THE HOUSE RULES</span>
          </div>

          <div style={{ display: "flex", position: "relative", marginTop: 34 }}>
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={posterUrl}
                alt=""
                width={420}
                height={630}
                style={{ width: 420, height: 630, borderRadius: 12, objectFit: "cover", border: `3px solid ${LINE}` }}
              />
            ) : (
              <div style={{ width: 420, height: 630, borderRadius: 12, background: BG, border: `3px solid ${LINE}` }} />
            )}
            <div
              style={{
                position: "absolute",
                top: 28,
                right: -18,
                display: "flex",
                transform: "rotate(-11deg)",
                border: `6px solid ${overruled ? TICKET : AMBER}`,
                color: overruled ? TICKET : AMBER,
                fontSize: 52,
                fontWeight: 800,
                letterSpacing: 3,
                padding: "6px 20px",
                borderRadius: 10,
                background: "rgba(23,18,16,0.72)",
              }}
            >
              {overruled ? "OVERRULED" : "SETTLED"}
            </div>
          </div>

          <span style={{ color: AMBER, fontSize: 68, fontWeight: 800, marginTop: 34, textAlign: "center", lineHeight: 1.05 }}>
            {title.toUpperCase()}
          </span>
          {year ? <span style={{ color: DIM, fontSize: 32, marginTop: 4 }}>{year}</span> : null}
          {vibe ? (
            <span style={{ color: CREAM, fontSize: 30, marginTop: 18, textAlign: "center", lineHeight: 1.35, maxWidth: 720 }}>
              “{vibe}”
            </span>
          ) : null}

          <div style={{ display: "flex", flexGrow: 1 }} />

          {p1 && p2 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 22, color: DIM, fontSize: 30, letterSpacing: 2 }}>
              <span style={{ color: CREAM }}>{p1}</span>
              <span>vs</span>
              <span style={{ color: CREAM }}>{p2}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <span style={{ color: AMBER, fontSize: 34 }}>{"★".repeat(conviction)}</span>
            <span style={{ color: LINE, fontSize: 34 }}>{"★".repeat(5 - conviction)}</span>
          </div>
          <span style={{ color: DIM, fontSize: 24, letterSpacing: 4, marginTop: 18 }}>thedeepcut.xyz</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  );
}
