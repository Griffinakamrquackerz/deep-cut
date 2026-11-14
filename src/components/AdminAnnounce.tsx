"use client";
import { useCallback, useEffect, useState } from "react";

// Sending the open call to everybody's lock screen, from a screen.
//
// The design rule here is that the count comes first. Everything else in the
// admin console edits a row you can edit back; this one puts a notification on
// every phone in the building and there is no unsend. So the panel loads the
// recipient count before it will render a live button, names the exact words
// that will be sent, and says so if the announcement has already gone out.
//
// The message itself is deliberately NOT editable. It's derived from the
// round's status by the same function that writes the in-app banner, which is
// what keeps the push, the site and the app saying one thing. A free-text box
// here would be a way to broadcast a typo to everyone at once.

interface Plan {
  round: { id: string; title: string; status: string } | null;
  campaign: { key: string; title: string; body: string; path: string } | null;
  reach: { people: number; webDevices: number; nativeDevices: number };
  alreadySentAt: string | null;
  webPushConfigured: boolean;
}

export default function AdminAnnounce() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/announce", { cache: "no-store" });
    if (res.ok) setPlan(await res.json());
    else setNote("Couldn't load the announcement plan.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(force: boolean) {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, force }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setNote(
        `Sent to ${data.sent.people} ${data.sent.people === 1 ? "person" : "people"} — ${data.sent.web.sent} browser${data.sent.web.sent === 1 ? "" : "s"}, ${data.sent.native.sent} in the app.` +
          (data.sent.web.pruned || data.sent.native.dead
            ? ` Cleared ${data.sent.web.pruned + data.sent.native.dead} dead device${data.sent.web.pruned + data.sent.native.dead === 1 ? "" : "s"}.`
            : ""),
      );
    } else {
      setNote(data?.note ?? data?.error ?? "That didn't send.");
    }
    setArmed(false);
    setBusy(false);
    void load();
  }

  if (!plan) return <p className="font-mono text-xs text-dim">Loading the announcement plan…</p>;

  const { campaign, reach, round } = plan;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="eyebrow">Notify everybody</p>
        <h2 className="font-display text-3xl text-amber">THE OPEN CALL</h2>
      </div>

      {!campaign ? (
        <p className="rounded border border-line bg-surface p-3 text-sm text-dim">
          Nothing to announce.{" "}
          {round
            ? `The round "${round.title}" is ${round.status}` +
              (round.status === "voting"
                ? " but has no pitches on the ballot, so there's nothing to vote on yet."
                : ".")
            : "No round is open."}
        </p>
      ) : (
        <>
          {/* The words, verbatim. Nobody should press send on a message they
              haven't read in the shape it will arrive in. */}
          <div className="rounded border border-line bg-surface p-3">
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">
              What lands on the lock screen
            </p>
            <p className="mt-2 font-display text-xl text-cream">{campaign.title}</p>
            <p className="mt-1 text-sm text-dim">{campaign.body}</p>
            <p className="mt-2 font-mono text-[0.6rem] text-dim">
              Tapping it opens {campaign.path}
            </p>
          </div>

          <div className="rounded border border-line bg-surface p-3">
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">Who gets it</p>
            <p className="mt-1 font-display text-4xl text-amber">{reach.people}</p>
            <p className="font-mono text-[0.65rem] text-dim">
              {reach.people === 1 ? "person" : "people"} · {reach.webDevices} browser
              {reach.webDevices === 1 ? "" : "s"} · {reach.nativeDevices} in the app
            </p>
            {!plan.webPushConfigured && (
              <p className="mt-2 font-mono text-[0.65rem] text-ticket">
                VAPID keys aren&apos;t set, so the browser half will send nothing.
              </p>
            )}
          </div>

          {plan.alreadySentAt && (
            <p className="rounded border border-ticket/40 bg-surface p-3 font-mono text-[0.7rem] text-ticket">
              Already sent {new Date(plan.alreadySentAt).toLocaleString()}. Sending again notifies
              everybody a second time.
            </p>
          )}

          {reach.people === 0 ? (
            <p className="font-mono text-xs text-dim">
              Nobody has turned notifications on yet, so there is nothing to send.
            </p>
          ) : !armed ? (
            <button
              onClick={() => setArmed(true)}
              className="self-start rounded border border-amber px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-amber"
            >
              {plan.alreadySentAt ? "Send it again…" : "Send it…"}
            </button>
          ) : (
            // Two presses, on purpose. The first one is a question.
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-cream">
                Notify {reach.people} {reach.people === 1 ? "person" : "people"}?
              </span>
              <button
                onClick={() => void send(!!plan.alreadySentAt)}
                disabled={busy}
                className="rounded border border-amber bg-amber/10 px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-amber disabled:opacity-50"
              >
                {busy ? "Sending…" : "Yes, send it"}
              </button>
              <button
                onClick={() => setArmed(false)}
                disabled={busy}
                className="rounded border border-line px-3 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-dim"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {note && <p className="font-mono text-xs text-ticket">{note}</p>}
    </section>
  );
}
