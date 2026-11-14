"use client";
import { useState } from "react";
import { sfxChime, haptic } from "@/lib/sfx";
import { SUBMISSION_TERMS, SUBMISSION_TERMS_SUMMARY } from "@/lib/submission-terms";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  ALLOWED_TYPES,
  ATTACH_BUCKET,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  humanSize,
} from "@/lib/attachments";

/** A file already sitting in the private bucket, waiting to be claimed. */
interface UploadedFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

/**
 * Spend a one-shot upload token.
 *
 * The anon client can do this without a session — the token IS the
 * authorisation, and it only permits this one path, once. That is what lets an
 * account-free submissions door take a file at all.
 */
async function uploadSigned(path: string, token: string, file: File): Promise<boolean> {
  const { error } = await supabaseBrowser()
    .storage.from(ATTACH_BUCKET)
    .uploadToSignedUrl(path, token, file);
  return !error;
}

// The submission form.
//
// Written to be finishable. Every field a director doesn't strictly need to be
// judged on is optional and says so, because the failure mode of a submission
// form is not spam — it's a good filmmaker abandoning it at field eleven.
//
// Links, never uploads: every director already has a deck on Drive and a reel
// on Vimeo, and asking them to re-upload both is asking them to do work we can
// avoid. It also keeps us out of the business of hosting other people's films.

const field =
  "w-full rounded border border-line bg-bg/80 px-3 py-2.5 text-sm text-cream placeholder:text-dim/50 focus:border-amber focus:outline-none";
const label = "font-mono text-[0.6rem] uppercase tracking-[0.15em] text-dim";

const BLANK = {
  director: "",
  email: "",
  title: "",
  logline: "",
  synopsis: "",
  genre: "",
  comps: "",
  budget: "",
  deckUrl: "",
  priorWorkUrl: "",
  oneSheetUrl: "",
};

// `slots` arrives as a prop rather than being read here: this is a client
// component, so a non-NEXT_PUBLIC env var reads as undefined and the number
// would silently be the default however the server is configured.
export default function SubmitPitch({ slots }: { slots: number }) {
  const [f, setF] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ updated: boolean } | null>(null);

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  // Unticked by default and required, which is the only version of consent
  // worth having. A pre-ticked box is not agreement, it's decoration.
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  /**
   * Upload straight to storage on a one-shot signed URL.
   *
   * Two round trips per file: ask our API to authorise a path, then PUT the
   * bytes at Supabase directly. The file never touches the app, which is what
   * makes a 100MB deck possible at all — and it means a slow upload doesn't
   * hold a serverless function open while it happens.
   *
   * An email is required first because the path is namespaced by it; that also
   * means a director who changes their email mid-form gets fresh paths, which
   * is harmless.
   */
  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFileError(null);

    if (!f.email.trim()) {
      setFileError("Pop your email in first — we file attachments against it.");
      return;
    }

    const room = MAX_ATTACHMENTS - files.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    if (picked.length === 0) return;

    setUploading(true);
    const added: UploadedFile[] = [];
    const failed: string[] = [];

    for (const file of picked) {
      try {
        const authRes = await fetch("/api/submit/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: f.email.trim(), type: file.type, size: file.size }),
        });
        const auth = (await authRes.json().catch(() => null)) as
          | { path?: string; token?: string; note?: string }
          | null;

        if (!authRes.ok || !auth?.path || !auth?.token) {
          failed.push(auth?.note ?? `${file.name} wasn't accepted.`);
          continue;
        }

        const put = await uploadSigned(auth.path, auth.token, file);
        if (!put) {
          failed.push(`${file.name} didn't finish uploading.`);
          continue;
        }

        added.push({
          path: auth.path,
          name: file.name,
          size: file.size,
          type: file.type,
        });
      } catch {
        failed.push(`${file.name} didn't finish uploading.`);
      }
    }

    if (added.length) setFiles((s) => [...s, ...added]);
    if (failed.length) setFileError(failed.join(" "));
    setUploading(false);
  }

  const ready =
    f.director.trim() &&
    f.email.trim() &&
    f.title.trim() &&
    f.logline.trim() &&
    f.synopsis.trim() &&
    agreed;

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const hp = (new FormData(e.currentTarget).get("hp") as string) ?? "";

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          budget: f.budget.trim() ? Number(f.budget.replace(/[^0-9]/g, "")) : undefined,
          genre: f.genre.trim() || undefined,
          comps: f.comps.trim() || undefined,
          agreedToTerms: agreed,
          attachments: files,
          hp,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; updated?: boolean; note?: string }
        | null;

      if (res.ok && body?.ok) {
        haptic([20, 30, 20]);
        sfxChime();
        setDone({ updated: body.updated === true });
      } else if (res.status === 400) {
        setError("Something in there didn't take — check the email and the links.");
      } else {
        setError("Couldn't get that to us. Try again in a minute — nothing was lost.");
      }
    } catch {
      setError("Couldn't reach us. Try again in a minute — nothing was lost.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="ticket-edge rounded bg-surface p-6 text-center">
        <p className="eyebrow">Received</p>
        <p className="glow-amber mt-1 font-display text-4xl leading-none text-amber">
          IT&apos;S IN THE PILE
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-cream">
          {done.updated
            ? "We've updated your entry — this replaces what you sent before."
            : "Check your email for a receipt."}{" "}
          Somebody here will read the whole thing and watch your previous work.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-dim">
          You&apos;ll hear back either way. A pass is still an answer, and not
          hearing anything is the thing everyone hates about submitting.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            setF({ ...BLANK });
          }}
          className="mt-4 font-mono text-[0.65rem] uppercase tracking-widest text-amber underline underline-offset-4"
        >
          Submit another film
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="eyebrow mb-1 text-ticket">You</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={label}>Your name *</p>
            <input className={`${field} mt-1`} value={f.director} onChange={set("director")} required />
          </div>
          <div>
            <p className={label}>Email *</p>
            <input
              type="email"
              autoComplete="email"
              className={`${field} mt-1`}
              value={f.email}
              onChange={set("email")}
              required
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="eyebrow mb-1 text-ticket">The film</legend>

        <div>
          <p className={label}>Title *</p>
          <input className={`${field} mt-1`} value={f.title} onChange={set("title")} required />
        </div>

        <div>
          <p className={label}>Logline * — one sentence</p>
          <textarea
            rows={2}
            maxLength={300}
            className={`${field} mt-1`}
            value={f.logline}
            onChange={set("logline")}
            required
          />
          <p className="mt-0.5 text-right font-mono text-[0.55rem] tabular-nums text-dim">
            {f.logline.length}/300
          </p>
        </div>

        <div>
          <p className={label}>Synopsis *</p>
          <textarea
            rows={8}
            maxLength={6000}
            className={`${field} mt-1`}
            value={f.synopsis}
            onChange={set("synopsis")}
            placeholder="Tell us the whole story, ending included. This isn't a trailer — we're deciding whether to finance it, so spoil everything."
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className={label}>Genre</p>
            <input className={`${field} mt-1`} value={f.genre} onChange={set("genre")} placeholder="Thriller" />
          </div>
          <div>
            <p className={label}>Comps</p>
            <input
              className={`${field} mt-1`}
              value={f.comps}
              onChange={set("comps")}
              placeholder="Blue Ruin meets Wind River"
            />
          </div>
          <div>
            <p className={label}>Budget (USD)</p>
            <input
              inputMode="numeric"
              className={`${field} mt-1`}
              value={f.budget}
              onChange={set("budget")}
              placeholder="350000"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="eyebrow mb-1 text-ticket">The links</legend>
        <p className="-mt-1 text-[0.8rem] leading-relaxed text-dim">
          Paste links rather than files — wherever your deck and your reel already
          live. Make sure anyone with the link can open them.
        </p>
        <div>
          <p className={label}>Pitch deck</p>
          <input
            className={`${field} mt-1`}
            value={f.deckUrl}
            onChange={set("deckUrl")}
            placeholder="https://…"
          />
        </div>
        <div>
          <p className={label}>Your previous work — the most persuasive thing here</p>
          <input
            className={`${field} mt-1`}
            value={f.priorWorkUrl}
            onChange={set("priorWorkUrl")}
            placeholder="https://vimeo.com/…"
          />
        </div>
        <div>
          <p className={label}>One-sheet image</p>
          <input
            className={`${field} mt-1`}
            value={f.oneSheetUrl}
            onChange={set("oneSheetUrl")}
            placeholder="https://…"
          />
        </div>
      </fieldset>

      {/* Files, for the people who don't have a Drive habit.
          Links are still first and still preferred — a reel belongs on Vimeo,
          not in our bucket. But "go and host this somewhere first" is the step
          a first-time director closes the tab on, so a script and a deck can
          come straight off the laptop. Uploads go directly to storage on a
          signed URL, which is why the ceiling is 100MB rather than the ~4.5MB
          a serverless function body would carry. */}
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="eyebrow mb-1 text-ticket">Or attach the files</legend>
        <p className="-mt-1 text-[0.8rem] leading-relaxed text-dim">
          Script, deck, one-sheet — up to {MAX_ATTACHMENTS} files,{" "}
          {humanSize(MAX_ATTACHMENT_BYTES)} each. PDFs, documents and images.
          Video stays a link.
        </p>

        <label className="cursor-pointer rounded border border-dashed border-line bg-bg/40 px-3 py-5 text-center">
          <input
            type="file"
            multiple
            className="sr-only"
            accept={Object.keys(ALLOWED_TYPES).join(",")}
            onChange={(e) => void addFiles(e.target.files)}
            disabled={uploading || files.length >= MAX_ATTACHMENTS}
          />
          <span className="font-mono text-[0.7rem] uppercase tracking-widest text-amber">
            {uploading
              ? "Uploading…"
              : files.length >= MAX_ATTACHMENTS
                ? `That's ${MAX_ATTACHMENTS} — the limit`
                : "Choose files"}
          </span>
          <span className="mt-1 block font-mono text-[0.6rem] text-dim">
            {files.length > 0
              ? `${files.length} attached`
              : "nothing attached yet — optional"}
          </span>
        </label>

        {files.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {files.map((a) => (
              <li
                key={a.path}
                className="flex items-center justify-between gap-3 rounded border border-line bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8rem] text-cream">
                  📎 {a.name}
                </span>
                <span className="shrink-0 font-mono text-[0.6rem] text-dim">
                  {humanSize(a.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((s) => s.filter((x) => x.path !== a.path))}
                  className="shrink-0 font-mono text-[0.6rem] uppercase tracking-widest text-ticket"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {fileError && (
          <p className="font-mono text-[0.65rem] leading-relaxed text-ticket">{fileError}</p>
        )}
      </fieldset>

      {/* Honeypot. Named hp, not something plausible: password managers fill
          plausible-looking hidden fields and an autofilled trap silently
          discards a real submission. */}
      <input
        type="text"
        name="hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />

      {/* The terms, at the point of handing the film over.
          Collapsed by default and readable in full without leaving the form —
          a director who has just written a synopsis is not going to open a new
          tab, and terms nobody reads are the ones that get argued about. */}
      <div className="rounded border border-line bg-surface/60 p-4">
        <p className="eyebrow text-ticket">Before you send it</p>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-cream">
          {SUBMISSION_TERMS_SUMMARY}
        </p>

        <button
          type="button"
          onClick={() => setTermsOpen((o) => !o)}
          aria-expanded={termsOpen}
          className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-amber underline decoration-amber/40 underline-offset-4"
        >
          {termsOpen ? "Hide the terms" : "Read all eight, they're short →"}
        </button>

        {termsOpen && (
          <ul className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
            {SUBMISSION_TERMS.map((t) => (
              <li key={t.h}>
                <p className="font-display text-lg leading-tight text-cream">{t.h}</p>
                <p className="mt-0.5 text-[0.8rem] leading-relaxed text-dim">{t.p}</p>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-line pt-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#ffb454] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          />
          <span className="text-[0.82rem] leading-relaxed text-cream">
            I&apos;ve read the terms and I&apos;m submitting my own work.
          </span>
        </label>
      </div>

      {error && <p className="text-center font-mono text-[0.7rem] text-ticket">{error}</p>}

      <button
        type="submit"
        disabled={busy || !ready}
        className="rounded bg-amber py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-bg disabled:opacity-50"
      >
        {busy ? "Sending…" : "Submit your pitch"}
      </button>

      <p className="text-center font-mono text-[0.6rem] leading-relaxed text-dim">
        No fee, at any point · {slots} films reach the ballot each round ·
        we read everything that arrives
      </p>
    </form>
  );
}
