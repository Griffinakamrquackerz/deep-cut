import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { getWaitlist, approveEmail, approveNext } from "@/lib/waitlist";

// The Door — admin view + controls for the velvet rope.
// GET lists the line; POST approves one email (skip-the-line) or the next N.

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const state = await getWaitlist();
  return NextResponse.json(state);
}

const Input = z.union([
  z.object({ email: z.string().trim().toLowerCase().email() }),
  z.object({ next: z.number().int().min(1).max(50) }),
]);

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if ("email" in parsed.data) {
    const res = await approveEmail(parsed.data.email);
    return res.ok
      ? NextResponse.json({ ok: true, approved: [parsed.data.email], note: res.note })
      : NextResponse.json({ error: res.note ?? "invite_failed" }, { status: 500 });
  }

  const res = await approveNext(parsed.data.next);
  return NextResponse.json({ ok: true, ...res });
}
