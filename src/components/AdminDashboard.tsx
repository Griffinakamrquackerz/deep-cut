"use client";
import { useState } from "react";
import AdminOverview from "@/components/AdminOverview";
import AdminMoney from "@/components/AdminMoney";
import AdminUsers, { type AdminUserRow } from "@/components/AdminUsers";
import AdminDoor from "@/components/AdminDoor";
import AdminDemoAccount from "@/components/AdminDemoAccount";
import AdminTheatre from "@/components/AdminTheatre";
import AdminGreenlight from "@/components/AdminGreenlight";
import AdminAnnounce from "@/components/AdminAnnounce";
import AdminPile from "@/components/AdminPile";
import type { AdminStats } from "@/lib/admin-stats";

type Tab = "overview" | "money" | "members" | "door" | "theatre" | "greenlight" | "pile";

/** The Projection Booth — Deep Cut's owner console. */
export default function AdminDashboard({
  stats,
  users,
  adminEmail,
  searchConfigured,
}: {
  stats: AdminStats;
  users: AdminUserRow[];
  adminEmail: string;
  searchConfigured: { vimeo: boolean; youtube: boolean };
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <section className="flex flex-col gap-4 px-4 py-8">
      <header>
        <p className="eyebrow">Admin console</p>
        <h1 className="glow-amber font-display text-4xl text-amber">THE PROJECTION BOOTH</h1>
        <p className="mt-1 font-mono text-[0.65rem] text-dim">
          Signed in as {adminEmail} · {stats.members.total} member
          {stats.members.total === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex flex-wrap gap-1 rounded border border-line bg-surface p-1">
        {(["overview", "money", "members", "door", "theatre", "greenlight", "pile"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded px-2 py-2 font-mono text-[0.65rem] uppercase tracking-widest ${
              tab === t ? "bg-bg text-amber" : "text-dim"
            }`}
          >
            {t === "overview"
              ? "📊 Overview"
              : t === "money"
                ? "💳 Money"
                : t === "members"
                  ? `👥 Members (${users.length})`
                  : t === "door"
                    ? "🚪 Door"
                    : t === "theatre"
                      ? "🎬 Theatre"
                      : t === "greenlight"
                        ? "🎞 Greenlight"
                        : "📥 The pile"}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <AdminOverview stats={stats} />
      ) : tab === "money" ? (
        <AdminMoney money={stats.money} />
      ) : tab === "members" ? (
        <AdminUsers users={users} adminEmail={adminEmail} />
      ) : tab === "door" ? (
        // The review account sits with the door because both are about who
        // gets let in.
        <div className="flex flex-col gap-8">
          <AdminDemoAccount />
          <AdminDoor />
        </div>
      ) : tab === "theatre" ? (
        <AdminTheatre vimeoSearch={searchConfigured.vimeo} youtubeSearch={searchConfigured.youtube} />
      ) : tab === "greenlight" ? (
        // The announcement lives with the round because it IS the round's
        // current ask — sending it is the last step of opening one, not a
        // separate errand.
        <div className="flex flex-col gap-8">
          <AdminAnnounce />
          <AdminGreenlight />
        </div>
      ) : (
        <AdminPile />
      )}
    </section>
  );
}
