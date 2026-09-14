# Visual simplification release

Scope: frontend only. Keep the Material 3 palette, backend contracts, content and database unchanged.

## Changes

- Smaller phrase-aware homepage heading, one introduction, no promotional three-step section.
- Unique homepage recipes, at most three per category; sparse categories remain sparse.
- One Discover search, no featured banner, unchanged stable pagination.
- Quieter cards with two-line titles and aligned actions; bounded detail gallery beside the title.
- Single-column plan form; conversation before shopping, readable cooking steps, collapsed history and rationale.
- Removed redundant publishing hints; unified page headings and profile empty-state primary action.

## Verification

- ESLint with zero warnings, application TypeScript, E2E TypeScript and production build.
- `playwright test visual-layout public hydration pagination --project=desktop`: 7 passed.
- Tablet/mobile public and pagination regression: 8 passed.
- Initial production smoke exposed a premature Save click on the detail page before hydration. Save, Like and Add to plan now wait for the existing authentication-ready state; a blocked-script regression covers the first click and login return URL.
- Visual suite captures 1440x900, 1024x768, 768x1024, 390x844 and homepage 899/901px breakpoint checks.
- Existing isolated admin account only. Conversation edits, failure and undo use browser-intercepted fixtures; no real menus created and no user content changed.
- Long recipe names, 24-item shopping list, eight-message history, image fallback, keyboard disclosure and preserved failed input covered. CSS 200% zoom is a reflow check, not a claim of full browser/screen-reader accessibility certification.
- Screenshots: `/tmp/forkfit-visual-review/`. Captures wait for page spinners and visible image decoding; full-page captures naturally retain fixed mobile navigation at viewport height.

## Known boundaries

- Seed images and some category assignments are inaccurate. These were not hidden by title filtering or changed in this release.
- Local isolated data contains only five published recipes; deduplication intentionally leaves some homepage sections short or absent.
- Agent generation quality and live-model runs are outside this visual release. Functional conversation testing here verifies the UI contract, not model quality.
- Deployment must back up the current frontend artifact and changed source files, retain backend release identity, restart only `forkfit-frontend`, and run production read-only smoke tests.
