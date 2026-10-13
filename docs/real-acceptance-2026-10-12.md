# Real-model acceptance: 2026-10-12

## Scope and outcome

Tested with `deepseek-v4.1-flash` against the isolated local Docker stack
(`127.0.0.1:33001`, backend `38001`), not production user accounts or content.

- Full browser regression: 47 passed, 4 intentionally skipped duplicate visual
  runs across desktop/tablet/mobile. Some AI UI cases use controlled responses;
  these are not counted as real-model acceptance.
- Real-model browser journey: passed in 3.2 minutes. Final plan:
  `plan_2b72dc110a8e492a9548fe4c59238cf0`. Initial generation took 64 seconds.
- Real steps covered: preference extraction, selecting three existing recipes,
  no-cilantro planning, locking day 1, reducing salt on day 2 only, clarification,
  undo, unlock and undo, cancelling a locked-day change, confirming an equipment
  conflict, receiving a human question without overwriting the menu, unlocking,
  confirming a global low-salt change, undo and refresh recovery.
- Saved-version audit: nine versions; all three global edits changed cooking
  instructions and retained all four original steps. Cilantro was absent from
  ingredients. The instruction "do not sprinkle cilantro" is a prohibition,
  not evidence of using it; inspected the actual text as well as assertions.
- Separate real allergy adaptation used the actual substitution tool and passed
  final review: peanut butter noodles became sunflower-seed-butter noodles.
  It took 29 seconds and seven model calls, before the atomic-step improvement.
- Python 3.12 backend: 176 tests, 167 passed, 9 legacy tests skipped.
- ESLint with zero warnings, E2E TypeScript and `git diff --check`: passed.

## Failures found and fixed

1. Browser tests still targeted an obsolete form label. Updated the locator and
   pinned real-test selections to known catalogue recipes, including one that
   actually contains cilantro.
2. Reviewers separately authored per-requirement checks and aggregate verdicts
   or issues. Contradictions caused technical failures even when the checks
   were usable. Aggregate results now derive from validated checks; hard
   constraints, reference checks and deterministic rejection remain enforced.
3. Recipe evidence excluded real fields such as tags, cooking time and day.
   Supported fields now match the recipe data. Requests include valid indices;
   bounded repair gets the specific invalid reference and previous review.
   Missing checks, invented fields and out-of-range references still fail.
4. A local day edit passed the original recipe slot ("lunch") rather than its
   assigned day. Pass a copied recipe with the correct plan day; never mutate
   the original recipe or other days.
5. Whole-list `replace_steps` allowed a salt-only edit to replace all preparation
   with one changed step. Added `replace_step` with an exact original target,
   leaving untouched steps in code. Whole-process replacement remains available
   but cannot be mixed with atomic edits on the same recipe.

Earlier failing real plans and runs were retained in the isolated database for
diagnosis. The final pass followed fixes, not a removal of failing assertions.

## Reproduce

From `apps/web`, against the existing isolated test stack:

```sh
E2E_REAL=0 E2E_TARGET=local E2E_BASE_URL=http://127.0.0.1:33001 npx playwright test --reporter=line
E2E_REAL=1 E2E_TARGET=local E2E_BASE_URL=http://127.0.0.1:33001 npx playwright test --project=real-desktop --reporter=line
```

The real test creates disposable test data and consumes provider tokens.
Successful screenshot: `/tmp/forkfit-real-derivedverdict-20261012/meal-plan-真实模型：口味提取、规划完成、锁定、局部调整、澄清和撤销-real-desktop/real-conversation-completed.png`.

## Release boundary and remaining limitations

Backend-only change; no API removal, schema migration, environment change or
frontend rebuild is needed. Before deployment, compare file checksums against
the previous release, back up application files and database, ensure no active
jobs, and restart only `forkfit-backend`. Preserve other services and data.

This is one complete passing real conversation plus focused real allergy
coverage, not a statistical success-rate guarantee or load test. Generation
still takes about a minute in the final run. Seed recipes still lack some
quantities; the substitution result retained an English ingredient label.
Those content/localization issues remain separate from this reliability fix.
