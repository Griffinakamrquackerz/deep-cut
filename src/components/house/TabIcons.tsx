// The tab bar's icons, drawn in the house's own hand.
//
// These were emoji, which meant they were Apple's drawings on an iPhone,
// Google's on a Pixel and Microsoft's on a laptop — five different tab bars,
// none of them ours. One weight of line now, one colour (currentColor, so the
// active tab lights amber), and each one is the object the tab is named for.

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "tab-icon",
  "aria-hidden": true,
};

/** Mixtapes — a cassette. */
export function IconTape() {
  return (
    <svg {...base}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <rect x="6" y="8" width="12" height="6" rx="1" />
      <circle cx="9.3" cy="11" r="1.4" />
      <circle cx="14.7" cy="11" r="1.4" />
      <path d="M7 19l1.2-2.6h7.6L17 19" />
    </svg>
  );
}

/** Community — the popcorn box in the lobby. */
export function IconPopcorn() {
  return (
    <svg {...base}>
      <path d="M6.2 9.5 7.6 21h8.8l1.4-11.5" />
      <path d="M10.4 9.8 11 21M13.6 9.8 13 21" />
      <path d="M6 9.5a2.4 2.4 0 0 1 1.5-4.2 3 3 0 0 1 4.5-1.6 3 3 0 0 1 4.5 1.6A2.4 2.4 0 0 1 18 9.5z" />
    </svg>
  );
}

/** Tonight — the clapper. */
export function IconClapper() {
  return (
    <svg {...base} strokeWidth={1.8}>
      <path d="M3.5 10.5h17V20h-17z" />
      <path d="M3.5 10.5 4.4 6.8l15.9-3 .5 3.4z" />
      <path d="M8 6.1l2.3 3.6M12.4 5.3l2.3 3.6M16.6 4.5l2.2 3.4" />
    </svg>
  );
}

/** You — an admit-one ticket. */
export function IconTicket() {
  return (
    <svg {...base}>
      <path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4z" />
      <path d="M9.5 7v2M9.5 11v2M9.5 15v2" />
    </svg>
  );
}

/** Settings — the booth's switches. */
export function IconBooth() {
  return (
    <svg {...base}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7v5M15 12v5" />
      <circle cx="9" cy="14.5" r="1.7" />
      <circle cx="15" cy="9" r="1.7" />
    </svg>
  );
}
