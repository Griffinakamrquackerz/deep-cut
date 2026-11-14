"use client";
import { useState } from "react";
import Basement from "./Basement";
import LateShow from "./LateShow";

/**
 * Deep Cut Theatre has two rooms and one route.
 *
 * The basement is the lobby: a top-down floor plan you walk around, where every
 * object on the walls has a story and the recliner is a door. Sitting down
 * hands you to the chair's-eye room, which is where the films play — and that
 * room is LateShow, unchanged, so everything already proven about it (the
 * look-around, the console, the fullscreen fix) is exactly what you get.
 */
export default function Theatre() {
  const [seated, setSeated] = useState(false);

  if (!seated) return <Basement onSit={() => setSeated(true)} />;

  return (
    <>
      <LateShow />
      <button
        type="button"
        onClick={() => setSeated(false)}
        className="fixed bottom-4 right-4 z-30 rounded-full border border-line bg-[#040810]/85 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber backdrop-blur"
      >
        ⏏ Stand up · back to the basement
      </button>
    </>
  );
}
