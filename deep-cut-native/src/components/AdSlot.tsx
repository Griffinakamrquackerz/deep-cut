import { router } from "expo-router";
import React from "react";
import { useAuth } from "@/app/_layout";
import { Snipe } from "./house";

// The ad slot — native port of ../src/components/AdSlot.tsx.
//
// Right now every one of these draws a "house ad": a themed card pointing at
// one of the app's own loops. That is deliberate rather than a placeholder.
// The placements, the spacing and the membership check are the part that has to
// be right, and they can all be got right — and looked at on a real phone —
// before an ad network is involved. When AdMob exists, this component is the
// only file that changes.
//
// It cannot show an ad to a member. That check lives HERE rather than at each
// call site because the web app learned it the hard way: three of four
// placements remembered and the fourth didn't, so people who had paid to
// remove advertising saw it on the one screen built for leaning back.

// Kept word-for-word identical to the web house ads. Plain sentences on
// purpose — see the note in ../src/components/AdSlot.tsx.
const HOUSE_ADS = [
  {
    eyebrow: "Intermission",
    title: "MAKE SOMEONE A MIXTAPE",
    line: "Put a few films in a list and send it to a friend.",
    href: "/(tabs)/mixtapes",
    cta: "Make one",
  },
  {
    eyebrow: "Intermission",
    title: "YOUR TASTE CARD",
    line: "See what everything you've rated adds up to.",
    href: "/(tabs)/you",
    cta: "See yours",
  },
  {
    eyebrow: "Intermission",
    title: "GO DEEPER",
    line: "Turn the obscurity dial up. There's a lot further down to go.",
    href: "/(tabs)/tonight",
    cta: "Deal me more",
  },
] as const;

export default function AdSlot({
  index = 0,
  style,
}: {
  /** Stable index so different placements rotate different house ads. */
  index?: number;
  style?: object;
}) {
  const { premium } = useAuth();
  if (premium) return null;

  const ad = HOUSE_ADS[index % HOUSE_ADS.length];

  // The drive-in intermission reel: a clock counting down to showtime and a
  // suggestion about what to do with the ten minutes.
  return (
    <Snipe
      style={style}
      kicker={ad.eyebrow}
      title={ad.title}
      line={ad.line}
      cta={ad.cta}
      onPress={() => router.push(ad.href as never)}
    />
  );
}
