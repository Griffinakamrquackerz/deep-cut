// The deal, in progress: three reels turning while the house pulls your bill.
//
// These used to be slot-machine windows of emoji. A film reel turning is the
// same idea said in the house's own hardware, and it's drawn — so it takes the
// button's colour and looks the same on every phone.

function Reel({ delay }: { delay: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
      className="reel-spin"
      style={{ animationDelay: `${delay}s`, animationDuration: "0.9s", transformOrigin: "50% 50%" }}
    >
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={12 + 5.6 * Math.cos((a * Math.PI) / 180)}
          cy={12 + 5.6 * Math.sin((a * Math.PI) / 180)}
          r="2.2"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export default function DealReels() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        <Reel delay={0} />
        <Reel delay={-0.3} />
        <Reel delay={-0.6} />
      </span>
      <span className="tracking-[0.2em]">Dealing</span>
    </span>
  );
}
