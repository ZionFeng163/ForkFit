# Planning subgraph contract (meal-plan-v4.1)

The three parallel planners remain: home balance, ingredient reuse, and cooking
rhythm. They propose combinations of selected recipe IDs, not rewritten recipes.

## Shared input

Every draft, review, and repair receives the same request, user profile,
normalized constraints from recipe review, fixed dates, full recipe steps and
ingredients, and identified requirements. Fixed dishes bypass adaptation and are
materialized from the existing version, not copied back after menu review.

## Review and release

The reviewer must assess every candidate against every requirement. Each check
contains status, evidence, affected dates/recipe IDs, and a repair action when
not passing. Missing coverage, invalid references, contradictory verdicts, or
an out-of-range winner fail closed; they are protocol errors, not user conflicts.

Code excludes candidates with structural violations or blocked checks. Explicit
allergy, diet and equipment warnings cannot be used to release a candidate.
If the proposed winner is blocked but another assessed candidate qualifies,
code selects an eligible candidate. If all are blocked, one candidate may be
repaired once, with the original task and structured review checks retained.
The candidates are reviewed again before publishing; another rejection asks
the user rather than publishing an invalid menu.

Day-specific adaptations after a global replan are reviewed again as a complete
composition. No failed modification replaces the current version.

## Execution limits

Review receives sequential time totals and shared cookware. Unambiguous Chinese
whole-meal limits such as "每餐30分钟内" additionally use a conservative sequential
time check; the system does not invent parallel cooking savings. This is not a
general scheduling solver. Other time wording and preparation/soaking/cooling
details remain semantic review responsibilities. Recipe time quality is still a
data limitation, and the product does not guarantee nutrition or food safety.

## Initial clarification

The existing conversation endpoint accepts replies before Version 1 when a plan
is `needs_input`. Questions and replies are persisted. A typed internal marker
routes these messages to initial planning, preserving the original request and
answers. Successful completion saves Version 1 and message completion in one
transaction. Duplicate submission is rejected while processing; late failures
cannot overwrite an applied message. Completed clarification turns are no longer
pending when the user starts editing the generated menu.

Database and API schemas are unchanged. Frontend shows a conversation instead of
the previous terminal error panel, preserves text on submission failure, and
refreshes the result when Version 1 becomes available.
