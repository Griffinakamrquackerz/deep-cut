import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gatherStats } from "@/lib/admin-stats";
import { searchConfigured } from "@/lib/video-search";
import AdminDashboard from "@/components/AdminDashboard";
import { type AdminUserRow } from "@/components/AdminUsers";

export const dynamic = "force-dynamic";

/** Personal admin console. Gated to the owner (see src/lib/admin.ts). */
export default async function AdminPage() {
  const admin = await currentUser();
  // Signed out is not the same as "not allowed". Both used to 404, which made
  // the console unreachable from any link opened outside a logged-in browser —
  // the door alert's own button included. Send them through login and back.
  if (!admin) redirect("/login?next=/admin");
  // Signed in and still not an admin: a plain 404 keeps the console invisible
  // to members, which is the case that gate was actually written for.
  if (!isAdminEmail(admin.email)) notFound();

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

  return (
    <AdminDashboard
      stats={stats}
      users={users}
      adminEmail={admin.email ?? ""}
      searchConfigured={searchConfigured()}
    />
  );
}
