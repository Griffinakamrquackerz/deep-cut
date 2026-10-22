import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { optOut, validUnsubscribe, type EmailKind } from "@/lib/email-prefs";

// Unsubscribing, without signing in.
//
// One click from the email and it's done — no login, no "manage preferences"
// maze, no confirm step. Someone who wants off the list has already decided,
// and every obstacle between them and the exit is one step closer to them
// marking the mail as spam instead, which costs the sending domain far more.
//
// It's a page rather than a route so the link in an email lands somewhere that
// says what happened. Safe under a mail client that prefetches links: opting
// out twice is the same as once, and the page renders the same either way.

export const dynamic = "force-dynamic";

const KINDS: Record<EmailKind, string> = {
  programme: "the monthly programme",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; k?: string; t?: string }>;
}) {
  const { u, k, t } = await searchParams;
  const kind = (k ?? "") as EmailKind;
  const ok = !!u && !!t && kind in KINDS && validUnsubscribe(u, kind, t);

  if (ok) await optOut(supabaseAdmin(), u!, kind);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <p className="eyebrow">Deep Cut</p>
      {ok ? (
        <>
          <h1 className="glow-amber mt-2 font-display text-4xl text-amber">
            YOU&apos;RE OFF THE LIST
          </h1>
          <p className="mt-3 text-sm text-dim">
            No more {KINDS[kind]}. Anything you actually asked for — a sign-in link, a
            receipt — still comes through.
          </p>
          <p className="mt-1 font-mono text-[0.65rem] text-dim">
            Changed your mind? Settings has the switch.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-4xl text-cream">THAT LINK DIDN&apos;T WORK</h1>
          <p className="mt-3 text-sm text-dim">
            It may have been cut in half by your mail app. You can turn the same thing off in
            Settings.
          </p>
        </>
      )}
      <Link
        href="/settings"
        className="mt-6 rounded border border-line px-4 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-cream"
      >
        Open settings
      </Link>
    </main>
  );
}
