# Tests

Normal tests (`npm test`) never touch the network or credentials. The suite runs
against mocks and is the release gate for every commit.

## Live deal preview (opt-in)

`tests/live-deal-preview.test.ts` runs the **real engine** for one member with
simulated persistence — the network boundary intercepts every request and
verifies writes instead of forwarding them. It compares source-order vs
gem-ranked slates on identical inputs, then re-runs both fully offline.

Requires env (from `.env.local`) plus:

- `DEEP_CUT_DEAL_PREVIEW=1` — opt in.
- `DEEP_CUT_PREVIEW_USER_ID` — the member to preview (must have a taste profile;
  the preview cannot regenerate profiles).
- `DEEP_CUT_PREVIEW_VIBE` — tonight's vibe key (default `weird`).
- `DEEP_CUT_PREVIEW_MAX_READS` — raise the 600-read safety ceiling for heavier
  members (wide fan-out from thin pools is legitimate; raise explicitly).

Outputs, in the OS temp dir, mode 0600:

- `deep-cut-deal-preview-*.json` — the artifact: slates, sources, trace, timing.
  No credentials, user IDs, raw requests, or database rows.
- `deep-cut-preview-capture-*.json` — the frozen input set: every intercepted
  response keyed by SHA-256 of the request (bodies included, credentials hashed
  out).

## Capture / replay

Set `DEEP_CUT_PREVIEW_CAPTURE=<capture file>` to replay a past run **fully
offline** (~0.3s, zero API calls). Uses:

- Compare commits against identical inputs: "did my change alter the slate?"
  Run live once to capture, then replay the capture on the new commit.
- Debug a member's deal without spending LLM/TMDB quota.

A replay fails loudly if any request isn't in the capture — including a
generation request whose prompt changed, since request bodies are part of the
key. A stale capture can never silently pass as a fresh result.

## Known limitation: LLM sampling is not seedable

Probed 2026-09: Groq's `seed` parameter is **not honored** for
`openai/gpt-oss-120b` — five identical-seed requests produced five different
outputs. There is deliberately no `LLM_SEED`/`LLM_TEMPERATURE` knob; capture
files are the determinism tool.

## Boundary unit tests

`tests/helpers/preview-boundary.test.ts` covers capture round-trip, zero-network
replay, uncaptured-data failure, body-keyed generation requests, malformed
capture rejection, and credential absence — all offline.
