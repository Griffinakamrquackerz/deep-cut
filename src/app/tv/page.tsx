import type { Metadata } from "next";
import LateShow from "./LateShow";

export const metadata: Metadata = {
  title: "Deep Cut Theatre",
  description:
    "A television in the basement that only plays short films. Pick a channel, look around the room, and watch.",
};

// The programme itself is members-only (the API gates it), but the room renders
// for anyone — a signed-out visitor gets the basement and a way in rather than
// a 404. Same reasoning as the other games' pages.
//
// There used to be a lobby in front of this: a still of the room and a button
// that said "sit down". It was a click that bought nothing, and the still was
// drawn to a canvas before its photograph had loaded, so a first visit opened
// on a black box. You arrive in the chair now.
export default function TvPage() {
  return <LateShow />;
}
