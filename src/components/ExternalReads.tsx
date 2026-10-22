"use client";
import { useState } from "react";
import { toast } from "@/lib/toast";

// Member-published links on a film page, with the two controls that were
// missing: take yours down, and report somebody else's.
//
// Until now this was a bare list of anchors. Any member could publish an
// arbitrary URL here, visible to every viewer, and nothing — no author
// control, no admin screen, no server handler — could remove it. That is a
// Guideline 1.2 failure on both counts Apple asks about (report, and remove),
// and it is also the plainest way to push a link at the whole membership.
//
// `mine` is computed on the server so member ids never reach the page.

export interface ReadLink {
  id: string;
  title: string;
  url: string;
  mine: boolean;
}

export default function ExternalReads({
  reads,
  signedIn,
}: {
  reads: ReadLink[];
  signedIn: boolean;
}) {
  // Removed rows disappear immediately rather than after a refetch: the whole
  // point of the control is that somebody wants the link gone now.
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = reads.filter((r) => !gone.includes(r.id));

  async function remove(id: string) {
    setBusy(id);
    const res = await fetch(`/api/reads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      setGone((g) => [...g, id]);
      toast("Link removed.", { tone: "amber" });
    } else {
      toast("Couldn't remove that link — try again.", { tone: "ticket" });
    }
  }

  async function report(id: string) {
    const reason = window.prompt("Report this link — what's the problem?");
    if (!reason?.trim()) return;
    setBusy(id);
    await fetch("/api/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "report",
        subjectType: "external_read",
        subjectId: id,
        reason: reason.trim().slice(0, 500),
      }),
    }).catch(() => {});
    setBusy(null);
    toast("Reported — we'll review it.", { tone: "amber" });
  }

  return (
    <div>
      <p className="eyebrow mb-2">External reads</p>
      {visible.length === 0 ? (
        <p className="text-sm text-dim">No articles linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="min-w-0 flex-1 text-sm text-amber underline"
              >
                {r.title} ↗
              </a>
              {signedIn && (
                <button
                  onClick={() => (r.mine ? remove(r.id) : report(r.id))}
                  disabled={busy === r.id}
                  title={r.mine ? "Remove this link" : "Report this link"}
                  aria-label={r.mine ? "Remove this link" : "Report this link"}
                  className="shrink-0 font-mono text-[0.7rem] text-dim hover:text-cream disabled:opacity-50"
                >
                  {busy === r.id ? "…" : r.mine ? "✕" : "⚑"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
