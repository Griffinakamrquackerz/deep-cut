"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { sfxClick } from "@/lib/sfx";

const REASONS = [
  "Impersonation",
  "Harassment or hate",
  "Spam or scam",
  "Inappropriate content",
  "Something else",
];

/** Block + report controls on a member card (App Store guideline 1.2). */
export default function SafetyActions({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function block() {
    if (!window.confirm(`Block ${name}? They'll disappear from your marquee and searches.`)) return;
    setBusy(true);
    const res = await fetch("/api/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "block", targetId: userId, blocked: true }),
    });
    setBusy(false);
    if (res.ok) {
      toast(`${name} blocked`, { tone: "ticket", icon: "🚫" });
      setOpen(false);
      router.push("/lobby");
    } else {
      toast("Couldn't block — try again", { tone: "ticket" });
    }
  }

  async function report(reason: string) {
    setBusy(true);
    const res = await fetch("/api/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report",
        subjectType: "user",
        subjectId: userId,
        reason,
      }),
    });
    setBusy(false);
    setReporting(false);
    setOpen(false);
    toast(res.ok ? "Report filed with the house" : "Couldn't file — try again", {
      tone: res.ok ? "amber" : "ticket",
      icon: "🛡",
    });
  }

  return (
    <div className="text-center">
      <button
        onClick={() => {
          sfxClick();
          setOpen((o) => !o);
          setReporting(false);
        }}
        aria-expanded={open}
        className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline decoration-line"
      >
        🛡 Block or report
      </button>

      {open && (
        <div className="mt-2 rounded border border-line bg-surface p-3">
          {reporting ? (
            <div className="flex flex-col gap-1.5">
              <p className="eyebrow mb-1">What&apos;s wrong?</p>
              {REASONS.map((r) => (
                <button
                  key={r}
                  disabled={busy}
                  onClick={() => void report(r)}
                  className="rounded border border-line px-3 py-2 text-left font-mono text-[0.65rem] uppercase tracking-wider text-cream disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex justify-center gap-2">
              <button
                disabled={busy}
                onClick={() => void block()}
                className="rounded border border-ticket px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-ticket disabled:opacity-50"
              >
                🚫 Block {name}
              </button>
              <button
                disabled={busy}
                onClick={() => setReporting(true)}
                className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim"
              >
                Report
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
