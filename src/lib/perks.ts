// What a backer actually gets.
//
// Priced for a $250k-$1M feature, not a short. That distinction changes the
// ladder more than it looks: on a real budget, a credit has to cost something
// like what a credit costs. Hand out Executive Producer for $500 on a
// million-dollar picture and the credit is worthless — the people who actually
// financed it will say so, and rightly.
//
// Written the way a line producer would cost it. Credits cost nothing but a
// name in a crawl and mean more to people than anything else here, so they
// start early. Physical items carry real shipping, so they start higher than
// instinct suggests. Set visits cost a producer's day and an insurance rider,
// so they're scarce. Anything above the top tier is a conversation, not a
// checkout button — see the note at the bottom of this file.
//
// The important structural decision: PERKS KEEP SCALING PAST THE VOTE CAP.
// Votes are capped so the film isn't chosen by whoever is richest. Recognition
// isn't, because somebody who funds a tenth of the picture should be thanked
// like it. The cap is on power, not on gratitude — and saying that out loud is
// what stops the cap feeling like a punishment for generosity.

export interface Perk {
  /** Cents, inclusive floor. */
  minCents: number;
  /** What the tier is called on a poster and in the credits. */
  name: string;
  /** The credit as it would actually read on screen. */
  credit: string | null;
  /** Everything unlocked AT this tier (earlier tiers are implied). */
  adds: string[];
  /** One line of flavour, in the house voice. */
  line: string;
  /**
   * Does reaching this tier put an object in the post?
   *
   * Drives whether we ask for an address, and it is the difference between a
   * perk and an unfulfilled obligation. Experiences (a set visit, a premiere
   * seat, a call with the director) are deliberately NOT physical — they need a
   * guest list, not a courier.
   */
  physical?: boolean;
  /**
   * Flavour that depends on the goal, resolved at render.
   *
   * Exists for exactly one line: "ten percent of a feature" is true at a
   * $250,000 goal and false at a $1M one, and a boast that quietly becomes a
   * lie when somebody changes an env var is worse than no boast.
   */
  lineOf?: (goalCents: number) => string;
}

/** The tier's flavour line, in terms of the goal actually set. */
export function perkLine(p: Perk, goalCents: number): string {
  return p.lineOf ? p.lineOf(goalCents) : p.line;
}

export const PERKS: Perk[] = [
  {
    minCents: 500,
    name: "Ticket Holder",
    credit: null,
    adds: ["Votes on the next Deep Cut Original", "Production diary emails"],
    line: "Five dollars in the hat and you're in the room where it gets picked.",
  },
  {
    minCents: 2_500,
    name: "Backer",
    credit: "Special Thanks",
    adds: ["Your name in the end credits", "Backer badge on your profile"],
    line: "Your name goes on the picture. That's the whole point.",
  },
  {
    minCents: 10_000,
    name: "Supporter",
    credit: "Special Thanks",
    adds: [
      "The winning pitch deck, unedited",
      "Behind-the-scenes cut",
      "Digital download the day it releases",
    ],
    line: "Watch the film get built, from the deck that won to the rough assembly.",
  },
  {
    minCents: 25_000,
    name: "Associate",
    credit: "Special Thanks",
    adds: ["Enamel pin + sticker set", "Printed one-sheet poster"],
    physical: true,
    line: "Something for the jacket and something for the wall.",
  },
  {
    minCents: 50_000,
    name: "Patron",
    credit: "Special Thanks",
    adds: ["Signed one-sheet, cast and director", "Premiere invite — two seats"],
    physical: true,
    line: "Watch it for the first time in a room with the people who made it.",
  },
  {
    minCents: 100_000,
    name: "Co-Producer",
    credit: "Co-Producer",
    adds: [
      "Your name in the crawl, not the thanks — a real title card",
      "Virtual set visit, live from the shoot",
      "Every vote you earned, uncapped up to this point",
    ],
    line: "A credit, not a thank-you. This is where the ladder stops being merch.",
  },
  {
    minCents: 500_000,
    name: "Associate Producer",
    credit: "Associate Producer",
    // Bounded on purpose. "On-set visit, in person" with no limits is an
    // open-ended travel obligation to a location nobody has picked yet, on a
    // shoot that hasn't been scheduled — the kind of promise that is trivial to
    // make and expensive to honour. Naming who pays for the flight now costs
    // nothing; discovering it during production costs a relationship.
    adds: [
      "On-set visit, in person — one shoot day, travel and lodging your own",
      "A call with the director before the shoot",
      "Your name on the poster's billing block",
    ],
    line: "Stand on the set of a film you helped greenlight.",
  },
  {
    minCents: 2_500_000,
    name: "Executive Producer",
    credit: "Executive Producer",
    // Same reasoning as the tier below, and more so: "a screening in your city"
    // is an unbounded geographic promise — it commits the house to booking a
    // room anywhere on earth, indefinitely. One night, within a year of release,
    // in a room we can actually book is the same perk with an edge on it.
    adds: [
      "Executive Producer card, main titles",
      "A screening in your city — one night, within a year of release",
      "A screen-used prop from the film",
      "Dinner with the director and the producer",
    ],
    physical: true,
    // ── Why this doesn't say "share" ──
    //
    // It used to read "A serious share of a feature", with a computed "10
    // percent of a feature" underneath. That is the vocabulary of fractional
    // ownership — and it broke the rule this project states in its own code
    // (see FundBar.tsx): the words not used here are invest, equity, SHARE,
    // stake, returns, stock.
    //
    // The disclaimers on /fund are good and they were four screens away from
    // this line. A disclaimer doesn't cure a headline. What matters under
    // Howey is the whole economic impression, and "a serious share of a
    // feature" plus a percentage is the sentence a disappointed backer's
    // lawyer would read back.
    //
    // The magnitude is the true and impressive part, so it stays. What
    // changed is that it now describes what the money DOES rather than what
    // it buys you a piece of. Funding a tenth of a picture is a bigger thing
    // to say about a person than owning a tenth of one.
    line: "You are funding a serious piece of a feature. We are not going to be normal about it.",
    lineOf: (goal) => {
      // Rounded to whole percent and stated as a fraction when it gets small:
      // "3% of what it costs" is a worse sentence than "a thirtieth of it",
      // and the tier is meant to sound like standing, not like a cap table.
      const share = goal > 0 ? (2_500_000 * 100) / goal : 0;
      const phrase =
        share >= 9
          ? `${Math.round(share)} percent of what it costs to shoot it`
          : `a ${Math.round(100 / Math.max(share, 0.01))}th of what it costs to shoot it`;
      return `You are funding ${phrase}. We are not going to be normal about it.`;
    },
  },
];


/** The highest tier a total unlocks. Never null — a dollar clears the floor. */
export function tierFor(totalCents: number): Perk | null {
  let found: Perk | null = null;
  for (const p of PERKS) {
    if (totalCents >= p.minCents) found = p;
  }
  return found;
}

/** Every tier a total has unlocked, lowest first — the "you have" list. */
export function tiersUnlocked(totalCents: number): Perk[] {
  return PERKS.filter((p) => totalCents >= p.minCents);
}

/**
 * Is there something to put in the post for this member yet?
 *
 * The trigger for asking where they live. Deliberately asked only once a total
 * has actually cleared a physical tier: a delivery address collected from
 * somebody who is owed nothing is personal data held for no reason, and the
 * cheapest way to not mishandle an address is not to have it.
 */
export function needsAddress(totalCents: number): boolean {
  return tiersUnlocked(totalCents).some((p) => p.physical === true);
}

/** The cheapest tier that ships something — used to explain why we're asking. */
export function firstPhysicalTier(): Perk | null {
  return PERKS.find((p) => p.physical === true) ?? null;
}

/** The next tier up and what it costs to reach, for a nudge that isn't a nag. */
export function nextTier(
  totalCents: number,
): { perk: Perk; centsAway: number } | null {
  const next = PERKS.find((p) => totalCents < p.minCents);
  return next ? { perk: next, centsAway: next.minCents - totalCents } : null;
}
