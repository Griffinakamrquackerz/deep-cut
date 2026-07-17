"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import InstallPrompt from "@/components/InstallPrompt";
import { isMuted, setMuted, sfxChime } from "@/lib/sfx";

/** The projection booth — handle, services, sound, password, install. */
export default function SettingsScreen({
  handle,
  services,
}: {
  handle: string | null;
  services: Service[];
}) {
  const router = useRouter();
  const [newHandle, setNewHandle] = useState(handle ?? "");
  const [selected, setSelected] = useState<Set<Service>>(new Set(services));
  const [status, setStatus] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [muted, setMutedState] = useState(true);
  useEffect(() => setMutedState(isMuted()), []);

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
    </section>
  );
}
