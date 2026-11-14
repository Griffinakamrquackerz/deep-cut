import type { Metadata } from "next";
import Link from "next/link";
import Doorway from "@/components/site/Doorway";

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
    <Doorway
      reel="Box office"
      slate="Paid in full"
      title={
        <>
          You&apos;re <em>in.</em>
        </>
      }
      lede={
        <>
          Payment went through and your seat is held. Your ticket link is on its way by email —
          usually within a minute.
        </>
      }
    >
      <div className="lp-doorway-card">
        <p className="eyebrow text-ticket">While you wait</p>
        <ul className="mt-3 flex flex-col gap-3 text-[0.9rem] leading-relaxed text-cream/90">
          <li className="flex gap-3">
            <span aria-hidden className="font-display text-2xl leading-none text-amber">
              1
            </span>
            <span>
              Check your inbox for <em>Your Deep Cut ticket is ready</em>. Have a
              look in spam — it&apos;s a first email from a new domain, which is
              exactly what spam filters are suspicious of.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="font-display text-2xl leading-none text-amber">
              2
            </span>
            <span>
              Open the link on the device you want to watch on. It signs you in;
              there&apos;s no password to make up.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="font-display text-2xl leading-none text-amber">
              3
            </span>
            <span>
              What you put in is already on the Fund&apos;s ledger, and the votes
              it earned are waiting in your account.
            </span>
          </li>
        </ul>
      </div>

      <p className="mt-5 text-center font-mono text-[0.65rem] leading-relaxed text-dim">
        Nothing after ten minutes? Email{" "}
        <a className="text-amber" href="mailto:tickets@thedeepcut.xyz">
          tickets@thedeepcut.xyz
        </a>{" "}
        and we&apos;ll seat you by hand. You will not have to pay twice.
      </p>

      <p className="mt-5 text-center">
        <Link href="/fund" className="lp-link">
          What your support is financing
        </Link>
      </p>
    </Doorway>
  );
}
