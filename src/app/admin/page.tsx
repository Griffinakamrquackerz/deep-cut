import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gatherStats } from "@/lib/admin-stats";
import AdminDashboard from "@/components/AdminDashboard";
import { type AdminUserRow } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

/** Personal admin console. Gated to the owner (see src/lib/admin.ts). */
export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) notFound(); // non-admins see a plain 404 — the console is invisible

  const db = supabaseAdmin();
  const [{ data: authList }, { data: profiles }, stats] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 200 }),
    db.from("users").select("id, handle, display_name, created_at"),
    gatherStats(),
  ]);

  const pMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as Record<string, unknown>]),
  );

  const users: AdminUserRow[] = (authList?.users ?? [])
    .map((u) => {
      const p = pMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        handle: (p?.handle as string | null) ?? null,
        displayName: (p?.display_name as string | null) ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        isSelf: u.id === admin.id,
      };
    })
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

  return <AdminDashboard stats={stats} users={users} adminEmail={admin.email ?? ""} />;
}
