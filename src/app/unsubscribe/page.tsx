import Link from "next/link";
import Doorway from "@/components/site/Doorway";
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
    <Doorway
      reel="Deep Cut"
      slate="The mailing list"
      title={
        ok ? (
          <>
            You&apos;re <em>off the list.</em>
          </>
        ) : (
          <>That link didn&apos;t work.</>
        )
      }
      lede={
        ok ? (
          <>
            No more {KINDS[kind]}. Anything you actually asked for — a sign-in link, a receipt — still
            comes through.
          </>
        ) : (
          <>It may have been cut in half by your mail app. You can turn the same thing off in Settings.</>
        )
      }
    >
      <div style={{ textAlign: "center" }}>
        {ok && (
          <p className="mb-4 font-mono text-[0.65rem] text-dim">Changed your mind? Settings has the switch.</p>
        )}
        <Link href="/settings" className="lp-btn lp-btn--ghost">
          Open settings
        </Link>
      </div>
    </Doorway>
  );
}
