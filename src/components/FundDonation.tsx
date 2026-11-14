"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function FundDonation() {
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [returned, setReturned] = useState(false);

  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).get("support") === "complete");
  }, []);

  async function donate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter an amount in dollars, with no more than two decimal places.");
      return;
    }
    const [dollars, cents = ""] = amount.split(".");
    const amountCents = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
    if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 99_999_999) {
      setError("Enter an amount from $1 to $999,999.99.");
      return;
    }
    setBusy(true);
    setError(null);
    setSignIn(false);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "donation", amountCents }),
      });
      const data = (await res.json()) as { url?: string };
      if (res.status === 401) {
        setSignIn(true);
        setError("Sign in before making a donation.");
      } else if (res.status === 503) {
        setError("Donations are not available right now.");
      } else if (!res.ok || !data.url) {
        setError("Could not open checkout. Please try again.");
      } else {
        window.location.href = data.url;
        return;
      }
    } catch {
      setError("Could not reach checkout. Please try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={donate} className="lp-panel" style={{ marginTop: "2rem" }}>
      <h3 className="lp-h3">Give a little <em>extra.</em></h3>
      <p className="lp-prose" style={{ marginTop: "0.75rem" }}>
        Make an optional one-time donation alongside a subscription or on its own.
        Each whole dollar in your current-round total earns a vote and counts toward the perk tiers.
        A donation over $4 also gives you 30 days of premium.
      </p>
      {returned && (
        <p role="status" className="lp-note" style={{ marginTop: "0.75rem" }}>
          Thanks for supporting the fund. Votes and eligible premium appear after Stripe confirms
          your payment. <Link href="/vote" className="lp-link">Go to the ballot</Link>
        </p>
      )}
      <label htmlFor="fund-donation" className="lp-mono">One-time amount in USD</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.5rem" }}>
        <input id="fund-donation" type="text" inputMode="decimal" value={amount}
          onChange={(event) => setAmount(event.target.value)} required
          className="rounded border border-line bg-bg px-3 py-2 text-cream" />
        <button type="submit" disabled={busy} className="lp-btn lp-btn--amber">
          {busy ? "Opening checkout…" : "Donate once"}
        </button>
      </div>
      {error && <p role="alert" style={{ marginTop: "0.5rem" }}>
        {error} {signIn && <Link href="/login" className="lp-link">Sign in</Link>}
      </p>}
      <p className="lp-note" style={{ marginTop: "0.75rem" }}>
        One-time payment, not a subscription. Donation premium runs alongside any existing
        subscription or lifetime access; it does not change your billing.
      </p>
    </form>
  );
}
