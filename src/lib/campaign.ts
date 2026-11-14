import type { RoundStatus } from "./voting";

// What the house is asking people to do right now.
//
// One derivation, shared by the web banner, the app banner and the broadcast
// push, so all three say the same thing on the same day without anybody
// remembering to change three files. The round's status is the switch:
// while it's collecting we want scripts, while it's voting we want ballots.
//
// This is the whole point of deriving it rather than hard-coding a message.
// The failure mode we're avoiding is a "GO VOTE" banner pointing at an empty
// ballot — which is exactly what the site would have shown today, since the
// round exists with nothing in it yet.

export type CampaignKey = "submit" | "vote";

export interface Campaign {
  key: CampaignKey;
  eyebrow: string;
  title: string;
  line: string;
  cta: string;
  /** Path on the website. The app opens this in a browser when it has no
   *  native screen of its own for it. */
  path: string;
  /**
   * The same ask, sized for a lock screen.
   *
   * Separate strings rather than reusing `title`/`line`, because a
   * notification is read in a glance over something else — Android truncates
   * the body at around 40 characters collapsed, iOS at roughly two lines. The
   * banner's three sentences would arrive as a sentence and a half and an
   * ellipsis. Same voice, a third of the words.
   */
  pushTitle: string;
  pushBody: string;
}

// Written the way Griffin writes, which took two goes. The first draft said
// "no agent, no festival, no permission needed" and "which one gets financed
// is not our call, it's yours" — every line landing on a rhythm, which is
// what makes copy read as machine-written. The founder note next door works
// because it's plain and it's a person talking. Same register here: short
// sentences, ordinary words, no line arranged for the sound of it.

const SUBMIT: Campaign = {
  key: "submit",
  eyebrow: "Open call",
  title: "GOT A SCRIPT?",
  line: "This is for any independent filmmaker who wants to see their project through. We're putting real money into one film, and the people who use Deep Cut vote on which one. Send it over.",
  cta: "Send us your pitch",
  path: "/submit",
  pushTitle: "🎬 Open call",
  pushBody: "We're putting real money into one independent film. Got a script you want made? Send it over.",
};

const VOTE: Campaign = {
  key: "vote",
  eyebrow: "The ballot is open",
  title: "PICK THE ONE THAT GETS MADE",
  line: "We read every pitch that came in and narrowed it down to nine. Which one actually gets made is up to you.",
  cta: "Go vote",
  path: "/vote",
  pushTitle: "🗳 The ballot is open",
  pushBody: "We narrowed it down to nine films. Which one gets made is up to you.",
};

/**
 * The campaign for a round, or null for "don't ask for anything".
 *
 * `pitchCount` is not decoration: a round can sit in `voting` with nothing on
 * the ballot — a mis-set status, or every pitch pulled — and the honest answer
 * there is silence rather than sending people somewhere empty. Better to
 * promote nothing than to promote a blank page.
 */
export function campaignFor(
  status: RoundStatus | null | undefined,
  pitchCount = 0,
): Campaign | null {
  if (status === "collecting") return SUBMIT;
  if (status === "voting") return pitchCount > 0 ? VOTE : null;
  // greenlit and closed both mean the asking is over. So does no round at all.
  return null;
}
