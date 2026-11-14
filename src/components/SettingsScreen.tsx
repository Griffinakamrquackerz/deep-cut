"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import { REGIONS, servicesForRegion } from "@/lib/region";
import { PROFILE_THEMES } from "@/lib/themes";
import InstallPrompt from "@/components/InstallPrompt";
import Avatar from "@/components/Avatar";
import NotificationsToggle from "@/components/NotificationsToggle";
import ProgrammeEmailToggle from "@/components/ProgrammeEmailToggle";
import DeliveryAddress from "@/components/DeliveryAddress";
import { isMuted, setMuted, sfxChime, sfxPop } from "@/lib/sfx";

interface SignatureMovie {
  id: number;
  title: string;
  year: number | null;
}

/** Center-crop to a small square JPEG in the browser — uploads stay tiny. */
async function resizeToJpeg(file: File, px = 384): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, side, side, 0, 0, px, px);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** The projection booth — look, handle, region, services, sound, password, install. */
export default function SettingsScreen({
  handle,
  services,
  avatarUrl,
  theme,
  signatureMovie,
  premiumActive,
  premiumUntil,
  hasStripeCustomer,
  premiumAvailable,
  lifetimeAvailable = false,
  isAdmin = false,
}: {
  handle: string | null;
  services: Service[];
  avatarUrl: string | null;
  theme: string;
  signatureMovie: SignatureMovie | null;
  premiumActive: boolean;
  premiumUntil: string | null;
  hasStripeCustomer: boolean;
  premiumAvailable: boolean;
  lifetimeAvailable?: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [newHandle, setNewHandle] = useState(handle ?? "");
  const [selected, setSelected] = useState<Set<Service>>(new Set(services));

  // Region. Loaded rather than passed in, so this component stays usable from
  // anywhere and the geo guess happens server-side where the header lives.
  const [region, setRegion] = useState<string>("US");
  const [regionNote, setRegionNote] = useState<string | null>(null);
  const availableHere = servicesForRegion(region);

  useEffect(() => {
    let alive = true;
    void fetch("/api/region")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { region?: string; regionKnown?: boolean } | null) => {
        if (!alive || !d?.region) return;
        setRegion(d.region);
        // Say so when it's a guess. Somebody who has never been asked should
        // know the app is assuming, not reporting.
        if (d.regionKnown === false) {
          setRegionNote(`We've guessed ${d.region} from your connection — set it if that's wrong.`);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function saveRegion(next: string) {
    const previous = region;
    setRegion(next);
    setRegionNote("Saving…");
    try {
      const res = await fetch("/api/region", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: next }),
      });
      if (!res.ok) {
        // Put it back. A picker that shows the new value while the server holds
        // the old one is worse than one that admits the save failed.
        setRegion(previous);
        setRegionNote("Couldn't save that — your region is unchanged.");
        return;
      }
      setRegionNote("Saved. Your next deal uses this catalogue.");
    } catch {
      setRegion(previous);
      setRegionNote("Couldn't reach the house — your region is unchanged.");
    }
  }
  const [status, setStatus] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [muted, setMutedState] = useState(true);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [activeTheme, setActiveTheme] = useState(theme);
  const [signature, setSignature] = useState<SignatureMovie | null>(signatureMovie);
  const [sigQuery, setSigQuery] = useState("");
  const [sigResults, setSigResults] = useState<SignatureMovie[]>([]);
  const [styleMsg, setStyleMsg] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMutedState(isMuted()), []);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setStyleMsg(null);
    try {
      const dataUrl = await resizeToJpeg(file);
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        setAvatar(data.url);
        sfxPop();
        router.refresh();
      } else {
        setStyleMsg("Photo upload jammed — try a different image.");
      }
    } catch {
      setStyleMsg("Couldn't read that image — try a JPG or PNG.");
    }
    setUploading(false);
  }

  async function saveStyle(patch: { theme?: string; signatureMovieId?: number | null }) {
    setStyleMsg(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setStyleMsg("Couldn't save that — try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function searchSignature(q: string) {
    setSigQuery(q);
    if (!q.trim()) return setSigResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setSigResults(((await res.json()).results ?? []).slice(0, 6));
  }

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sfxChime(); // a little fanfare so they hear it working
  }

  async function signOut() {
    setSigningOut(true);
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    // Clears the session cookie (global scope) so the server sees us logged out too.
    await supabaseBrowser().auth.signOut().catch(() => null);
    window.location.href = "/login";
  }

  async function savePassword() {
    setPwStatus(null);
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    const { error } = await supabaseBrowser().auth.updateUser({ password: newPassword });
    if (error) setPwStatus(error.message);
    else {
      setPwStatus("Password set — you can now sign in without email links.");
      setNewPassword("");
    }
  }

  async function save() {
    setStatus(null);
    const [meRes, svcRes] = await Promise.all([
      newHandle && newHandle !== handle
        ? fetch("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: newHandle }),
          })
        : Promise.resolve(new Response(null, { status: 200 })),
      fetch("/api/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: [...selected] }),
      }),
    ]);
    if (meRes.status === 409) setStatus("That handle is taken.");
    else if (!meRes.ok || !svcRes.ok) setStatus("Save failed.");
    else {
      setStatus("Saved.");
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <p className="slate">
          <b>Projection booth</b>
        </p>
        <h1 className="title-card rack-in mt-2.5 text-4xl">SETTINGS</h1>
      </header>

      <BalconySeats
        active={premiumActive}
        until={premiumUntil}
        hasCustomer={hasStripeCustomer}
        available={premiumAvailable}
        lifetimeAvailable={lifetimeAvailable}
      />

      {/* ── Your marquee look ─────────────────────────────────────── */}
      <div className="ticket-edge rounded bg-surface p-4">
        <p className="eyebrow mb-3 text-ticket">Your marquee look</p>

        <div className="flex items-center gap-4">
          <Avatar url={avatar} name={handle ?? "?"} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-wider text-cream">Headshot</p>
            <p className="font-mono text-[0.6rem] text-dim">shows on your card & the marquee</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-1.5 rounded border border-amber px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-amber disabled:opacity-50"
            >
              {uploading ? "Developing…" : avatar ? "New photo" : "📸 Add photo"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cream">Card theme</p>
          <p className="font-mono text-[0.6rem] text-dim">restyles your whole public card</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PROFILE_THEMES.map((t) => {
              const on = activeTheme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    sfxPop();
                    setActiveTheme(t.key);
                    void saveStyle({ theme: t.key });
                  }}
                  aria-pressed={on}
                  className={`rounded border p-2.5 text-left ${
                    on ? "border-amber ring-1 ring-amber" : "border-line"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        className="h-3 w-3 rounded-full border border-bg"
                        style={{ background: c }}
                      />
                    ))}
                    <span className="font-display text-base text-cream">{t.label}</span>
                  </span>
                  <span className="font-mono text-[0.55rem] text-dim">{t.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <p className="font-mono text-xs uppercase tracking-wider text-cream">Signature film</p>
          <p className="font-mono text-[0.6rem] text-dim">
            your profile song, but cinema — its stills become a collage on your card
          </p>
          {signature ? (
            <div className="mt-2 flex items-center justify-between rounded border border-amber/60 bg-bg px-3 py-2">
              <span className="min-w-0 truncate text-sm text-cream">
                🎞 {signature.title}{" "}
                <span className="font-mono text-xs text-dim">{signature.year ?? ""}</span>
              </span>
              <button
                onClick={() => {
                  setSignature(null);
                  void saveStyle({ signatureMovieId: null });
                }}
                aria-label="Clear signature film"
                className="ml-2 font-mono text-xs text-ticket"
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              type="search"
              value={sigQuery}
              onChange={(e) => void searchSignature(e.target.value)}
              placeholder="Search any film…"
              className="mt-2 w-full rounded border border-line bg-bg px-3 py-2.5 text-sm text-cream placeholder:text-dim/60"
            />
          )}
          {!signature && sigResults.length > 0 && (
            <ul className="mt-1 divide-y divide-line rounded border border-line bg-bg">
              {sigResults.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => {
                      setSignature(r);
                      setSigQuery("");
                      setSigResults([]);
                      void saveStyle({ signatureMovieId: r.id });
                    }}
                    className="flex w-full justify-between px-3 py-2 text-left text-sm text-cream"
                  >
                    <span>
                      {r.title} <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                    </span>
                    <span className="text-amber">+</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {styleMsg && <p className="mt-3 font-mono text-xs text-ticket">{styleMsg}</p>}
      </div>

      <label className="flex flex-col gap-1">
        <span className="eyebrow">Handle</span>
        <input
          value={newHandle}
          onChange={(e) => setNewHandle(e.target.value)}
          placeholder="your_handle"
          className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
        />
      </label>

      {/* Above the services picker on purpose: the region decides which
          services are worth offering, so reading top to bottom follows the
          causality rather than fighting it. */}
      <div>
        <p className="eyebrow mb-2">Where you watch</p>
        <select
          value={region}
          onChange={(e) => void saveRegion(e.target.value)}
          aria-label="Where you watch"
          className="w-full rounded border border-line bg-surface px-3 py-2.5 text-sm text-cream focus:border-amber focus:outline-none"
        >
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
          {/* Somewhere not on the list: keep their real answer selectable
              rather than silently snapping them to a country they didn't pick. */}
          {!REGIONS.some((r) => r.code === region) && <option value={region}>{region}</option>}
        </select>
        <p className="mt-1.5 font-mono text-[0.6rem] leading-relaxed text-dim">
          {regionNote ??
            "Sets which country's streaming catalogue every recommendation is checked against. Get this wrong and the house offers you films you can't actually watch."}
        </p>
      </div>

      <div>
        <p className="eyebrow mb-2">Streaming services</p>
        <p className="mb-2 font-mono text-[0.6rem] text-dim">
          The ones that operate where you are.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.filter((s) => availableHere.includes(s)).map((s) => {
            const on = selected.has(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                aria-pressed={on}
                className={`rounded border px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider ${
                  on ? "border-avail text-avail" : "border-line text-dim"
                }`}
              >
                {on ? "✓ " : ""}
                {SERVICE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">House sound</p>
        <button
          onClick={toggleSound}
          aria-pressed={!muted}
          className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3"
        >
          <span className="text-left">
            <span className="block font-mono text-xs uppercase tracking-wider text-cream">
              {muted ? "🔇" : "🔊"} Sound effects
            </span>
            <span className="font-mono text-[0.6rem] text-dim">
              clicks, chimes & confetti pops
            </span>
          </span>
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest ${
              muted ? "border-line text-dim" : "border-avail text-avail"
            }`}
          >
            {muted ? "Off" : "On"}
          </span>
        </button>
      </div>

      <div>
        <p className="eyebrow mb-2">The Indie Film Fund</p>
        <Link
          href="/fund"
          className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3"
        >
          <span className="text-left">
            <span className="block font-mono text-xs uppercase tracking-wider text-cream">
              🎬 Where your money goes
            </span>
            <span className="font-mono text-[0.6rem] text-dim">
              the tiers, the votes, and what gets made
            </span>
          </span>
          <span aria-hidden className="font-mono text-[0.65rem] text-amber">
            →
          </span>
        </Link>
      </div>

      {/* Renders nothing until a physical tier is actually reached — see the
          component. Placed under the fund block because that is where the
          money that earned the parcel is explained. */}
      <DeliveryAddress />

      <NotificationsToggle />
      <ProgrammeEmailToggle />

      <button
        onClick={save}
        className="rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
      >
        Save settings
      </button>
      {status && <p className="font-mono text-xs text-dim">{status}</p>}

      <div className="mt-2 border-t border-line pt-4">
        <p className="eyebrow mb-2">Password</p>
        <p className="mb-2 text-xs text-dim">
          Set one and you&apos;ll never need an email link to sign in again.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (8+ chars)"
            className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />
          <button
            disabled={newPassword.length < 8}
            onClick={() => void savePassword()}
            className="rounded border border-amber px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-amber disabled:opacity-40"
          >
            Set
          </button>
        </div>
        {pwStatus && <p className="mt-2 font-mono text-xs text-dim">{pwStatus}</p>}
      </div>

      <div className="mt-2">
        <InstallPrompt compact />
      </div>

      <button
        onClick={() => void signOut()}
        disabled={signingOut}
        className="mt-2 rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-cream disabled:opacity-50"
      >
        {signingOut ? "Dimming the lights…" : "🚪 Sign out"}
      </button>

      {isAdmin && (
        <a
          href="/admin"
          className="rounded border border-amber/50 bg-amber/5 px-4 py-3 text-center font-mono text-xs uppercase tracking-widest text-amber"
        >
          🎛 Projection booth (admin)
        </a>
      )}

      <p className="mt-2 text-center font-mono text-[0.6rem] text-dim/80">
        <a href="/terms" className="underline">Terms of Use</a> ·{" "}
        <a href="/privacy" className="underline">Privacy Policy</a>
      </p>

      <DangerZone />
    </section>
  );
}

/** App Store 5.1.1(v): in-app account deletion, gated by a typed confirm. */
function DangerZone() {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/login";
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ? String(data.error).slice(0, 160) : "Deletion failed — try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="mt-4 rounded border border-ticket/50 p-4">
      <p className="eyebrow mb-1 text-ticket">Leave the theater</p>
      {/* Unlike native there's no second confirm dialog — the type-DELETE input
          below is it — so this line stays specific about what's lost. */}
      <p className="text-xs leading-relaxed text-dim">
        Deletes everything — profile, loved films, watch history, mixtapes, follows.
        Can&apos;t be undone.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`Type DELETE to confirm`}
          autoCapitalize="characters"
          autoCorrect="off"
          aria-label="Type DELETE to confirm account deletion"
          className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2.5 font-mono text-xs text-cream placeholder:text-dim/60"
        />
        <button
          disabled={confirmText !== "DELETE" || deleting}
          onClick={() => void deleteAccount()}
          className="rounded border border-ticket px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-ticket disabled:opacity-40"
        >
          {deleting ? "Burning the reel…" : "Delete account"}
        </button>
      </div>
      {error && <p className="mt-2 font-mono text-xs text-ticket">{error}</p>}
    </div>
  );
}


/** The Balcony Seats storefront: 3 free months, then $4.99/mo. */
function BalconySeats({
  active,
  until,
  hasCustomer,
  available,
  lifetimeAvailable = false,
}: {
  active: boolean;
  until: string | null;
  hasCustomer: boolean;
  available: boolean;
  lifetimeAvailable?: boolean;
}) {
  const [busy, setBusy] = useState<null | "monthly" | "lifetime" | "portal">(null);
  const [err, setErr] = useState<string | null>(null);

  // A far-future expiry is the one-time "lifetime" pass, not a renewing sub.
  const lifetime = !!until && new Date(until).getFullYear() >= 2099;

  async function checkout(plan: "monthly" | "lifetime") {
    setBusy(plan);
    setErr(null);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.url) {
      window.location.href = data.url;
      return;
    }
    setErr(data?.error ? String(data.error).slice(0, 160) : "Something jammed — try again.");
    setBusy(null);
  }

  async function portal() {
    setBusy("portal");
    setErr(null);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.url) {
      window.location.href = data.url;
      return;
    }
    setErr(data?.error ? String(data.error).slice(0, 160) : "Something jammed — try again.");
    setBusy(null);
  }

  if (!available && !lifetimeAvailable && !active) return null; // Stripe not set up — hide storefront

  return (
    <div className="film-card rounded-lg p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow text-ticket">Balcony Seats</p>
        {active && <span className="stamp stamp-gold">Member</span>}
      </div>
      {active ? (
        <>
          <p className="mt-1 font-display text-2xl text-amber">
            {lifetime ? "🏛 LIFETIME BALCONY" : "🥂 YOU'RE IN THE BALCONY"}
          </p>
          <p className="font-mono text-[0.65rem] text-dim">
            30 deals a day · zero ads
            {lifetime
              ? " · yours forever"
              : until
                ? ` · renews ${new Date(until).toLocaleDateString()}`
                : ""}
          </p>
          {hasCustomer && !lifetime && (
            <button
              onClick={() => void portal()}
              disabled={!!busy}
              className="mt-3 rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-2xl text-amber">MOVE UP TO THE BALCONY</p>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[0.65rem] text-cream/90">
            <li>🎟 30 deals a day (general admission gets 10)</li>
            <li>🚫 Zero ads, anywhere</li>
            <li>🥂 Member stamp on your card</li>
          </ul>
          {available && (
            <button
              onClick={() => void checkout("monthly")}
              disabled={!!busy}
              className="pulse-cta mt-3 w-full rounded bg-ticket px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream disabled:opacity-50"
            >
              {busy === "monthly" ? "Opening the box office…" : "★ 3 months free, then $3.99/mo ★"}
            </button>
          )}
          {lifetimeAvailable && (
            <>
              <button
                onClick={() => void checkout("lifetime")}
                disabled={!!busy}
                className="mt-2 w-full rounded border border-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-amber disabled:opacity-50"
              >
                {busy === "lifetime" ? "Opening the box office…" : "🏛 Buy it once — $150 lifetime"}
              </button>
              <p className="mt-1.5 text-center font-mono text-[0.6rem] text-dim">
                one payment, never think about it again
              </p>
            </>
          )}
          {!lifetimeAvailable && (
            <p className="mt-1.5 text-center font-mono text-[0.6rem] text-dim">
              the price of one rental · cancel anytime
            </p>
          )}
        </>
      )}
      {err && <p className="mt-2 font-mono text-xs text-ticket">{err}</p>}
    </div>
  );
}
