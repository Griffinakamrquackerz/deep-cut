// Safety primitives for App Store guideline 1.2: block users, report
// content. Zero-migration by design — stored as event rows (append-only,
// latest state wins for blocks), same pattern as profile styles. At current
// scale a per-request read is cheap; graduates to real tables later.

import { supabaseAdmin } from "./supabase/admin";

const BLOCK_EVENT = "user_block";
const REPORT_EVENT = "content_report";

/** Latest block/unblock action per target wins. */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin()
    .from("events")
    .select("props, created_at")
    .eq("user_id", userId)
    .eq("name", BLOCK_EVENT)
    .order("created_at", { ascending: true });
  const blocked = new Set<string>();
  for (const row of data ?? []) {
    const p = row.props as { target?: string; blocked?: boolean };
    if (!p?.target) continue;
    if (p.blocked) blocked.add(p.target);
    else blocked.delete(p.target);
  }
  return blocked;
}

export async function setBlocked(
  userId: string,
  targetId: string,
  blocked: boolean,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("events")
    .insert({ user_id: userId, name: BLOCK_EVENT, props: { target: targetId, blocked } });
  return !error;
}

export interface Report {
  subjectType:
    | "user"
    | "watch_note"
    | "playlist"
    | "avatar"
    | "hot_take"
    | "take_comment"
    | "external_read"
    | "other";
  subjectId: string;
  reason: string;
}

export async function fileReport(reporterId: string, report: Report): Promise<boolean> {
  const { error } = await supabaseAdmin().from("events").insert({
    user_id: reporterId,
    name: REPORT_EVENT,
    props: {
      subject_type: report.subjectType,
      subject_id: report.subjectId,
      reason: report.reason.slice(0, 500),
    },
  });
  return !error;
}
