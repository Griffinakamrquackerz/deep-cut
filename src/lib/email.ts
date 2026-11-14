// Transactional email the app sends ITSELF, via Resend's HTTP API — used for
// non-auth mail like the waitlist "you're in line" confirmation. (Auth emails
// — magic link, invite, confirm — still go through Supabase's SMTP.) Gated on
// RESEND_API_KEY: absent → no-op, so the waitlist still works and simply skips
// the confirmation until the key is set in Vercel. Same graceful-degradation
// contract as Stripe/push/Spotify.
//
// The From address must be on the Resend-verified domain (thedeepcut.xyz),
// which it is — DKIM/SPF/MX are all live. Override with EMAIL_FROM if desired.

const FROM = process.env.EMAIL_FROM || "Deep Cut <tickets@thedeepcut.xyz>";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface SendResult {
  ok: boolean;
  /** Why it failed, in Resend's own words. Absent on success. */
  error?: string;
}

/**
 * Send one transactional email.
 *
 * Every failure path is both logged AND returned. The first version swallowed
 * all three of them silently — missing key, Resend rejection, network throw —
 * which made an unconfigured integration indistinguishable from a working one.
 * The second version logged them but still returned a bare boolean, so a caller
 * could tell you the mail failed and not why: an invite would report "the ticket
 * email didn't go out" while the actual reason sat in a log nobody was reading.
 * The reason has to travel with the failure.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`email skipped — RESEND_API_KEY is not set (subject: ${opts.subject})`);
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      // Resend's body names the actual cause — unverified domain, a From
      // address off-domain, a suppressed recipient, a test-mode key that may
      // only send to the account owner. Worth every byte.
      const body = await res.text().catch(() => "");
      let detail = body.slice(0, 300);
      try {
        // Resend answers with {statusCode, name, message}; the message is the
        // sentence worth showing a human.
        const parsed = JSON.parse(body) as { message?: string; name?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        // Not JSON — the raw body is still better than nothing.
      }
      console.error(`email send failed ${res.status} from=${FROM} to=${String(opts.to)}: ${detail}`);
      return { ok: false, error: `Resend ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("email send threw", err);
    return { ok: false, error: `Network error: ${detail}` };
  }
}

export interface BatchEmail {
  to: string;
  subject: string;
  html: string;
}

export interface BatchResult {
  sent: number;
  failed: number;
  error?: string;
}

/**
 * Send many emails in one request.
 *
 * The monthly programme used to loop sendEmail and await each one. At roughly
 * 300ms a send that is ~200 emails inside the function's 60s ceiling, after
 * which the run is killed MID-LOOP — and with no record of where it stopped,
 * the same first two hundred people would get mailed every month while
 * everyone after them never heard from us.
 *
 * Parallelising the loop doesn't fix it either: Resend rate-limits at a couple
 * of requests a second, so twenty at a time just collects 429s. The right
 * shape is Resend's batch endpoint — up to 100 fully-formed, individually
 * personalised emails per request. The unsubscribe link is per-recipient, so
 * they have to stay individual; they just don't have to be individual
 * REQUESTS.
 */
export async function sendEmailBatch(emails: BatchEmail[]): Promise<BatchResult> {
  if (!emails.length) return { sent: 0, failed: 0 };

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`batch skipped — RESEND_API_KEY is not set (${emails.length} emails)`);
    return { sent: 0, failed: emails.length, error: "RESEND_API_KEY is not set" };
  }
  if (emails.length > 100) {
    // The caller chunks; this guard is here so a future caller that forgets
    // gets a clear error rather than a silent partial send.
    return { sent: 0, failed: emails.length, error: "batch larger than Resend's limit of 100" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        emails.map((e) => ({ from: FROM, to: e.to, subject: e.subject, html: e.html })),
      ),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let detail = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) detail = parsed.message;
      } catch {
        /* not JSON — the raw body still beats nothing */
      }
      console.error(`email batch failed ${res.status} (${emails.length} emails): ${detail}`);
      return { sent: 0, failed: emails.length, error: `Resend ${res.status}: ${detail}` };
    }
    return { sent: emails.length, failed: 0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("email batch threw", err);
    return { sent: 0, failed: emails.length, error: `Network error: ${detail}` };
  }
}

/**
 * The invite itself — the email that actually lets someone in. The sign-in link
 * is generated by Supabase but mailed by us, so this is the one piece of the
 * signup flow whose look we control.
 */
export function inviteHtml(link: string): string {
  return `
  <div style="margin:0;padding:0;background:#0d0907;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0907;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#141019;border:1px solid rgba(255,180,84,0.35);border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 28px 4px;text-align:center;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8f80;">Deep Cut · Admit One</p>
            <h1 style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1;color:#ffb454;">YOU'RE IN</h1>
          </td></tr>
          <tr><td style="padding:14px 28px 0;text-align:center;">
            <p style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#f3ead9;">
              A seat opened up and it's yours. This link signs you in — no password to make up.
            </p>
          </td></tr>
          <tr><td style="padding:22px 28px 6px;text-align:center;">
            <a href="${link}" style="display:inline-block;padding:15px 30px;background:#ffb454;border-radius:6px;font-family:'Courier New',monospace;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#0d0907;text-decoration:none;">🎟 Take your seat</a>
          </td></tr>
          <tr><td style="padding:10px 28px 0;text-align:center;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;line-height:1.6;color:#6b6355;">
              Open it on the device you want to watch on. The link works once, and expires in 24 hours.
            </p>
          </td></tr>
          <tr><td style="padding:22px 28px 26px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#6b6355;">
              The midnight repertory theater for films you haven't seen yet · thedeepcut.xyz
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

/**
 * "Someone's at the door" — the alert to the owner when a stranger joins the
 * line. Deliberately plain: this one is a notification, not a piece of set
 * dressing, and it needs to be skimmable on a phone lock screen.
 */
export function waitlistAlertHtml(opts: {
  email: string;
  position: number;
  inLine: number;
  adminUrl: string;
}): string {
  return `
  <div style="margin:0;padding:0;background:#0d0907;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0907;padding:28px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#141019;border:1px solid rgba(255,180,84,0.3);border-radius:10px;">
          <tr><td style="padding:24px 26px 6px;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8f80;">Deep Cut · The door</p>
            <h1 style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1;color:#ffb454;">SOMEONE'S IN LINE</h1>
          </td></tr>
          <tr><td style="padding:12px 26px 0;">
            <p style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.5;color:#f3ead9;"><strong>${opts.email}</strong></p>
            <p style="margin:4px 0 0;font-family:'Courier New',monospace;font-size:12px;color:#b8ad9c;">#${opts.position} in line · ${opts.inLine} waiting</p>
          </td></tr>
          <tr><td style="padding:20px 26px 26px;">
            <a href="${opts.adminUrl}" style="display:inline-block;padding:12px 20px;background:#ffb454;border-radius:6px;font-family:'Courier New',monospace;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#0d0907;text-decoration:none;">Open the door →</a>
            <p style="margin:12px 0 0;font-family:'Courier New',monospace;font-size:10px;line-height:1.5;color:#6b6355;">
              Seat them from the Door tab, or leave them — the daily trickle seats the front of the line on its own.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

/** The "your seat is saved" ticket stub, as an email. Inline styles only —
 *  email clients strip <style> and external CSS. */
export function waitlistConfirmationHtml(position: number): string {
  return `
  <div style="margin:0;padding:0;background:#0d0907;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0907;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#141019;border:1px solid rgba(255,180,84,0.35);border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 28px 8px;text-align:center;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8f80;">Deep Cut · Admit One</p>
            <h1 style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;color:#ffb454;">YOU'RE IN LINE</h1>
          </td></tr>
          <tr><td style="padding:8px 28px;text-align:center;">
            <div style="display:inline-block;padding:14px 26px;border:1px dashed rgba(255,180,84,0.5);border-radius:8px;">
              <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9a8f80;">Your stub</p>
              <p style="margin:2px 0 0;font-family:Georgia,serif;font-size:44px;line-height:1;color:#ffb454;">#${position}</p>
            </div>
          </td></tr>
          <tr><td style="padding:18px 28px 4px;text-align:center;">
            <p style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#f3ead9;">
              Your seat is saved. We seat a new row every day — when it's your turn,
              a second email lands with your way in.
            </p>
            <p style="margin:14px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#b8ad9c;">
              Nothing to do for now. The good stuff is worth the wait. 🎬
            </p>
          </td></tr>
          <tr><td style="padding:22px 28px 26px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);margin-top:12px;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#6b6355;">
              The midnight repertory theater for films you haven't seen yet · thedeepcut.xyz
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}

export interface ProgrammeFilm {
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  pedigree: string;
  channelName: string;
}

/**
 * The monthly programme — the new bill, the way a repertory house posts one.
 *
 * The films ARE the pitch, so they get the space: title, who made it, what it
 * won. No "we've been busy!", no feature announcements. Somebody who opens
 * this should be able to decide what to watch tonight without leaving the
 * email, and the button is there for when they have.
 *
 * The unsubscribe link is not optional furniture — this is the first mail Deep
 * Cut sends that nobody asked for, and it has to carry a working way out.
 */
export function programmeHtml(opts: {
  films: ProgrammeFilm[];
  feature: ProgrammeFilm | null;
  month: string;
  watchUrl: string;
  unsubscribeUrl: string;
}): string {
  const min = (sec: number) => `${Math.max(1, Math.round(sec / 60))} min`;

  const row = (f: ProgrammeFilm) => `
    <tr><td style="padding:0 28px 16px;">
      <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#e4573d;">${f.channelName}</p>
      <p style="margin:3px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.2;color:#f3ead9;">${f.title}</p>
      <p style="margin:2px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#9a8f80;">${f.director} · ${f.year} · ${min(f.runtimeSec)}</p>
      <p style="margin:3px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#ffb454;">${f.pedigree}</p>
    </td></tr>`;

  return `
  <div style="margin:0;padding:0;background:#0d0907;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0907;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141019;border:1px solid rgba(255,180,84,0.35);border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 28px 4px;text-align:center;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8f80;">Deep Cut Theatre · ${opts.month}</p>
            <h1 style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1;color:#ffb454;">THE NEW BILL</h1>
            <p style="margin:10px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#f3ead9;">
              ${opts.films.length} award-winning short${opts.films.length === 1 ? "" : "s"} you almost certainly haven't seen. Free, in the room, all month.
            </p>
          </td></tr>

          ${
            opts.feature
              ? `<tr><td style="padding:20px 28px 0;">
                   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(228,87,61,0.08);border:1px solid rgba(228,87,61,0.35);border-radius:8px;">
                     <tr><td style="padding:14px 16px;">
                       <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#e4573d;">This week&rsquo;s feature</p>
                       <p style="margin:3px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.2;color:#f3ead9;">${opts.feature.title}</p>
                       <p style="margin:2px 0 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#ffb454;">${opts.feature.pedigree}</p>
                     </td></tr>
                   </table>
                 </td></tr>`
              : ""
          }

          <tr><td style="padding:22px 28px 10px;">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9a8f80;">The whole bill</p>
          </td></tr>
          ${opts.films.map(row).join("")}

          <tr><td style="padding:6px 28px 6px;text-align:center;">
            <a href="${opts.watchUrl}" style="display:inline-block;padding:15px 30px;background:#ffb454;border-radius:6px;font-family:'Courier New',monospace;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#0d0907;text-decoration:none;">🎬 Take your seat</a>
          </td></tr>

          <tr><td style="padding:22px 28px 26px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#6b6355;">
              The midnight repertory theater for films you haven&rsquo;t seen yet · thedeepcut.xyz
            </p>
            <p style="margin:8px 0 0;font-family:'Courier New',monospace;font-size:10px;color:#6b6355;">
              <a href="${opts.unsubscribeUrl}" style="color:#9a8f80;text-decoration:underline;">Stop sending me the programme</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}
