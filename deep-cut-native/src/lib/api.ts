import { CONFIG } from "./config";
import { supabase } from "./supabase";

// All calls to the Deep Cut backend (the deployed Next.js app) go through
// here. Auth rides as `Authorization: Bearer <access_token>` — the backend's
// currentUser() validates it (see ../src/lib/supabase/server.ts).
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  try {
    const res = await fetch(`${CONFIG.apiBaseUrl}${path}`, { ...init, headers });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null }; // network failure
  }
}
