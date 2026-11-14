import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentCycle } from "@/lib/fund";
import {
  ATTACH_BUCKET,
  MAX_ATTACHMENT_BYTES,
  isAllowed,
  attachmentPath,
  humanSize,
} from "@/lib/attachments";

// Mint a one-shot upload URL for a pitch attachment.
//
// The file never passes through this app, and that is the whole reason this
// route exists rather than a plain multipart POST: a serverless function body
// tops out around 4.5MB, which would put the ceiling below a single deck with
// stills in it. A signed upload URL is authorised here, spent once by the
// browser directly against storage, and cannot be reused or pointed at another
// object.
//
// Public and account-free, matching /api/submit. The door was opened for people
// without agents; requiring a login to attach a script would quietly close it
// again. The exposure that creates is bounded by three things: the type and
// size are checked before a URL is issued, the bucket enforces both again
// server-side, and the path is generated here rather than accepted.

export const dynamic = "force-dynamic";

const Input = z.object({
  email: z.string().trim().email().max(200),
  type: z.string().trim().max(200),
  size: z.number().int().positive(),
  /** Honeypot, same as the form itself. */
  hp: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { email, type, size, hp } = parsed.data;

  if (hp && hp.trim() !== "") {
    // Same posture as the form: accept, issue nothing, say nothing useful.
    return NextResponse.json({ error: "rejected" }, { status: 400 });
  }

  if (!isAllowed(type, size)) {
    return NextResponse.json(
      {
        error: "not_allowed",
        note:
          size > MAX_ATTACHMENT_BYTES
            ? `That file is ${humanSize(size)} — the limit is ${humanSize(MAX_ATTACHMENT_BYTES)}. For anything bigger, paste a link instead.`
            : "That file type isn't one we take. PDFs, documents, and images — reels go in as links.",
      },
      { status: 400 },
    );
  }

  const path = attachmentPath(currentCycle(), email, type);

  const { data, error } = await supabaseAdmin()
    .storage.from(ATTACH_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    // Overwhelmingly the bucket not existing yet.
    return NextResponse.json(
      {
        error: "upload_unavailable",
        note: "Run supabase/migrations/0021_delivery_and_attachments.sql.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ path, token: data.token, bucket: ATTACH_BUCKET });
}
