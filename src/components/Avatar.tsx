/* Member photo with a ticket-booth fallback (initial on an amber ring). */

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-base",
  lg: "h-16 w-16 text-2xl",
} as const;

export default function Avatar({
  url,
  name,
  size = "md",
  className = "",
}: {
  url: string | null | undefined;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = (name.replace(/^@/, "")[0] ?? "?").toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${name}'s photo`}
        loading="lazy"
        decoding="async"
        className={`${SIZES[size]} shrink-0 rounded-full border border-amber/50 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full border border-amber/50 bg-surface font-display text-amber ${className}`}
    >
      {initial}
    </span>
  );
}
