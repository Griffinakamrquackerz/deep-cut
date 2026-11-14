import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { castBallot } from "@/lib/voting";
import { track } from "@/lib/analytics";

// Spend your votes.
//
// The request carries the allocation you want to END UP with, not a delta, so
// saving twice is the same as saving once. The budget is never taken from the
// request — it's derived from the fund ledger inside castBallot, because a vote
// budget is precisely the number a browser would like to invent.

export const dynamic = "force-dynamic";

const Input = z.object({
  // pitch id → votes. Anything at 0 or missing is a withdrawal.
  allocation: z.record(z.string().uuid(), z.number().int().min(0).max(100_000)),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await castBallot(supabaseAdmin(), user.id, parsed.data.allocation);
  if (!result.ok) {
    const status = result.reason === "over_budget" ? 400 : result.reason === "failed" ? 500 : 409;
    return NextResponse.json({ error: result.reason, budget: result.budget }, { status });
  }

  await track(user.id, "votes_cast", { spent: result.spent });
  return NextResponse.json(result);
}
