// The terms a filmmaker agrees to when they hand in a pitch.
//
// The submissions door opened before this existed, which meant Deep Cut was
// taking loglines, synopses, decks and prior work from strangers with nothing
// written down about what happens to them. That is the one place this project
// could acquire a problem it cannot code its way out of: an unsolicited-material
// claim ("you made my film") does not need to be true to be expensive, and the
// standard defence is a release the submitter accepted before sending.
//
// Written in the house voice rather than in legalese on purpose. A filmmaker who
// cannot understand the terms has not really agreed to them, and this audience
// is the one being asked to trust an unknown platform with an unmade film. Every
// clause below is ordinary for open submissions — nothing here takes rights,
// takes money, or takes an option.
//
// NOT a substitute for a lawyer reading it. It is a great deal better than the
// nothing that was here yesterday, and the hour with counsel is still worth it
// before this sees real volume.

/**
 * Bumped whenever the wording below changes in a way that alters what somebody
 * agreed to. Stored on the submission row so a pitch from March can be shown
 * against the terms that were on screen in March, rather than today's.
 */
export const SUBMISSION_TERMS_VERSION = "2026-09-02";

export interface TermsClause {
  /** The promise, as a filmmaker would summarise it to themselves. */
  h: string;
  /** What it actually means, in one or two sentences. */
  p: string;
}

export const SUBMISSION_TERMS: TermsClause[] = [
  {
    h: "You keep your film",
    p: "Submitting transfers nothing. You own your script, your footage and your idea before you send it and you own all of it afterwards. If a film is ever financed here, that happens in a separate written agreement that you read and sign — nothing on this page is that agreement, and nothing on this page options anything.",
  },
  {
    h: "We read it, and we owe you an answer",
    p: "Somebody here reads the whole thing and watches your previous work. You get a yes or a no either way. That is the only obligation we take on: we are not promising to make your film, to put it on the ballot, or to explain a pass.",
  },
  {
    h: "It isn't confidential, and that cuts both ways",
    p: "We read a lot of pitches and we may already be developing, or may later receive, something that resembles yours. Sending us a pitch doesn't create a confidential relationship and doesn't entitle you to anything if we end up making something similar that we didn't take from you. Don't send us anything you need kept secret — if a project is sensitive, send the logline and hold the script.",
  },
  {
    h: "What we do with it if you make the slate",
    p: "If your pitch is one of the ones showcased, you're telling us we can show it to our members: title, logline, your name, your one-sheet, and links to your deck and previous work, on the public ballot for that round and in our record of it afterwards. Nothing else gets published, and your email address is never shown.",
  },
  {
    h: "It has to be yours to send",
    p: "You're confirming the work is yours, that you have the rights to submit it, and that it doesn't infringe anybody else's. If it isn't yours, that's on you rather than on us.",
  },
  {
    h: "You can pull it out",
    p: "Email us any time before your pitch is showcased and it comes out of the pile. Once a round is live and members are voting on it, it stays up until that round closes.",
  },
  {
    h: "There is no fee, at any point",
    p: "Not to submit, not to be read, not to be showcased, not to win. If anyone ever asks you for money on our behalf, it isn't us.",
  },
  {
    h: "Your email is for one thing",
    p: "Telling you where your pitch stands. It doesn't go on a marketing list and it doesn't get sold.",
  },
];

/** One-line version for the checkbox itself. */
export const SUBMISSION_TERMS_SUMMARY =
  "You keep every right to your film, we owe you a read and an answer, and submissions aren't confidential.";
