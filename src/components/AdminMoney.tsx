import type { AdminStats } from "@/lib/admin-stats";

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded border p-3 ${accent ? "border-avail/50 bg-avail/5" : "border-line bg-surface"}`}>
      <p className={`font-display text-3xl leading-none ${accent ? "text-avail" : "text-amber"}`}>{value}</p>
      <p className="mt-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim">{label}</p>
      {sub && <p className="mt-0.5 font-mono text-[0.55rem] text-cream/70">{sub}</p>}
    </div>
  );
}

function fmtDate(d: string): string {
  if (!d) return "—";
  const t = new Date(d);
  return `${t.getMonth() + 1}/${t.getDate()}/${String(t.getFullYear()).slice(2)}`;
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminMoney({ money }: { money: AdminStats["money"] }) {
  return (
    <div className="flex flex-col gap-5">
      {!money.configured && (
        <div className="rounded border border-dashed border-amber/50 bg-amber/5 p-3">
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-amber">
            💳 Stripe not connected yet
          </p>
          <p className="mt-1 font-mono text-[0.6rem] text-dim">
            Set STRIPE_SECRET_KEY + STRIPE_PRICE_ID and run migration 0005. These tiles start filling
            the moment your first Balcony Seat sells.
          </p>
        </div>
      )}

      {/* Revenue */}
      <section>
        <p className="eyebrow mb-2">Balcony Seats · revenue</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="MRR" value={usd(money.mrr)} sub={`${usd(money.price)}/mo each`} accent />
          <Tile label="ARR (run rate)" value={usd(money.arr)} />
          <Tile label="Paying" value={String(money.paying)} sub="active subs" />
          <Tile label="On trial" value={String(money.trialing)} sub="not yet billed" />
        </div>
      </section>

      {/* Subscription health */}
      <section>
        <p className="eyebrow mb-2">Subscriptions</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="In the balcony" value={String(money.activeSubs)} sub="premium right now" />
          <Tile label="Ever converted" value={String(money.conversions)} sub="lifetime starts" />
          <Tile label="Canceled / lapsed" value={String(money.canceled)} />
          <Tile
            label="Trial → paid"
            value={
              money.conversions ? `${Math.round((money.paying / money.conversions) * 100)}%` : "—"
            }
            sub="of all starts"
          />
        </div>
      </section>

      {/* Current subscribers */}
      <section>
        <p className="eyebrow mb-2">Current subscribers</p>
        {money.subscribers.length === 0 ? (
          <p className="text-sm text-dim">No one in the balcony yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {money.subscribers.map((s, i) => (
              <li
                key={`${s.email}-${i}`}
                className="flex items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-cream">{s.email ?? "—"}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest ${
                      s.status === "active" ? "border-avail text-avail" : "border-amber text-amber"
                    }`}
                  >
                    {s.status === "active" ? "paying" : s.status}
                  </span>
                  <span className="font-mono text-[0.55rem] text-dim">{fmtDate(s.startedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Event timeline */}
      <section>
        <p className="eyebrow mb-2">Recent payment events</p>
        {money.recentEvents.length === 0 ? (
          <p className="text-sm text-dim">No Stripe events yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {money.recentEvents.map((e, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded border border-line bg-surface px-3 py-2 font-mono text-[0.65rem]"
              >
                <span className="min-w-0 truncate text-cream">
                  <span className="text-amber">{e.kind}</span> · {e.email ?? "—"}
                </span>
                <span className="shrink-0 text-dim">
                  {e.status} · {fmtDate(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
