// The AdSense publisher id, in the two shapes Google asks for it.
//
// Google uses the same number in two different spellings, and gets stroppy if
// you hand it the wrong one:
//
//   ca-pub-1234567890123456   the loader URL, data-ad-client, the ownership
//                             meta tag
//   pub-1234567890123456      ads.txt
//
// The dashboard shows the bare `pub-` form under Account information, which is
// the form a person will naturally copy — and pasting from a browser tends to
// bring a trailing newline with it. Both of those went into production once:
// the site reported the id as configured, ads.txt looked plausible, and the
// loader was asking Google about a client id it had never issued.
//
// So this module is deliberately forgiving about input and strict about
// output. Paste either spelling, with whatever whitespace, and every consumer
// gets the form it needs. Paste something that isn't a publisher id and it
// reads as unconfigured, which keeps the house ad up instead of emitting a
// broken tag.

/** Digits only — Google's are 16, but the length isn't ours to police. */
const PUB_ID = /^(?:ca-)?pub-(\d{10,24})$/;

function digits(raw: string | undefined): string | null {
  const m = PUB_ID.exec((raw ?? "").trim());
  return m ? m[1] : null;
}

const CLIENT_DIGITS = digits(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);

/** `ca-pub-…` for the loader script, the ad tag, and the ownership meta tag. */
export const ADSENSE_CLIENT: string | null = CLIENT_DIGITS ? `ca-pub-${CLIENT_DIGITS}` : null;

/** `pub-…` for ads.txt, which uses the bare form. */
export const ADSENSE_PUB: string | null = CLIENT_DIGITS ? `pub-${CLIENT_DIGITS}` : null;

/**
 * The numeric ad-unit id from the dashboard.
 *
 * Trimmed and digit-checked for the same reason as the publisher id: a slot
 * with a newline in it renders an advert-shaped hole and no error anybody
 * would notice.
 */
export const ADSENSE_SLOT: string | null = (() => {
  const v = (process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "").trim();
  return /^\d{6,24}$/.test(v) ? v : null;
})();

/**
 * Set, but not a publisher id we can use.
 *
 * Worth reporting separately from "not set". Both leave the house ad in place,
 * but only one of them means somebody has already done the work and needs to
 * hear that a character is wrong.
 */
export const ADSENSE_CLIENT_MALFORMED: boolean =
  !!(process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "").trim() && !CLIENT_DIGITS;

export const ADSENSE_SLOT_MALFORMED: boolean =
  !!(process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "").trim() && !ADSENSE_SLOT;
