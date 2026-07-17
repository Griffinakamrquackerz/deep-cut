import { ImageResponse } from "next/og";

// App icons rendered in the ticket-stub aesthetic — no binary assets to manage.
// /api/icon/512, /api/icon/192, /api/icon/512?maskable=1 (safe-zone padded).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: sizeParam } = await params;
  const size = Math.min(1024, Math.max(48, Number(sizeParam) || 512));
  const maskable = new URL(request.url).searchParams.has("maskable");
  // Maskable icons get cropped to a circle/squircle — keep art in the safe zone.
  const inner = maskable ? 0.68 : 0.88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171210",
        }}
      >
        <div
          style={{
            width: `${inner * 100}%`,
            height: `${inner * 100}%`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#231B17",
            border: `${Math.max(2, size * 0.018)}px dashed #3B2E27`,
            borderRadius: size * 0.07,
          }}
        >
          <span
            style={{
              color: "#FFB454",
              fontSize: size * 0.34,
              fontWeight: 800,
              letterSpacing: size * 0.012,
            }}
          >
            DC
          </span>
          <span
            style={{
              color: "#E4573D",
              fontSize: size * 0.075,
              letterSpacing: size * 0.02,
              marginTop: size * 0.01,
            }}
          >
            ADMIT ONE
          </span>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
