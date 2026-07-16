// All LLM access goes through this module — nothing else calls a model API,
// and keys never reach the client.
//
// Provider-agnostic: the default is any OpenAI-compatible chat-completions
// endpoint (Groq, OpenRouter, DeepSeek, Together, Fireworks, a local vLLM…),
// configured entirely by env. Anthropic remains available as an opt-in.
//
//   LLM_PROVIDER  openai-compatible (default) | anthropic
//   LLM_BASE_URL  default https://api.groq.com/openai/v1 (Groq free tier)
//   LLM_MODEL     default llama-3.3-70b-versatile
//   LLM_API_KEY   key for the endpoint above
//
// The pipeline was built to tolerate weaker models: strict-JSON parsing with a
// Zod repair pass here, and TMDB validation downstream that drops any film a
// model invents.

import { z } from "zod";
import {
  RecCandidatesOutput,
  TasteProfileOutput,
  type RecCandidates,
  type TasteProfile,
} from "./schemas";

export type LlmProvider = "openai-compatible" | "anthropic";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function resolveLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "openai-compatible") as LlmProvider;
  if (provider === "anthropic") {
    return {
      provider,
      baseUrl: "https://api.anthropic.com",
      model: env.LLM_MODEL ?? "claude-sonnet-4-6",
      apiKey: env.ANTHROPIC_API_KEY ?? "",
    };
  }
  return {
    provider: "openai-compatible",
    baseUrl: (env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    model: env.LLM_MODEL ?? "llama-3.3-70b-versatile",
    apiKey: env.LLM_API_KEY ?? "",
  };
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

async function chatOpenAiCompatible(
  cfg: LlmConfig,
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
): Promise<string> {
  const body = {
    model: cfg.model,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...turns],
  };

  // Free tiers rate-limit aggressively; one retry with backoff on 429/5xx.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned an empty completion");
      return content;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 1) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`LLM ${res.status} from ${cfg.baseUrl}: ${detail}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 2 * (attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 15) * 1000));
  }
}

async function chatAnthropic(
  cfg: LlmConfig,
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const res = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    system,
    messages: turns,
  });
  return res.content
    .filter((b): b is Extract<(typeof res.content)[number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function chat(
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
): Promise<string> {
  const cfg = resolveLlmConfig();
  if (cfg.provider === "anthropic") return chatAnthropic(cfg, system, turns, maxTokens);
  return chatOpenAiCompatible(cfg, system, turns, maxTokens);
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
  let lastErr: unknown;
  let turns: ChatTurn[] = [{ role: "user", content: user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(system, turns, maxTokens);
    try {
      return { value: parseStrictJson(raw, schema), raw };
    } catch (err) {
      lastErr = err;
      // One repair pass: show the model its own output + the validation error.
      turns = [
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
