"use client";

// Tail leader.
//
// Every reel ends on a few punched frames and a note to whoever threads it
// next. At the foot of every screen in the app, it's also the way back to the
// top — which is what "rewind" was always for.

export default function ReelEnd() {
  return (
    <button
      type="button"
      className="reel-end"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to the top"
    >
      <span className="reel-end-marks" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>End of reel</span>
      <b>Be kind · rewind ↑</b>
    </button>
  );
}
