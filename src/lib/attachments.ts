import type { SupabaseClient } from "@supabase/supabase-js";

// Files attached to a pitch.
//
// The original rule was "links, never uploads", and the reasoning was sound:
// every working director already has a deck on Drive and a reel on Vimeo, and
// hosting other people's films is a takedown problem with no upside.
//
// That rule holds for VIDEO and is unchanged — reels are still links, because a
// raw master is gigabytes and Vimeo is better at serving it than we will ever
// be. It does not hold for a PDF. The person this door was opened for is a
// first-time director with a script and a one-sheet on a laptop and no Drive
// habit, and "go and host this somewhere first" is precisely the step where
// they close the tab.
//
// So: documents and images can be uploaded, video stays a link, and everything
// lands in a PRIVATE bucket that is only ever read through a short-lived signed
// URL generated for the admin console.

export const ATTACH_BUCKET = "submissions";

/** 100MB. A screenplay is under 2MB; a deck with stills runs 20–60MB. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Enough for a script, a deck, a one-sheet and two spares. */
export const MAX_ATTACHMENTS = 5;

/**
 * What a pitch may carry.
 *
 * Video is absent on purpose rather than by oversight — see the note above.
 * Kept in step with the bucket's allowed_mime_types in migration 0021; the
 * bucket is the real enforcement and this list is the friendly half.
 */
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "application/rtf": "rtf",
  "application/zip": "zip",
};

export interface Attachment {
  /** Path inside the private bucket. Never a URL — see signAttachments. */
  path: string;
  /** What the director called it, for the admin console to show. */
  name: string;
  size: number;
  type: string;
}

/**
 * A safe object name.
 *
 * The director's filename is used for display only and never for the path: a
 * name arriving from a browser can contain slashes, dots and unicode that mean
 * something to a storage layer, and the fix is to not let it near one.
 */
export function attachmentPath(cycle: string, email: string, type: string): string {
  const ext = ALLOWED_TYPES[type] ?? "bin";
  const who = email.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cycle}/${who}/${Date.now()}-${rand}.${ext}`;
}

/** Trim a filename to something a console can print without wrapping badly. */
export function displayName(raw: string): string {
  const cleaned = raw.replace(/[\r\n\t]/g, " ").trim();
  return (cleaned || "attachment").slice(0, 120);
}

export function isAllowed(type: string, size: number): boolean {
  return !!ALLOWED_TYPES[type] && size > 0 && size <= MAX_ATTACHMENT_BYTES;
}

/** Parse whatever came back out of the jsonb column, defensively. */
export function toAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    if (typeof o.path !== "string" || o.path === "") return [];
    return [
      {
        path: o.path,
        name: typeof o.name === "string" ? o.name : "attachment",
        size: typeof o.size === "number" ? o.size : 0,
        type: typeof o.type === "string" ? o.type : "",
      },
    ];
  });
}

/**
 * Turn stored paths into links the admin console can actually open.
 *
 * One hour, generated at read time. The alternative — a public bucket — would
 * mean an unreleased screenplay sitting on a guessable URL forever, which is
 * the single worst thing this feature could do to somebody who trusted it.
 */
export async function signAttachments(
  db: SupabaseClient,
  items: Attachment[],
  seconds = 3600,
): Promise<Array<Attachment & { url: string | null }>> {
  if (items.length === 0) return [];
  const signed = await Promise.all(
    items.map(async (a) => {
      const { data } = await db.storage
        .from(ATTACH_BUCKET)
        .createSignedUrl(a.path, seconds)
        .catch(() => ({ data: null }));
      return { ...a, url: data?.signedUrl ?? null };
    }),
  );
  return signed;
}

/** Human file size, for a form that has to say "that one's too big". */
export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
