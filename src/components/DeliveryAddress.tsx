"use client";
import { useCallback, useEffect, useState } from "react";

// Where we post the things we promised to post.
//
// Hidden until a member is actually owed something physical. That is the whole
// design: an address is the most sensitive thing this product could hold, and
// collecting it from everybody on the off-chance is both a liability and a
// question nobody wants in a settings screen. The moment somebody clears the
// $250 tier it appears, explains why it appeared, and asks once.
//
// Deliberately forgiving. Region and postcode are optional because plenty of
// valid addresses have neither, and a form that insists is a form somebody
// abandons — which ends with a parcel that never ships, the exact failure this
// exists to prevent.

interface Details {
  recipient: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  countryCode: string | null;
  phone: string | null;
}

const BLANK: Record<keyof Details, string> = {
  recipient: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postcode: "",
  countryCode: "",
  phone: "",
};

const field =
  "w-full rounded border border-line bg-bg/80 px-3 py-2.5 text-sm text-cream placeholder:text-dim/50 focus:border-amber focus:outline-none";
const label = "font-mono text-[0.6rem] uppercase tracking-[0.15em] text-dim";

export default function DeliveryAddress() {
  const [f, setF] = useState({ ...BLANK });
  const [owed, setOwed] = useState(false);
  const [postable, setPostable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/account/delivery")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { details?: Details; owed?: boolean; postable?: boolean } | null) => {
        if (!alive || !d) return;
        const x = d.details;
        if (x) {
          setF({
            recipient: x.recipient ?? "",
            line1: x.line1 ?? "",
            line2: x.line2 ?? "",
            city: x.city ?? "",
            region: x.region ?? "",
            postcode: x.postcode ?? "",
            countryCode: x.countryCode ?? "",
            phone: x.phone ?? "",
          });
        }
        setOwed(d.owed === true);
        setPostable(d.postable === true);
        // Open itself when something is owed and we can't post it. A member who
        // has already given us an address shouldn't have a form in their face.
        setOpen(d.owed === true && d.postable !== true);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, countryCode: f.countryCode.toUpperCase() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; postable?: boolean; note?: string }
        | null;
      if (res.ok && body?.ok) {
        setPostable(body.postable === true);
        setMsg(body.postable ? "Saved — that's enough to post to." : "Saved.");
      } else {
        setMsg(body?.note ?? "Couldn't save that. Try again in a minute.");
      }
    } catch {
      setMsg("Couldn't reach us. Try again in a minute.");
    }
    setBusy(false);
  }, [f]);

  // Nothing owed and nothing on file: stay out of the way entirely.
  if (!loaded || (!owed && !postable)) return null;

  return (
    <div>
      <p className="eyebrow mb-2">Where we post things</p>

      <div className="rounded border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-cream">
              {postable ? "📦 We have an address for you" : "📦 We need an address"}
            </p>
            <p className="mt-1 font-mono text-[0.6rem] leading-relaxed text-dim">
              {postable
                ? "Your pin, poster and anything else physical goes here."
                : "You've reached a tier that ships something. Tell us where, and it goes out when it's made."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 font-mono text-[0.6rem] uppercase tracking-widest text-amber"
          >
            {open ? "Close" : postable ? "Change" : "Add"}
          </button>
        </div>

        {open && (
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            <div>
              <p className={label}>Name on the parcel</p>
              <input
                className={`${field} mt-1`}
                value={f.recipient}
                onChange={set("recipient")}
                autoComplete="name"
                placeholder="Who should it be addressed to?"
              />
            </div>
            <div>
              <p className={label}>Address</p>
              <input
                className={`${field} mt-1`}
                value={f.line1}
                onChange={set("line1")}
                autoComplete="address-line1"
                placeholder="Street and number"
              />
              <input
                className={`${field} mt-2`}
                value={f.line2}
                onChange={set("line2")}
                autoComplete="address-line2"
                placeholder="Flat, unit, building — optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={label}>City</p>
                <input
                  className={`${field} mt-1`}
                  value={f.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <p className={label}>State / region — optional</p>
                <input
                  className={`${field} mt-1`}
                  value={f.region}
                  onChange={set("region")}
                  autoComplete="address-level1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={label}>Postcode — optional</p>
                <input
                  className={`${field} mt-1`}
                  value={f.postcode}
                  onChange={set("postcode")}
                  autoComplete="postal-code"
                />
              </div>
              <div>
                <p className={label}>Country</p>
                <input
                  className={`${field} mt-1 uppercase`}
                  value={f.countryCode}
                  onChange={set("countryCode")}
                  autoComplete="country"
                  maxLength={2}
                  placeholder="US"
                />
              </div>
            </div>
            <div>
              <p className={label}>Phone — optional, for international couriers</p>
              <input
                className={`${field} mt-1`}
                value={f.phone}
                onChange={set("phone")}
                autoComplete="tel"
              />
            </div>

            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="mt-1 rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save address"}
            </button>
            {msg && <p className="font-mono text-[0.65rem] text-dim">{msg}</p>}
            <p className="font-mono text-[0.55rem] leading-relaxed text-dim/80">
              Only ever used to send you what you&apos;re owed. Never shown to
              anyone else, never on a marketing list.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
