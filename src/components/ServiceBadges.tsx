import { SERVICE_LABELS, type Service } from "@/lib/services";

export default function ServiceBadges({
  available,
  mine = [],
}: {
  available: Service[];
  mine?: Service[];
}) {
  if (available.length === 0) {
    return <span className="font-mono text-[0.6rem] text-dim">not streaming</span>;
  }
  const mineSet = new Set(mine);
  return (
    <span className="flex flex-wrap gap-1">
      {available.map((s) => {
        const has = mineSet.has(s);
        return (
          <span
            key={s}
            className={`rounded-sm border px-1 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${
              has ? "border-avail text-avail" : "border-line text-dim"
            }`}
          >
            {has ? "✓ " : ""}
            {SERVICE_LABELS[s]}
          </span>
        );
      })}
    </span>
  );
}
