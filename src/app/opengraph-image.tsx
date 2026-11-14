import { ImageResponse } from "next/og";

// The link preview for thedeepcut.xyz — what shows in iMessage, Slack, X, etc.
// A ticket-stub in the house palette so a shared link reads as the brand, not a
// bare URL. Next wires this in as og:image / twitter:image for the root route.
export const alt = "Deep Cut — find the films you've never seen. Fund the ones that don't exist yet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#171210";
const SURFACE = "#231B17";
const LINE = "#3B2E27";
const CREAM = "#F3E9D7";
const DIM = "#B7A491";
const AMBER = "#FFB454";
const TICKET = "#E4573D";
const LIGHT = "#FFF1D6";

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
            <span>DEEP CUT</span>
            <span>A DOUBLE FEATURE · ADMIT ONE</span>
          </div>

          {/* The front door's headline, as it reads on the wall. */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 70, fontWeight: 800, letterSpacing: 1, lineHeight: 1.02 }}>
              <span style={{ color: AMBER }}>FIND</span>
              <span style={{ color: LIGHT, marginLeft: 22 }}>THE FILMS YOU&apos;VE</span>
            </div>
            <span style={{ color: LIGHT, fontSize: 70, fontWeight: 800, letterSpacing: 1, lineHeight: 1.02 }}>
              NEVER SEEN.
            </span>
            <div style={{ display: "flex", fontSize: 70, fontWeight: 800, letterSpacing: 1, lineHeight: 1.02, marginTop: 10 }}>
              <span style={{ color: AMBER }}>FUND</span>
              <span style={{ color: LIGHT, marginLeft: 22 }}>THE ONES THAT</span>
            </div>
            <span style={{ color: LIGHT, fontSize: 70, fontWeight: 800, letterSpacing: 1, lineHeight: 1.02 }}>
              DON&apos;T EXIST YET.
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
              RECOMMENDATIONS · AN INDIE FILM FUND
            </span>
            <span style={{ color: DIM, fontSize: 26, letterSpacing: 3 }}>thedeepcut.xyz</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
