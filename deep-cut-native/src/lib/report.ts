import { Alert, Platform } from "react-native";
import { api } from "./api";

// Reporting member-written content, in one place.
//
// The backend has accepted watch_note and playlist reports since the safety
// route was written. The app never filed either: report controls existed only
// on hot takes and member profiles, so the two kinds of free text that appear
// on the main Community feed — the line somebody writes about a film, and the
// note they attach to a mixtape — had no way to be reported at all. That is
// the Guideline 1.2 gap a reviewer finds first, because the Community tab is
// where they go looking for user-generated content.
//
// Extracted rather than copied a third time: TakesWall had this logic inline,
// and a fourth copy is how one of them ends up filing the wrong subject type.

export type ReportSubject =
  | "user"
  | "watch_note"
  | "playlist"
  | "avatar"
  | "hot_take"
  | "take_comment"
  | "external_read"
  | "other";

/**
 * Ask why, then file it.
 *
 * `onDone` lets a caller say "Reported" in its own house style; without one
 * this shows a plain alert, because silence after tapping report reads as the
 * button not working.
 */
export function reportContent(
  subjectType: ReportSubject,
  subjectId: string,
  opts?: { title?: string; onDone?: () => void },
): void {
  const title = opts?.title ?? "Report this";

  const file = async (reason: string) => {
    await api("/api/safety", {
      method: "POST",
      body: JSON.stringify({ action: "report", subjectType, subjectId, reason }),
    });
    if (opts?.onDone) opts.onDone();
    else Alert.alert("Reported", "We'll review it. 🚩");
  };

  if (Platform.OS === "ios") {
    // iOS gets a free-text reason; Android's Alert has no prompt variant, so
    // it files a generic one rather than offering a box that isn't there.
    Alert.prompt(title, "What's the problem? (spam, harassment, hateful…)", (reason) => {
      if (reason?.trim()) void file(reason.trim().slice(0, 500));
    });
  } else {
    Alert.alert(`${title}?`, "It will be flagged for review.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report", style: "destructive", onPress: () => void file("reported from app") },
    ]);
  }
}
