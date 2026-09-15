# Personalization review contract (v3.1)

## Flow

Input analysis -> per-recipe adaptation -> patch application -> output review ->
at most one repair -> patch application -> output review -> commit or ask the user.

This refines the existing v3 subgraph; it does not add another Agent role.
Normal changed requests have two logical reviews. A repaired candidate has a third
review. Malformed model responses have a separate bounded format retry and never
count as successful reviews.

## Inputs and outputs

| Stage | Inputs | Outputs |
| --- | --- | --- |
| Input review | Relevant explicit profile, current/effective request, original recipes | ConstraintSpec, targeted conflicts with exact recipe/ingredient references, adjustment instructions, clarification if necessary |
| Adaptation | Original target recipe, constraints, original request, targeted findings | Minimal RecipePatch and tool-approved replacement candidates |
| Output review | Original and adjusted recipes, original request, full normalized constraints/preferences, deterministic findings | Evidence-linked checks, pass/warn/block, located issues and repair instructions |
| Repair | Same original baseline plus rejected candidate and located issues | Replacement patch relative to the original, not an incremental patch applied twice |

Output review includes integrity, identity, time, servings and each stored preference.
Warnings are for soft shortcomings only. Deterministic high-severity findings remain
blocking even if the model says pass. Review format validation checks requirement
coverage and recipe evidence references, but cannot prove semantic correctness.

## Human clarification

- Unrepairable changes return the original recipe, no accepted change log, and a
  focused question. Allergy/dietary restrictions are not silently relaxed.
- Single-recipe UI displays the question as a chat message and sends the answer to
  the existing `/runs/{id}/resume` endpoint. The answer is explicitly marked in the
  stored request; uncertain allergy statements still require clarification.
- Plan edits convert domain-level needs-input outcomes to `needs_clarification`,
  not infrastructure failures. The existing message table stores an assistant
  reply; no plan version is created. The next answer carries the pending request
  context in the existing patch payload, preserving it across process restarts.
- Context is bounded; original requests are not silently truncated. Authorization,
  optimistic version checking and confirmation of high-impact changes still apply.
- Model/network/invalid-schema failures remain retryable errors rather than asking
  a user to diagnose infrastructure.

## Verification

- Local Python 3.12 isolated backend suite, browser chat reply/failure/retry tests,
  frontend lint, TypeScript and production build.
- Real `deepseek-v4-flash-0731`: 20 reviewer diagnostics passed, including forbidden
  ingredients only in steps, compliant controls and non-blocking soft preferences.
- Real tool call and two-day planning subgraph verification passed on synthetic data.
- No production user recipes or plans were created by these checks. Results do not
  imply universal dietary or medical safety, or zero semantic-model errors.
