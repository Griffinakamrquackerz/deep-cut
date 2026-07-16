import { z } from "zod";
import { SERVICES } from "./services";

// ── API input schemas ───────────────────────────────────────────────

export const OnboardingInput = z.object({
  movieIds: z.array(z.number().int().positive()).min(8).max(40),
  services: z.array(z.enum(SERVICES)).max(SERVICES.length),
});

export const ReactionEnum = z.enum(["loved", "fine", "not_for_me", "loved_ironically"]);
export const WhyEnum = z.enum(["vibe", "story", "performances", "chaos"]);

export const WatchLogInput = z.object({
  movieId: z.number().int().positive(),
  reaction: ReactionEnum,
  why: WhyEnum.nullish(),
  note: z.string().max(500).nullish(),
  recId: z.string().uuid().nullish(), // when logged from a rec card, mark it seen
});

export const RecBatchInput = z.object({
  obscurityMin: z.number().int().min(1).max(5).default(1),
  obscurityMax: z.number().int().min(1).max(5).default(5),
  myServicesOnly: z.boolean().default(false),
});

export const RecStatusInput = z.object({
  status: z.enum(["active", "watchlisted", "seen", "dismissed"]),
});

export const PlaylistCreateInput = z.object({
  name: z.string().min(1).max(80),
  recipientName: z.string().max(60).nullish(),
  movieIds: z.array(z.number().int().positive()).min(1).max(30),
});

export const PlaylistItemUpdateInput = z.object({
  crossedOff: z.boolean().optional(),
  reaction: ReactionEnum.nullish(),
  note: z.string().max(300).nullish(),
});

export const TakeInput = z.object({
  movieId: z.number().int().positive(),
  body: z.string().min(1).max(300),
});

export const FollowInput = z.object({ userId: z.string().uuid() });

export const ExternalReadInput = z.object({
  movieId: z.number().int().positive(),
  title: z.string().min(1).max(160),
  url: z.string().url().max(500),
});

export const LovedInput = z.object({ movieId: z.number().int().positive() });

export const EventInput = z.object({
  name: z.string().min(1).max(60),
  props: z.record(z.string(), z.unknown()).default({}),
});

// ── LLM output schemas (strict JSON from Claude) ────────────────────

export const TasteThread = z.object({
  title: z.string().min(1).max(60),
  line: z.string().min(1).max(200),
});

export const TasteProfileOutput = z.object({
  threads: z.array(TasteThread).min(3).max(5),
});
export type TasteProfile = z.infer<typeof TasteProfileOutput>;

export const RecCandidate = z.object({
  title: z.string().min(1),
  year: z.number().int().min(1888).max(2030),
  reason: z.string().min(1).max(240),
  obscurity_guess: z.number().int().min(1).max(5),
});

export const RecCandidatesOutput = z.object({
  recs: z.array(RecCandidate).min(1).max(16),
});
export type RecCandidates = z.infer<typeof RecCandidatesOutput>;
