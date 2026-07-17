// A strip of chasing theater-marquee bulbs.
export default function MarqueeBulbs({ count = 14 }: { count?: number }) {
  return (
    <div className="marquee-bulbs" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
