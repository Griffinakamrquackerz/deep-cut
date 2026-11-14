import type { Metadata } from "next";
import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";

// Where Stripe drops somebody after they've paid to skip the line.
//
// Deliberately NOT /welcome: the person reading this has no account yet and is
// not signed in — /welcome redirects to /login, which is a miserable thing to
// hit thirty seconds after handing over money. They can't be signed in either,
// because the way in is the emailed link, and the email is sent by the webhook.
//
// Which means this page has one job: say plainly that the payment worked, that
// the email is coming, and roughly when. The webhook usually beats the redirect
// but not always, so the copy never claims the email has already arrived.

export const metadata: Metadata = {
  title: "You're in — Deep Cut",
  robots: { index: false, follow: false },
};

export default function SeatedPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 text-center">
      <MarqueeBulbs />
      <p className="eyebrow mt-3">Box office</p>
      <h1 className="glow-amber mt-1 font-display text-5xl leading-[0.92] text-amber">
        YOU&apos;RE IN
      </h1>

      <p className="mt-4 text-base leading-relaxed text-cream">
        Payment went through and your seat is held. Your ticket link is on its
        way by email — usually within a minute.
      </p>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-left">
        <p className="eyebrow text-ticket">While you wait</p>
        <ul className="mt-2 flex flex-col gap-2 text-[0.85rem] leading-relaxed text-cream/90">
          <li className="flex gap-2">
            <span aria-hidden className="text-amber">
              1
            </span>
            <span>
              Check your inbox for <em>Your Deep Cut ticket is ready</em>. Have a
              look in spam — it&apos;s a first email from a new domain, which is
              exactly what spam filters are suspicious of.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-amber">
              2
            </span>
            <span>
              Open the link on the device you want to watch on. It signs you in;
              there&apos;s no password to make up.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-amber">
              3
            </span>
            <span>
              What you put in is already on the Fund&apos;s ledger, and the votes
              it earned are waiting in your account.
            </span>
          </li>
        </ul>
      </div>

      <p className="mt-4 font-mono text-[0.65rem] leading-relaxed text-dim">
        Nothing after ten minutes? Email{" "}
        <a className="text-amber" href="mailto:tickets@thedeepcut.xyz">
          tickets@thedeepcut.xyz
        </a>{" "}
        and we&apos;ll seat you by hand. You will not have to pay twice.
      </p>

      <Link
        href="/fund"
        className="mt-6 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-amber"
      >
        What your support is financing →
      </Link>
    </main>
  );
}
