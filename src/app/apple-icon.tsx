import { ImageResponse } from "next/og";

// iOS home-screen icon (Next serves this as apple-touch-icon automatically).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#171210",
        }}
      >
        <span style={{ color: "#FFB454", fontSize: 72, fontWeight: 800, letterSpacing: 2 }}>
          DC
        </span>
        <span style={{ color: "#E4573D", fontSize: 15, letterSpacing: 3, marginTop: 4 }}>
          ADMIT ONE
        </span>
      </div>
    ),
    size,
  );
}
