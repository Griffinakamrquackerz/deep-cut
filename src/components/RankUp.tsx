"use client";
import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import { toast } from "@/lib/toast";
import { sfxChime, haptic } from "@/lib/sfx";

const KEY = "dc_rank_seen";

/**
 * Fires the promotion ceremony when the user's rank title changes since the
 * last visit: confetti, chime, buzz, and a marquee toast. Rank itself is
 * always recomputed from data — this only remembers what was celebrated.
 */
export default function RankUp({ rankTitle, glyph }: { rankTitle: string; glyph: string }) {
  const [confetti, setConfetti] = useState(0);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (seen === null) {
        // First visit: baseline silently, no ceremony for rank #1.
        localStorage.setItem(KEY, rankTitle);
        return;
      }
      if (seen !== rankTitle) {
        localStorage.setItem(KEY, rankTitle);
        sfxChime();
        haptic([40, 60, 40, 60, 80]);
        setConfetti((c) => c + 1);
        toast(`Promoted: ${glyph} ${rankTitle}`, { tone: "ticket", icon: "🎞" });
      }
    } catch {
      /* storage unavailable — skip the ceremony, never the rank */
    }
  }, [rankTitle, glyph]);

  return <Confetti trigger={confetti} />;
}
