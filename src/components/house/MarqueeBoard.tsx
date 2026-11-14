"use client";
import { useEffect, useState } from "react";

// The marquee over the door.
//
// A backlit letterboard: black letters hung on tracks, set by hand, so none
// of them is quite straight. The words in `red` go up in red — a theatre with
// two colours of letter uses the second one for the part that matters.
//
// It carries tonight's date, because a marquee that never changes is a sign,
// and the point of this one is that it's a different night every time you
// walk up. The date is set after mount: the server doesn't know what day it
// is where you are, and guessing would mismatch on hydration.

/** A few degrees and a pixel or so of error per letter, the same every render. */
function hang(i: number): React.CSSProperties {
  return {
    "--r": `${(((i * 37) % 7) - 3) * 0.45}deg`,
    "--y": `${(((i * 53) % 5) - 2) * 0.45}px`,
  } as React.CSSProperties;
}

export default function MarqueeBoard({
  title,
  red = "",
  label = "Tonight",
}: {
  title: string;
  /** Words of the title to set in red, space-separated. */
  red?: string;
  label?: string;
}) {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(
      new Date()
        .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        .replace(",", " ·"),
    );
  }, []);

  const reds = new Set(red.toLowerCase().split(/\s+/).filter(Boolean));
  let n = 0;
  return (
    <header className="mq program-header">
      <p className="mq-plate">
        <b>{label}</b>
        <span suppressHydrationWarning>{date}</span>
      </p>
      <div className="mq-board">
        {/* One real heading for anything reading the page; the hand-hung
            letters underneath are decoration. */}
        <h1 className="mq-title" aria-label={title}>
          {title.split(/\s+/).map((word, w) => (
            <span key={w} className={`mq-word ${reds.has(word.toLowerCase()) ? "is-red" : ""}`} aria-hidden>
              {Array.from(word).map((ch) => {
                const i = n++;
                return (
                  <span key={i} className="mq-l" style={hang(i)}>
                    {ch}
                  </span>
                );
              })}
            </span>
          ))}
        </h1>
      </div>
    </header>
  );
}
