"use client";
import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sfx";

export default function MuteToggle() {
  const [muted, setM] = useState(true);
  useEffect(() => setM(isMuted()), []);

  return (
    <button
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setM(next);
      }}
      aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
      className="fixed bottom-16 right-3 z-40 rounded-full border border-line bg-surface/90 px-2.5 py-1.5 text-sm backdrop-blur"
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
