import type { User } from "@supabase/supabase-js";
import { currentUser } from "@/lib/supabase/server";

// Personal admin gate. Defaults to the owner; override with ADMIN_EMAILS
// (comma-separated) in env if the team grows.
const DEFAULT_ADMINS = ["griffin@hostfluencer.com"];

export function adminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS;
  const list = env
    ? env
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ADMINS;
  return list.length ? list : DEFAULT_ADMINS;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

/** The current user iff they're an admin, else null. Use to gate admin pages/APIs. */
export async function requireAdmin(): Promise<User | null> {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
