// All Anthropic access goes through this module — nothing else calls the API,
// and the key never reaches the client. Model per spec: claude-sonnet-4-6.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  RecCandidatesOutput,
  TasteProfileOutput,
  type RecCandidates,
  type TasteProfile,
} from "./schemas";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export interface MovieBrief {
  title: string;
  year: number | null;
  genres: string[];
  overview: string;
}

export interface LogBrief {
  title: string;
  year: number | null;
  reaction: string;
  why: string | null;
  note: string | null;
}

function briefLine(m: MovieBrief): string {
  const snippet = m.overview.split(/\s+/).slice(0, 28).join(" ");
  return `- ${m.title} (${m.year ?? "?"}) [${m.genres.join(", ")}] — ${snippet}`;
}

/** Pull the first JSON object out of a model reply and validate it. */
export function parseStrictJson<T>(raw: string, schema: z.ZodType<T>): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object in model output");
  }
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  return schema.parse(parsed);
}

async function completeJson<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens: number,
): Promise<{ value: T; raw: string }> {
  const c = client();
  let lastErr: unknown;
  let messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return { value: parseStrictJson(raw, schema), raw };
    } catch (err) {
      lastErr = err;
      // One repair pass: show the model its own output + the validation error.
      messages = [
        { role: "user", content: user },
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Your previous output failed validation: ${String(err)}. Respond again with ONLY the corrected JSON object — no prose, no markdown fences.`,
        },
      ];
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ── Stage A — taste profile ─────────────────────────────────────────

const PROFILE_SYSTEM = `You are the taste engine of Deep Cut, a movie app built around articulated taste profiles.
Given a user's loved films and recent watch reactions, name 3-5 "taste threads": cross-genre taste DIMENSIONS in plain, vivid English.

Rules:
- Threads are NEVER genre labels ("horror fan") or director trivia. They articulate what the person responds to across genres — e.g. "sincere failure", "hangout movies where dialogue is the plot", "competence porn", "beautiful things breaking slowly".
- title: 2-5 punchy words. line: one sentence (max ~25 words) explaining the thread back to the user in second person.
- Weigh reactions: 'loved' and 'loved_ironically' reveal taste; 'not_for_me' reveals boundaries; a 'why' (vibe/story/performances/chaos) is a strong signal.
- Respond with ONLY a JSON object, no prose, no markdown fences: {"threads":[{"title":"...","line":"..."}]}`;

export async function generateTasteProfile(
  loved: MovieBrief[],
  logs: LogBrief[],
): Promise<{ profile: TasteProfile; raw: string }> {
  const logLines = logs.map(
    (l) =>
      `- ${l.title} (${l.year ?? "?"}): ${l.reaction}${l.why ? ` (why: ${l.why})` : ""}${l.note ? ` — "${l.note}"` : ""}`,
  );
  const user = [
    "LOVED FILMS:",
    ...loved.map(briefLine),
    logs.length ? "\nRECENT WATCH REACTIONS:" : "",
    ...logLines,
  ]
    .filter(Boolean)
    .join("\n");

  const { value, raw } = await completeJson(PROFILE_SYSTEM, user, TasteProfileOutput, 1500);
  return { profile: value, raw };
}

// ── Stage B — recommendation candidates ─────────────────────────────

const RECS_SYSTEM = `You are the recommendation engine of Deep Cut. You receive a user's taste threads, loved films, an exclusion list, their streaming services, and a requested obscurity range (1=everyone knows it, 5=deep cut).

Produce exactly 12 candidate films.

Rules:
- Every candidate must be a REAL, released feature film. Never invent titles. Use the film's original release year.
- NEVER recommend anything on the exclusion list or in the loved list.
- Each "reason" is ONE line (max ~25 words) tied to a specific taste thread or a specific loved film, e.g. "Because you loved The Room → the film-set chaos of Living in Oblivion."
- At least half the candidates should be lesser-known films (obscurity 3+). Bias toward the requested obscurity range.
- Spread across the user's taste threads; don't cluster on one.
- obscurity_guess: your 1-5 estimate of how obscure the film is.
- Respond with ONLY a JSON object, no prose, no markdown fences: {"recs":[{"title":"...","year":1990,"reason":"...","obscurity_guess":3}]}`;

export interface RecRequest {
  threads: TasteProfile["threads"];
  lovedTitles: string[];
  exclusionTitles: string[];
  services: string[];
  obscurityMin: number;
  obscurityMax: number;
}

export async function generateRecCandidates(
  req: RecRequest,
): Promise<{ candidates: RecCandidates; raw: string }> {
  const user = [
    "TASTE THREADS:",
    ...req.threads.map((t) => `- ${t.title}: ${t.line}`),
    "\nLOVED FILMS:",
    req.lovedTitles.join("; "),
    "\nEXCLUSION LIST (never recommend):",
    req.exclusionTitles.length ? req.exclusionTitles.join("; ") : "(none)",
    "\nSTREAMING SERVICES:",
    req.services.length ? req.services.join(", ") : "(unknown)",
    `\nREQUESTED OBSCURITY RANGE: ${req.obscurityMin}-${req.obscurityMax}`,
  ].join("\n");

  const { value, raw } = await completeJson(RECS_SYSTEM, user, RecCandidatesOutput, 2500);
  return { candidates: value, raw };
}
