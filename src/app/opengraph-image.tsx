import { ImageResponse } from "next/og";

// The link preview for thedeepcut.xyz — what shows in iMessage, Slack, X, etc.
// A ticket-stub in the house palette so a shared link reads as the brand, not a
// bare URL. Next wires this in as og:image / twitter:image for the root route.
export const alt = "Deep Cut — movies you haven't seen yet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#171210";
const SURFACE = "#231B17";
const LINE = "#3B2E27";
const CREAM = "#F3E9D7";
const DIM = "#B7A491";
const AMBER = "#FFB454";
const TICKET = "#E4573D";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: BG,
          padding: 40,
          fontFamily: "sans-serif",
        }}
      >
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
            padding: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: DIM,
              fontSize: 26,
              letterSpacing: 6,
            }}
          >
            <span>ADMIT ONE</span>
            <span>NO. 001</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: AMBER, fontSize: 150, fontWeight: 800, letterSpacing: 3, lineHeight: 1 }}>
              DEEP CUT
            </span>
            <span style={{ color: CREAM, fontSize: 46, marginTop: 18 }}>
              Movies you haven&apos;t seen yet.
            </span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `2px dashed ${LINE}`,
              paddingTop: 26,
            }}
          >
            <span style={{ color: TICKET, fontSize: 28, letterSpacing: 4 }}>
              INDEPENDENT CINEMA · HIDDEN GEMS
            </span>
            <span style={{ color: DIM, fontSize: 26, letterSpacing: 3 }}>thedeepcut.xyz</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
