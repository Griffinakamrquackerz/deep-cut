import { NextResponse } from "next/server";
import { getPerson } from "@/lib/tmdb";

// Actor/director page — TMDB person details + their filmography, best-known
// first. Public (no auth): a person page is content, like a movie page.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId) || personId <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  const person = await getPerson(personId).catch(() => null);
  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(person);
}
