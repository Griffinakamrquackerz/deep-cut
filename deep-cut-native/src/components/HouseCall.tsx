import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { colors, fonts, glowAmber } from "@/lib/theme";

// The house call — native port of ../src/components/HouseCall.tsx.
//
// Named HouseCall rather than Marquee because ui.tsx already exports a
// Marquee (the big display text at the top of a screen), and two different
// components under one name in one app is a trap for whoever reads it next.
//
// The one thing the house is asking of you today, derived from the round's
// status so the app and the site always agree: while the round is collecting
// we want scripts, while it's voting we want ballots. Nothing when there's no
// round, and nothing when a round is somehow in `voting` with an empty ballot
// — better to promote nothing than to send somebody to a blank page.
//
// Shows to MEMBERS TOO, unlike AdSlot. Paying removes advertising, not house
// business; the ballot being open is news, not an advert.
//
// The two destinations are reached differently on purpose:
//   vote   → the app's own /vote screen
//   submit → the website, in a browser sheet
// A pitch submission is a form with file uploads and a terms agreement, and
// there is no native screen for it. Both are free actions, so neither is a
// purchase being steered off-platform.

type RoundStatus = "collecting" | "voting" | "greenlit" | "closed";
type CampaignKey = "submit" | "vote";

interface Campaign {
  key: CampaignKey;
  eyebrow: string;
  title: string;
  line: string;
  cta: string;
  path: string;
}

// Kept identical to lib/campaign.ts on the web. If one changes, change both:
// a filmmaker reading the same house on two screens should be read the same
// sentence.
const SUBMIT: Campaign = {
  key: "submit",
  eyebrow: "Open call",
  title: "GOT A SCRIPT?",
  line: "This is for any independent filmmaker who wants to see their project through. We're putting real money into one film, and the people who use Deep Cut vote on which one. Send it over.",
  cta: "Send us your pitch",
  path: "/submit",
};

const VOTE: Campaign = {
  key: "vote",
  eyebrow: "The ballot is open",
  title: "PICK THE ONE THAT GETS MADE",
  line: "We read every pitch that came in and narrowed it down to nine. Which one actually gets made is up to you.",
  cta: "Go vote",
  path: "/vote",
};

function campaignFor(status: RoundStatus | null | undefined, pitchCount: number): Campaign | null {
  if (status === "collecting") return SUBMIT;
  if (status === "voting") return pitchCount > 0 ? VOTE : null;
  return null;
}

const DISMISS_PREFIX = "dc-housecall-dismissed:";

export default function HouseCall({ style }: { style?: object }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [dismissed, setDismissed] = useState(true); // hidden until storage says otherwise

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await api<{ round?: { status?: RoundStatus } | null; pitches?: unknown[] }>(
        "/api/round",
      );
      // api() swallows network failures into ok:false rather than throwing,
      // so there is nothing to catch here — an unreachable house just means
      // no house call.
      if (!res.ok || !res.data) return;
      const next = campaignFor(res.data.round?.status, res.data.pitches?.length ?? 0);
      if (!alive || !next) return;
      const seen = await AsyncStorage.getItem(DISMISS_PREFIX + next.key).catch(() => null);
      if (!alive) return;
      setCampaign(next);
      setDismissed(seen === "1");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!campaign || dismissed) return null;

  const hide = () => {
    void Haptics.selectionAsync();
    setDismissed(true);
    // Per campaign, not forever: dismissing the call for scripts must not
    // silently hide the vote three months later.
    AsyncStorage.setItem(DISMISS_PREFIX + campaign.key, "1").catch(() => {});
  };

  const go = () => {
    void Haptics.selectionAsync();
    if (campaign.key === "vote") {
      router.push("/vote");
      return;
    }
    // Linking.openURL, NOT WebBrowser.openBrowserAsync.
    //
    // openBrowserAsync is SFSafariViewController — an in-app sheet. /submit
    // links on to /fund, which renders the skip-the-line widget and reaches
    // Stripe in one more tap, and supporting the fund unlocks in-app features
    // (votes, no ads). So an in-app browser put a checkout for digital
    // content two taps inside the app, which is what 3.1.1 is about. Handing
    // the URL to the system browser leaves the app entirely, which is the
    // materially better posture — and `?from=app` tells the page to drop its
    // /fund link so the path isn't there at all.
    void Linking.openURL(`${CONFIG.apiBaseUrl}${campaign.path}?from=app`).catch(() => {});
  };

  return (
    <View style={[styles.card, style]}>
      <Pressable style={styles.close} onPress={hide} hitSlop={10} accessibilityLabel="Dismiss">
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{campaign.eyebrow.toUpperCase()}</Text>
      <Text style={[styles.title, glowAmber]}>{campaign.title}</Text>
      <Text style={styles.line}>{campaign.line}</Text>
      <Pressable style={styles.cta} onPress={go}>
        <Text style={styles.ctaText}>{campaign.cta} →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.amber,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
  },
  close: { position: "absolute", right: 6, top: 4, padding: 8, zIndex: 1 },
  closeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.dim },
  eyebrow: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, color: colors.dim },
  title: {
    marginTop: 4,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 30,
    color: colors.amber,
  },
  line: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.dim,
  },
  cta: {
    marginTop: 14,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  ctaText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.amber,
  },
});
