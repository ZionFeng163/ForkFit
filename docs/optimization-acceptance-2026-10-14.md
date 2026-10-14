# Substitution and conversation optimization: 2026-10-14

## Changes

- The substitution tool returns maintained Chinese ingredient names for Chinese
  requests, retaining canonical names and source entries. English responses and
  cached canonical candidates are unchanged. A coverage test requires a Chinese
  label for every substitution in the current catalogue.
- Exact ingredient/alias searches stay within that ingredient's candidates and
  do not call the embedding service. Allergen filtering precedes ranking; no
  eligible exact match returns an empty result rather than unrelated fillers.
- Fuzzy search retains vector ranking. Embeddings load only when needed;
  concurrent initialization is serialized and read-only cache storage does not
  prevent retrieval. Knowledge version is `forkfit-substitutions-v3`.
- Cache keys include cooking context and use structured encoding to prevent
  separator collisions. Translation happens after cache lookup and filtering.
- Real browser testing exposed a pre-existing conversation race: a completed
  unlock enabled another submission before the visible plan's version refreshed.
  Sending now waits for matching conversation and plan versions. A controlled
  delayed-response test verifies the disabled state and preserved next draft.
  Server-side optimistic concurrency remains enforced.

## Verification

- Python 3.12 isolated backend: 187 tests, 178 passed, 9 legacy skips.
- Full desktop/tablet/mobile browser regression: 47 passed in 1.9 minutes,
  4 intentionally skipped duplicate visual runs. Controlled AI responses in
  this suite are separate from the real-model journey below.
- ESLint with zero warnings, application/E2E TypeScript, and production build
  passed. The release frontend targets `http://127.0.0.1:8000`.
- Real `deepseek-v4.1-flash` allergy adaptation used the actual substitution
  tool. Peanut sauce became sesame sauce, all four steps remained, ingredient
  names were Chinese, and embedding requests were zero. The second run took
  35.59 seconds with seven LLM calls and one repair. The first synthetic check
  incorrectly insisted on sunflower butter; corrected it to accept any actual
  eligible tool candidate, without relaxing the allergy or step assertions.
- The first real browser run exposed the stale-version race above. After the
  fix, the unchanged real journey passed in 3.6 minutes on plan
  `plan_804d619250884459be159e50c7810ace`, including preference extraction,
  three-day no-cilantro planning, lock/unlock, local edits, clarification,
  confirmation/cancellation, conflicting equipment requirements, global
  low-salt edits, undo and refresh. Initial generation took 63 seconds.
- The isolated frontend uses production builds, not hot reload. The new
  delayed-response test first ran against the old build and failed; after
  rebuilding it passed. No added sleeps or weaker version checks were used.

## Limits and Release

These changes remove retrieval overhead, not the sequential model review and
repair latency. Do not claim a broad speedup: initial generation remains about
a minute and the real allergy adaptation still needed a repair. The two review
stages, safety guards, confirmation rules and bounded repair remain intact.
Existing recipe quantities, images and broader content quality are unchanged.

Release only after full UI regression. Use the existing backup/rollback flow,
test against a disposable VPS database and Redis before stopping services, and
restart only ForkFit backend/frontend. Preserve Nginx, credentials, uploads,
user data and the production-only verification script. No schema migration or
dependency installation is needed; the packaging metadata only includes the
knowledge JSON assets.
