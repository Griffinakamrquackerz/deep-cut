import type { Metadata } from "next";
import Theatre from "./Theatre";

export const metadata: Metadata = {
  title: "Deep Cut Theatre",
  description:
    "A television in the basement that only plays short films. Step through the basement, look at anything that deserves a story, sit in the recliner, and watch.",
};

// The programme itself is members-only (the API gates it), but the room renders
// for anyone — a signed-out visitor gets the basement, the pitch and a way in
// rather than a 404. Same reasoning as the other games' pages.
export default function TvPage() {
  return <Theatre />;
}
