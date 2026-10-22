// All LLM access goes through this module — nothing else calls a model API,
// and keys never reach the client.
//
// Provider-agnostic: the default is any OpenAI-compatible chat-completions
// endpoint (Groq, OpenRouter, DeepSeek, Together, Fireworks, a local vLLM…),
// configured entirely by env. Anthropic remains available as an opt-in.
//
//   LLM_PROVIDER  openai-compatible (default) | anthropic
//   LLM_BASE_URL  default https://api.groq.com/openai/v1 (Groq free tier)
//   LLM_MODEL     default openai/gpt-oss-120b
//   LLM_FALLBACK_MODELS  comma-separated chain tried when the one before is
//                 rate-limited. Quotas are per-model, so the chain is free
//                 headroom on a free tier. Defaults to Groq's other production
//                 text models, strongest first.
//   LLM_API_KEY   key for the endpoint above
//
// The pipeline was built to tolerate weaker models: strict-JSON parsing with a
// Zod repair pass here, and TMDB validation downstream that drops any film a
// model invents.

import { z } from "zod";
import {
  BlendPicksOutput,
  RecCandidatesOutput,
  TasteProfileOutput,
  type BlendPicks,
  type RecCandidates,
  type TasteProfile,
} from "./schemas";

export type LlmProvider = "openai-compatible" | "anthropic";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  /**
   * Tried in order when the model before it is rate-limited. Free-tier quotas
   * are per-model, so each extra entry is a whole extra allowance — the cheap
   * way to buy headroom without buying a paid tier.
   */
  fallbackModels: string[];
  apiKey: string;
}

/**
 * Why a completion took as long as it did.
 *
 * The deal timings can say the LLM stage cost 10.5s but not whether that was
 * one slow generation or two rate-limit backoffs plus a repair pass — and those
 * have opposite fixes. So the caller passes this in and reports it alongside
 * the stage timings. Optional everywhere: nothing here ever fails a request.
 */
export interface LlmTrace {
  /** The model that produced the answer we kept (null when none answered). */
  model: string | null;
  /** HTTP requests spent, retries and model walks included. 1 is the happy path. */
  requests: number;
  /** Models tried before one answered. 1 = the primary worked first time. */
  modelsTried: number;
  /** A JSON repair pass ran — that is a second full generation, not a retry. */
  repaired: boolean;
  /** Time spent deliberately waiting on backoff, in ms. */
  waitedMs: number;
}

/** A fresh trace for one logical completion. */
export function createLlmTrace(): LlmTrace {
  return { model: null, requests: 0, modelsTried: 0, repaired: false, waitedMs: 0 };
}

export function resolveLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "openai-compatible") as LlmProvider;
  if (provider === "anthropic") {
    return {
      provider,
      baseUrl: "https://api.anthropic.com",
      model: env.LLM_MODEL ?? "claude-sonnet-4-6",
      fallbackModels: [],
      apiKey: env.ANTHROPIC_API_KEY ?? "",
    };
  }
  const model = env.LLM_MODEL ?? "openai/gpt-oss-120b";
  // Quotas are per-model, so walking this chain multiplies the free allowance
  // instead of paying for a tier. Anything the account can't reach is skipped
  // and remembered, so an unavailable model costs one request per instance.
  //
  // These are chosen from what the key can actually serve (GET /v1/models),
  // not from the docs' published list: llama-3.3-70b-versatile and
  // llama-3.1-8b-instant are documented as production models but answer 404
  // here, so they were dead entries buying no headroom.
  const DEFAULT_FALLBACKS = [
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    // Last resort. It's an agentic system with built-in web search rather than
    // a plain chat model, so treat its output as the least predictable — fine
    // as the final rung, since strict-JSON parsing plus TMDB validation
    // downstream drops anything malformed anyway.
    "groq/compound-mini",
  ];
  // LLM_FALLBACK_MODELS takes a comma-separated list; the older singular
  // LLM_FALLBACK_MODEL still works.
  const configured = env.LLM_FALLBACK_MODELS ?? env.LLM_FALLBACK_MODEL;
  const fallbackModels = [
    ...new Set(
      (configured ? configured.split(",") : DEFAULT_FALLBACKS)
        .map((m) => m.trim())
        .filter((m) => m && m !== model),
    ),
  ];
  return {
    provider: "openai-compatible",
    baseUrl: (env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    model,
    fallbackModels,
    apiKey: env.LLM_API_KEY ?? "",
  };
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

class LlmHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A 200 with no content in it. Seen in the wild from Groq under load, and it
 * is transient in exactly the way a 429 is — so the chain must treat it the
 * same way and move to the next model rather than failing the request. It used
 * to be a plain Error, which the walker re-threw immediately.
 */
class LlmEmptyError extends Error {}

async function chatOneModel(
  cfg: LlmConfig,
  model: string,
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
  /**
   * Requests to spend on this model. The first model gets 2 (a rate limit is
   * often a momentary burst); later ones get 1, because with four models to
   * walk, waiting out each in turn would blow the route's function timeout —
   * moving on is faster than waiting.
   */
  maxAttempts = 2,
  trace?: LlmTrace,
): Promise<string> {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...turns],
  };

  // Free tiers rate-limit aggressively; one retry with backoff on 429/5xx.
  for (let attempt = 0; ; attempt++) {
    if (trace) trace.requests++;
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
      if (!content) throw new LlmEmptyError(`LLM returned an empty completion (${model})`);
      if (trace) trace.model = model;
      return content;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxAttempts - 1) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new LlmHttpError(res.status, `LLM ${res.status} (${model}) from ${cfg.baseUrl}: ${detail}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 2 * (attempt + 1);
    const waitMs = Math.min(retryAfter, 10) * 1000;
    if (trace) trace.waitedMs += waitMs;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/**
 * Models this instance has proven it cannot reach (retired, renamed, or not
 * enabled for the account — they answer 4xx, never 429). Remembered for the
 * lambda's life so a dead entry costs one wasted request, not one per call.
 */
const unusableModels = new Set<string>();

/** 4xx that means "this model will never work", as opposed to 429 "not now". */
function isUnusable(err: unknown): boolean {
  return err instanceof LlmHttpError && [400, 401, 403, 404].includes(err.status);
}

async function chatOpenAiCompatible(
  cfg: LlmConfig,
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
  trace?: LlmTrace,
): Promise<string> {
  // Free-tier quotas are per-model, so a rate-limited model doesn't touch the
  // next one's allowance. Walking the chain is how a free tier survives more
  // than one person using the app at once.
  const chain = [cfg.model, ...cfg.fallbackModels].filter((m) => !unusableModels.has(m));
  // If everything is known-bad, try the primary anyway rather than give up —
  // access can be granted, and models come back.
  const models = chain.length > 0 ? chain : [cfg.model];

  let lastErr: unknown = new Error("no LLM models configured");
  for (const [i, model] of models.entries()) {
    if (trace) trace.modelsTried++;
    try {
      return await chatOneModel(cfg, model, system, turns, maxTokens, i === 0 ? 2 : 1, trace);
    } catch (err) {
      lastErr = err;
      // Anything the model itself reported is a reason to try the next one,
      // not to fail the request. Rate limits (429), an empty completion, a
      // payload this model won't take (413 — another may have a larger
      // window), a 5xx after its own retries: the next allowance is right
      // there, so use it. Only 400/401/403/404 say "this model will never
      // work", and those are also remembered.
      if (err instanceof LlmEmptyError) continue;
      if (err instanceof LlmHttpError) {
        if (isUnusable(err)) {
          unusableModels.add(model);
          console.error(
            `LLM model "${model}" unusable (${err.message}); skipping it from now on`,
          );
        }
        continue;
      }
      throw err; // not the model's doing (network, bad JSON) — surface it
    }
  }

  // Every model was rate-limited. Wait out a slice of the window and give the
  // best usable one a final go: a burst that clips all of them at once usually
  // clears in seconds, and one more try beats failing the whole request.
  await new Promise((r) => setTimeout(r, 3000));
  return chatOneModel(cfg, models[0], system, turns, maxTokens, 1, trace).catch(() => {
    throw lastErr;
  });
}

async function chatAnthropic(
  cfg: LlmConfig,
  system: string,
  turns: ChatTurn[],
  maxTokens: number,
  trace?: LlmTrace,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: cfg.apiKey });
  if (trace) {
    trace.requests++;
    trace.modelsTried++;
    trace.model = cfg.model;
  }
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
  trace?: LlmTrace,
): Promise<string> {
  const cfg = resolveLlmConfig();
  if (cfg.provider === "anthropic") return chatAnthropic(cfg, system, turns, maxTokens, trace);
  return chatOpenAiCompatible(cfg, system, turns, maxTokens, trace);
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
  trace?: LlmTrace,
): Promise<{ value: T; raw: string }> {
  let lastErr: unknown;
  let turns: ChatTurn[] = [{ role: "user", content: user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chat(system, turns, maxTokens, trace);
    try {
      return { value: parseStrictJson(raw, schema), raw };
    } catch (err) {
      lastErr = err;
      // The second pass is a whole extra generation, so it belongs in the
      // trace: "the model was slow" and "the model answered badly and we
      // regenerated" are different diagnoses with different fixes.
      if (trace && attempt === 0) trace.repaired = true;
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
- SPARKS (films they picked from lineups, accepted as verdicts, or wrote takes about) are weak positive engagement — texture, not endorsement. Never let a spark outweigh a loved film or a boundary.
- Respond with ONLY a JSON object, no prose, no markdown fences: {"threads":[{"title":"...","line":"..."}]}`;

export async function generateTasteProfile(
  loved: MovieBrief[],
  logs: LogBrief[],
  sparks: string[] = [],
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
    sparks.length ? "\nSPARKS (weak engagement signals):" : "",
    ...sparks,
  ]
    .filter(Boolean)
    .join("\n");

  // Generous budget: reasoning models (e.g. GPT OSS) spend thinking tokens
  // from the same completion allowance before emitting the JSON.
  const { value, raw } = await completeJson(PROFILE_SYSTEM, user, TasteProfileOutput, 4000);
  return { profile: value, raw };
}

// ── Stage B — recommendation candidates ─────────────────────────────

const RECS_SYSTEM = `You are the recommendation engine of Deep Cut. You receive a user's taste threads, loved films, an exclusion list, their streaming services, and a requested obscurity range (1=everyone knows it, 5=deep cut).

Produce exactly 12 candidate films.

Rules:
- Every candidate must be a REAL, released feature film. Never invent titles. Use the film's original release year.
- NEVER recommend anything on the exclusion list or in the loved list.
- Each "reason" is ONE line (max ~25 words) tied to a specific taste thread or a specific loved film, e.g. "Because you loved The Room → the film-set chaos of Living in Oblivion."
- Deep Cut's premise is films the user HASN'T met. Deal mostly obscurity 3-4 plus 1-2 true deep cuts (5). At most ONE candidate per batch may be obscurity 1-2, and only when it's a perfect taste match they've plausibly missed. Never deal current chart hits, franchise blockbusters, or the all-time-most-popular staples — assume they've already met those. Low-key but excellent beats famous.
- Big-budget STREAMING ORIGINALS are not deep cuts either, however few people rated them. A wide-release Netflix/Apple/Amazon/Disney+ title built around A-list stars was marketed to millions — it is a mainstream film that merely skipped cinemas. Never deal one.
- EXCEPTION — cult midnight-movie energy is always in-bounds when it falls INSIDE the requested obscurity range: beloved weirdness (Clerks, They Live, Rocky Horror tier) is Deep Cut material. This is a hidden-gems service, not a top-40 list — even a cult title must be one the member plausibly hasn't met, so never reach for a film so famous everyone has already seen it. What's banned is generic mainstream, not beloved weirdness.
- Lean modern and relevant: include at least 3 films from the last 10 years, and keep the whole batch mostly post-1970. At MOST one pre-1970 film, and only a true perfect-fit classic — otherwise skip that era entirely. Avoid defaulting to the canonical "greatest of all time" lists; surface festival favorites, international picks, and under-the-radar releases the user has plausibly never heard of.
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
  /** User wants films watchable tonight — bias hard toward their services. */
  myServicesOnly?: boolean;
  /** Tonight's mood — every candidate must fit it (label + steering hint). */
  vibe?: { label: string; hint: string } | null;
  /** Soft sparks: films that recently caught their eye (Roll picks, Settle
   *  verdicts, takes). Lean toward their energy, below loved films. */
  recentSparks?: string[];
}

export async function generateRecCandidates(
  req: RecRequest,
  trace?: LlmTrace,
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
    req.recentSparks?.length
      ? `\nCAUGHT THEIR EYE LATELY (weak signals — lean toward this energy, but loved films outrank these):\n${req.recentSparks.join("\n")}`
      : "",
    req.vibe
      ? `\nTONIGHT'S VIBE: "${req.vibe.label}" — ${req.vibe.hint} EVERY candidate must fit this vibe; use the taste threads to pick WHICH films within it, and let each reason connect the vibe to their taste.`
      : "",
    req.myServicesOnly && req.services.length
      ? `\nIMPORTANT: The user wants films they can watch TONIGHT. Strongly prefer films currently streaming on: ${req.services.join(", ")} — but keep them lesser-known. A streamable hidden gem beats a famous catalog staple; never fill the batch with well-known titles just because they stream.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { value, raw } = await completeJson(RECS_SYSTEM, user, RecCandidatesOutput, 6000, trace);
  return { candidates: value, raw };
}

// ── This Meets That — the splice ────────────────────────────────────
// The structured half of the blend (shared genres, pooled keywords) can find
// films that overlap on paper. This is the half that understands WHY three
// films combine — that Lion King + Titanic is "a sweeping doomed-love myth,"
// not "a Drama with a boat in it." Genres and keywords go in as evidence; the
// model's job is to name the offspring and show its work.

const BLEND_SYSTEM = `You are the projectionist of Deep Cut running "This Meets That" — a game where someone names 2-3 films and you name the film that feels like their offspring.

You receive each parent film with its genres, TMDB keywords, and plot summary.

Produce exactly 8 candidates.

Rules:
- Every candidate must be a REAL, released feature film. Never invent titles or years. Never return one of the parent films.
- A true splice inherits from EVERY parent, not just one. If a pick only echoes one parent, cut it. Blend the parents' TONE, THEMES, and STRUCTURE — not just their genres. "Lion King meets Titanic" is a sweeping myth about doomed love and inherited duty, not "an animated film on a ship."
- Rank the list: the most convincing offspring first, the wilder swings last.
- Each "reason" is ONE line, max ~22 words, naming what each parent contributed. Use the parents' actual titles. Example: "The Lion King's succession myth by way of Titanic's class-crossed romance, shot like A Quiet Place."
- Favor films the player probably hasn't seen — a well-known film is allowed when it is genuinely the best answer, but a surprising, lesser-known pick is the better game. Never pad the list with obvious blockbusters.
- Lean post-1970. At most ONE pre-1970 film, and only if it's a perfect answer.
- Respond with ONLY a JSON object, no prose, no markdown fences: {"picks":[{"title":"...","year":1990,"reason":"..."}]}`;

export interface BlendParent {
  title: string;
  year: number | null;
  genres: string[];
  keywords: string[];
  overview: string;
}

export async function generateBlendPicks(
  parents: BlendParent[],
): Promise<{ picks: BlendPicks; raw: string }> {
  const user = [
    "PARENT FILMS:",
    ...parents.map((p, i) =>
      [
        `\n${i + 1}. ${p.title} (${p.year ?? "?"})`,
        `   Genres: ${p.genres.join(", ") || "(unknown)"}`,
        `   Keywords: ${p.keywords.slice(0, 18).join(", ") || "(none)"}`,
        `   Plot: ${p.overview.slice(0, 400) || "(none)"}`,
      ].join("\n"),
    ),
    `\nName the ${parents.length === 2 ? "offspring of these two" : "offspring of these three"}.`,
  ].join("\n");

  // 7000, not 4000: the default model reasons before it emits, and a splice
  // prompt (three plot summaries + keyword lists) is long. Too small an
  // allowance truncates the JSON mid-object and the whole pass throws.
  const { value, raw } = await completeJson(BLEND_SYSTEM, user, BlendPicksOutput, 7000);
  return { picks: value, raw };
}
