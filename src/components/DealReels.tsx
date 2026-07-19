// The deal, as a one-armed bandit — three reels of film symbols spinning
// behind ticket windows while the engine picks your night.
const SYMBOLS = ["🎬", "🍿", "🎞", "★", "🌀", "🔦", "◆", "🎟"];

function Reel() {
  // Doubled so the -50% translate loops seamlessly.
  const strip = [...SYMBOLS, ...SYMBOLS];
  return (
    <span className="reel-window" aria-hidden>
      <span className="reel-strip">
        {strip.map((s, i) => (
          <span key={i}>{s}</span>
        ))}
      </span>
    </span>
  );
}

export default function DealReels() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tracking-[0.15em]">
        <Reel />
        <Reel />
        <Reel />
      </span>
      <span className="ml-1 tracking-[0.2em]">DEALING</span>
    </span>
  );
}
