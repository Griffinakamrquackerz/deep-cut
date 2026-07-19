import type { AdminStats } from "@/lib/admin-stats";

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-line bg-surface p-3">
      <p className="font-display text-3xl leading-none text-amber">{value}</p>
      <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim">{label}</p>
      {sub && <p className="mt-0.5 font-mono text-[0.55rem] text-cream/70">{sub}</p>}
    </div>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const t = new Date(d);
  return `${t.getMonth() + 1}/${t.getDate()}`;
}

export default function AdminOverview({ stats }: { stats: AdminStats }) {
  const { members, active, engine, activity, premium, content, recentSignups, topWatchlisted } = stats;

  return (
    <div className="flex flex-col gap-5">
      {/* Members */}
      <section>
        <p className="eyebrow mb-2">The house</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Members" value={members.total} />
          <Tile label="New · 24h" value={`+${members.new24h}`} sub={`+${members.new7d} this week`} />
          <Tile label="Active · 7d" value={active.d7 ?? "—"} sub={`${active.d30 ?? "—"} in 30d`} />
          <Tile
            label="Balcony Seats"
            value={premium === null ? "—" : premium}
            sub={premium === null ? "not configured" : "premium members"}
          />
        </div>
      </section>

      {/* Taste engine funnel */}
      <section>
        <p className="eyebrow mb-2">Does the engine land?</p>
        <div className="rounded border border-line bg-surface p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="font-display text-2xl text-cream">{engine.dealt}</p>
              <p className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">dealt</p>
            </div>
            <div>
              <p className="font-display text-2xl text-cream">{engine.watched}</p>
              <p className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                watched · {engine.watchedRate}%
              </p>
            </div>
            <div>
              <p className="font-display text-2xl text-amber">{engine.loved}</p>
              <p className="font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                loved · {engine.lovedRate}%
              </p>
            </div>
          </div>
          <p className="mt-2 text-center font-mono text-[0.55rem] text-dim">
            deal → watched → loved. watched% of dealt, loved% of watched.
          </p>
        </div>
      </section>

      {/* Activity */}
      <section>
        <p className="eyebrow mb-2">Activity</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Watches" value={activity.watches} sub={`+${activity.watches7d} this week`} />
          <Tile label="Loved films" value={activity.loved} />
          <Tile label="Mixtapes" value={activity.playlists} />
          <Tile label="Follows" value={activity.follows} />
        </div>
      </section>

      {/* Content */}
      <section>
        <p className="eyebrow mb-2">Vault</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Films cached" value={content.movies} />
          <Tile
            label="Ratings coverage"
            value={content.ratingsCoverage === null ? "—" : `${content.ratingsCoverage}%`}
            sub="IMDb/RT enriched"
          />
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Recent signups */}
        <section>
          <p className="eyebrow mb-2">Newest members</p>
          {recentSignups.length === 0 ? (
            <p className="text-sm text-dim">Nobody yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recentSignups.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-cream">
                    {u.email ?? (u.handle ? `@${u.handle}` : u.id.slice(0, 8))}
                  </span>
                  <span className="shrink-0 font-mono text-[0.55rem] text-dim">{fmtDate(u.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Watchlist heat */}
        <section>
          <p className="eyebrow mb-2">Most-saved films</p>
          {topWatchlisted.length === 0 ? (
            <p className="text-sm text-dim">No watchlist saves yet.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {topWatchlisted.map((f, i) => (
                <li
                  key={`${f.title}-${f.year}`}
                  className="flex items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-cream">
                    <span className="font-mono text-[0.6rem] text-dim">{i + 1}.</span> {f.title}{" "}
                    <span className="font-mono text-xs text-dim">{f.year ?? ""}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[0.6rem] text-amber">×{f.count}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
