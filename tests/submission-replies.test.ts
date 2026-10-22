import { describe, expect, it } from "vitest";
import { countOwed } from "../src/lib/submission-replies";

// The promise these guard is printed in every submitter's receipt: "you'll hear
// back either way. A pass is still an answer, and not hearing anything is the
// thing everyone hates about submitting." Before this, marking a submission
// passed or showcased changed a column and told nobody.

const sub = (status: string, repliedAt: string | null = null) => ({ status, repliedAt });
const NOW = "2026-09-02T00:00:00.000Z";

describe("what the house owes filmmakers", () => {
  it("counts decided submissions nobody has been told about", () => {
    expect(
      countOwed([sub("passed"), sub("showcased"), sub("passed", NOW)]),
    ).toBe(2);
  });

  it("owes nothing for submissions still being read", () => {
    // A director whose film is still under consideration is not waiting on an
    // answer we've already reached — chasing those would be noise, and noise
    // is how a real queue gets ignored.
    expect(countOwed([sub("new"), sub("read")])).toBe(0);
  });

  it("stops owing once the reply has gone", () => {
    expect(countOwed([sub("passed", NOW), sub("showcased", NOW)])).toBe(0);
  });

  it("is zero on an empty pile rather than undefined", () => {
    // Rendered directly into the console header, so a NaN or undefined here
    // shows as a broken number to the one person who has to act on it.
    expect(countOwed([])).toBe(0);
  });

  it("still owes a reply when a send failed", () => {
    // sendSubmissionReply writes replied_at only AFTER the email succeeds, so a
    // bounce leaves it null and the submission stays in the count. The other
    // order would mark somebody told when they never were, which is exactly
    // the silence this exists to prevent.
    expect(countOwed([sub("passed", null)])).toBe(1);
  });
});
