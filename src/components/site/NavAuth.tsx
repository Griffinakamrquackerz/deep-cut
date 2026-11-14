"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// The right-hand end of the site nav.
//
// The public pages (/fund, /vote, /submit, the legal pair) are static, and
// asking the server who's looking would make every one of them dynamic for
// the sake of two links. So the server renders the stranger's version — sign
// in, and the way to join — and this swaps it for a way back into the house
// once it can see a session cookie. Presence only: the cookie isn't read or
// trusted for anything, and a stale one costs a link that bounces to /login.

export default function NavAuth({ cta }: { cta: { href: string; label: string } }) {
  const [member, setMember] = useState(false);
  useEffect(() => {
    setMember(/(?:^|;\s*)sb-[^=]*auth-token/.test(document.cookie));
  }, []);

  if (member) {
    return (
      <div className="lp-nav-right">
        <Link href="/" className="lp-btn lp-btn--ghost lp-nav-cta lp-nav-cta--always">
          Back to the house <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="lp-nav-right">
      <Link href="/login" className="lp-nav-signin">
        Sign in
      </Link>
      <a href={cta.href} className="lp-btn lp-btn--ticket lp-nav-cta">
        {cta.label}
      </a>
    </div>
  );
}
