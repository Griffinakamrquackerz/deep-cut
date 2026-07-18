"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import { PROFILE_THEMES } from "@/lib/themes";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import InstallPrompt from "@/components/InstallPrompt";
import Avatar from "@/components/Avatar";
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

/** The projection booth — look, handle, services, sound, password, install. */
export default function SettingsScreen({
  handle,
  services,
  avatarUrl,
  theme,
  signatureMovie,
}: {
  handle: string | null;
  services: Service[];
  avatarUrl: string | null;
  theme: string;
  signatureMovie: SignatureMovie | null;
}) {
  const router = useRouter();
  const [newHandle, setNewHandle] = useState(handle ?? "");
  const [selected, setSelected] = useState<Set<Service>>(new Set(services));
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
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Projection booth</p>
        <h1 className="glow-amber font-display text-4xl text-amber">SETTINGS</h1>
      </header>

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

      <div>
        <p className="eyebrow mb-2">Streaming services</p>
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => {
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
      <p className="text-xs leading-relaxed text-dim">
        Deletes your account and everything with it — taste profile, loved films, watch
        history, mixtapes, follows. This cannot be undone; there is no lost &amp; found.
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
