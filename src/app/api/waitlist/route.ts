import { NextResponse } from "next/server";
import { z } from "zod";
import { joinWaitlist } from "@/lib/waitlist";
import { sendEmail, waitlistConfirmationHtml, waitlistAlertHtml } from "@/lib/email";
import { adminEmails } from "@/lib/admin";
import { siteUrl } from "@/lib/site";

// Public front-door waitlist join. No auth — this is the one thing a
// stranger can do. `hp` (and legacy `note`, still sent by shipped native
// builds) is a honeypot: humans never see it, bots fill it, we quietly
// accept-and-drop.

const Input = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  // Honeypots are accepted-and-inspected, not schema-rejected. The old
  // `max(0)` meant a filled honeypot FAILED validation, so the bot branch
  // lived inside the invalid-email branch — which conflated "a bot filled the
  // trap" with "the address has a typo", and silently dropped any human whose
  // browser or password manager autofilled the hidden input. A dropped signup
  // is the single worst thing this endpoint can do, so it now logs.
  hp: z.string().max(200).optional(),
  note: z.string().max(200).optional(),
});

/** g***n@example.com — enough to confirm WHICH address, never the address. */
function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 1);
  const tail = user.length > 2 ? user.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(1, user.length - 2))}${tail}@${domain}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const trap = (parsed.data.hp ?? "").trim() || (parsed.data.note ?? "").trim();
  if (trap) {
    // Fake success so bots don't iterate. Logged so a false positive — an
    // autofilled honeypot on a real person — is findable instead of a mystery.
    console.warn(`waitlist honeypot tripped (${trap.length} chars) — dropped ${parsed.data.email}`);
    return NextResponse.json({ ok: true, status: "pending", position: 99, emailed: false });
  }

  try {
    const res = await joinWaitlist(parsed.data.email);
    // Confirmation email only on a genuinely new join (never on repeat submits).
    // Awaited so it actually sends before the serverless function freezes;
    // a send failure never blocks the join.
    let emailed = false;
    let alerted = false;
    const alertedTo = adminEmails().map(maskEmail).join(", ");
    if (res.isNew && res.status === "pending") {
      // Two mails, one round trip: the joiner's stub and the owner's "someone's
      // at the door" alert. Sent together rather than in sequence because a
      // serverless function freezes the moment the response is returned, and
      // two awaited sends back to back is the slowest path to that line.
      const [stub, alert] = await Promise.all([
        sendEmail({
          to: parsed.data.email,
          subject: "🎟 You're in line for Deep Cut",
          html: waitlistConfirmationHtml(res.position),
        }),
        sendEmail({
          to: adminEmails(),
          subject: `🚪 ${parsed.data.email} is in line (#${res.position})`,
          html: waitlistAlertHtml({
            email: parsed.data.email,
            position: res.position,
            inLine: res.position,
            adminUrl: `${siteUrl()}/admin`,
          }),
        }),
      ]);
      emailed = stub.ok;
      alerted = alert.ok;
      // The owner alert and the joiner stub go out on the same call to the same
      // provider, so when one lands and the other doesn't, the difference is the
      // recipient — not the mail pipe. Logged with the masked recipient so that
      // question is answerable without a mailbox.
      if (!alert.ok) {
        console.error(`waitlist alert NOT sent to ${alertedTo}: ${alert.error ?? "no reason"}`);
      }
    }
    // `emailed` and `isNew` are what the form needs to tell the truth. Without
    // them it said "we just emailed you to confirm your spot" on every success
    // — including repeat submits (no mail is sent by design) and any run where
    // the mail provider is unconfigured or rejected the send.
    return NextResponse.json({
      ok: true,
      status: res.status,
      position: res.position,
      isNew: res.isNew,
      emailed,
      // Whether the owner alert was accepted, and by whom (masked). Both are
      // needed to tell "the alert was never attempted" from "it was sent to the
      // wrong address" from "it was accepted and the mailbox filtered it".
      alert: res.isNew && res.status === "pending" ? { sent: alerted, to: alertedTo } : null,
    });
  } catch (err) {
    console.error("waitlist join failed", err);
    return NextResponse.json({ error: "join_failed" }, { status: 500 });
  }
}
