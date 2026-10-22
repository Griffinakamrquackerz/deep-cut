import { z } from "zod";
import { SERVICES } from "./services";
import { VIBE_KEYS } from "./vibes";

// ── API input schemas ───────────────────────────────────────────────

export const OnboardingInput = z.object({
  movieIds: z.array(z.number().int().positive()).min(8).max(60),
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
  obscurityMin: z.number().int().min(1).max(5).default(2), // house default: skip the top 40
  obscurityMax: z.number().int().min(1).max(5).default(5),
  myServicesOnly: z.boolean().default(false),
  vibe: z.enum(VIBE_KEYS).nullish(),
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

export const FollowInput = z.object({ userId: z.string().uuid() });

export const ExternalReadInput = z.object({
  movieId: z.number().int().positive(),
  title: z.string().min(1).max(160),
  // z.string().url() alone accepts ANY scheme — javascript:, data:, file: —
  // and these links are published to every viewer of a film page and opened
  // with Linking.openURL in the app. A member-supplied javascript: URL is not
  // a link, it's a payload. Only the two schemes a "further reading" link can
  // legitimately use.
  url: z
    .string()
    .url()
    .max(500)
    // The try/catch is load-bearing, not defensive habit. Zod still runs a
    // refinement after an earlier check has failed, so on input like "not a
    // url" the bare `new URL(u)` threw straight out of safeParse — turning
    // what should be a 400 into a 500. A test caught it.
    .refine(
      (u) => {
        try {
          return /^https?:$/.test(new URL(u).protocol);
        } catch {
          return false;
        }
      },
      { message: "Links must start with http:// or https://" },
    ),
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

// ── This Meets That — the splice ────────────────────────────────────
// One offspring film, plus the line explaining which parent gave what.
export const BlendPick = z.object({
  title: z.string().min(1),
  year: z.number().int().min(1888).max(2030),
  /** "The Lion King's succession myth, Titanic's doomed romance." */
  reason: z.string().min(1).max(240),
});

export const BlendPicksOutput = z.object({
  picks: z.array(BlendPick).min(1).max(10),
});
export type BlendPicks = z.infer<typeof BlendPicksOutput>;
