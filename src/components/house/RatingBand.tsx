// The green band.
//
// Every trailer ever cut opens on a card saying who it has been approved for.
// This is that card, approving things for narrower audiences: a double
// feature for people who stay through the credits, tonight's deal for your
// taste and nobody else's.
//
// It is a joke with a job. The band is the one piece of film furniture
// everybody recognises without being told, so it says "something is about to
// be shown to you" faster than a heading can.

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
