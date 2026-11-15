// The green band.
//
// Every trailer ever cut opens on a card saying who it has been approved for.
// This is that card. On the front page it is worded exactly as the real one
// is ("approved for all audiences"); on Tonight it approves the deal for your
// taste only, which is simply what a deal is.
//
// The band is the one piece of film furniture everybody recognises without
// being told, so it says "something is about to be shown to you" faster than a
// heading can. That recognition is the whole joke. The box under it carries
// plain facts — how many films, how deep the dial is set — and nothing that
// is trying to be funny: a gag in the fine print is one joke too many.

export default function RatingBand({
  what,
  audience,
  code = "DC",
  label,
  fine,
  compact = false,
}: {
  /** "The following ___ has been approved for" */
  what: string;
  audience: string;
  /** The rating, in the box. */
  code?: string;
  label: string;
  fine: string;
  compact?: boolean;
}) {
  return (
    <aside className={`rating-band ${compact ? "rating-band--compact" : ""}`}>
      <p className="rating-band-top">
        The following <b>{what}</b> has been approved for
      </p>
      <p className="rating-band-aud">{audience}</p>
      <p className="rating-band-by">by the house of Deep Cut</p>
      <div className="rating-band-box">
        <span className="rating-band-code" aria-hidden>
          {code}
        </span>
        <span className="rating-band-detail">
          <b>{label}</b>
          <span>{fine}</span>
        </span>
      </div>
    </aside>
  );
}
