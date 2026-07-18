import { NextResponse } from "next/server";

// Deploy marker — bump BUILD when shipping a fix so the live version is
// verifiable from outside (no more guessing whether a deploy has landed).
const BUILD = "mixtape-privacy-v54";

export async function GET() {
  return NextResponse.json({ build: BUILD });
}
