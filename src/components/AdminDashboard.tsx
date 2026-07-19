"use client";
import { useState } from "react";
import AdminOverview from "@/components/AdminOverview";
import AdminMoney from "@/components/AdminMoney";
import AdminUsers, { type AdminUserRow } from "@/components/AdminUsers";
import type { AdminStats } from "@/lib/admin-stats";

type Tab = "overview" | "money" | "members";

/** The Projection Booth — Deep Cut's owner console. */
export default function AdminDashboard({
  stats,
  users,
  adminEmail,
}: {
  stats: AdminStats;
  users: AdminUserRow[];
  adminEmail: string;
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

      <div className="flex gap-1 rounded border border-line bg-surface p-1">
        {(["overview", "money", "members"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest ${
              tab === t ? "bg-bg text-amber" : "text-dim"
            }`}
          >
            {t === "overview" ? "📊 Overview" : t === "money" ? "💳 Money" : `👥 Members (${users.length})`}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <AdminOverview stats={stats} />
      ) : tab === "money" ? (
        <AdminMoney money={stats.money} />
      ) : (
        <AdminUsers users={users} adminEmail={adminEmail} />
      )}
    </section>
  );
}
