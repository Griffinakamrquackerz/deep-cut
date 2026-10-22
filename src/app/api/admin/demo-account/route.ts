import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { demoState, provisionDemoAccount } from "@/lib/demo-account";

// The App Review account, provisioned from a screen.
//
// GET  → what state it's in and exactly what's missing.
// POST → create or repair it, with confirm:true.
//
// Admin only, and the password is returned exactly once — on the call that
// sets it. Nothing stores it in plain text anywhere, so if it's lost the fix
// is to run this again and get a new one.

export const dynamic = "force-dynamic";
// Fetches a dozen films from TMDB and then makes an LLM call to deal a night.
// The default budget isn't enough, and a timeout here leaves a half-built
// account that reads as ready.
export const maxDuration = 300;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await demoState());
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean;
    /** Set your own instead of a generated one. */
    password?: string;
  };

  // Provisioning resets the password on an existing account, which would lock
  // App Review out mid-review if it happened by accident.
  if (!body.confirm) {
    return NextResponse.json(
      { error: "not_confirmed", note: "Send confirm:true. This resets the password if the account already exists." },
      { status: 400 },
    );
  }

  if (body.password && body.password.trim().length < 12) {
    return NextResponse.json(
      { error: "weak_password", note: "Use at least 12 characters, or leave it out and one will be generated." },
      { status: 400 },
    );
  }

  try {
    const result = await provisionDemoAccount(body.password);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 500 });
  }
}
