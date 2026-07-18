"use client";
import { useState } from "react";
import { sfxPop, haptic } from "@/lib/sfx";
import { toast } from "@/lib/toast";

/** Optimistic follow/unfollow toggle, usable anywhere a user appears. */
export default function FollowButton({
  userId,
  initiallyFollowing,
  size = "sm",
}: {
  userId: string;
  initiallyFollowing: boolean;
  size?: "sm" | "lg";
}) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    sfxPop();
    haptic(15);
    setBusy(true);
    const next = !following;
    setFollowing(next);
    if (next) toast("Now following", { tone: "avail", icon: "★" });
    const res = await fetch("/api/follows", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) setFollowing(!next); // roll back on failure
    setBusy(false);
  }

  const base =
    size === "lg"
      ? "rounded px-4 py-2 font-mono text-xs uppercase tracking-widest"
      : "rounded px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider";

  return (
    <button
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={following}
      className={`${base} border transition-colors disabled:opacity-50 ${
        following
          ? "border-line text-dim"
          : "border-ticket text-ticket glow-ticket"
      }`}
    >
      {following ? "following ✓" : "+ follow"}
    </button>
  );
}
