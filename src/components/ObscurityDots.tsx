import { obscurityDots } from "@/lib/obscurity";

export default function ObscurityDots({ score }: { score: number }) {
  return (
    <span
      className="font-mono text-xs tracking-widest text-amber"
      title={`Obscurity ${score}/5`}
      aria-label={`Obscurity ${score} out of 5`}
    >
      {obscurityDots(score)}
    </span>
  );
}
