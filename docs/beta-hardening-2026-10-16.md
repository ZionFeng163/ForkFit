# Small beta hardening, 2026-10-16

## Scope

This release targets a small, supervised beta with tens of users. It does not
change Agent prompts, the configured `deepseek-v4.1-flash` model, AI concurrency,
recipe content, or shared Nginx configuration.

- HTTP concurrency is bounded separately from AI concurrency. `scripts/run_api.py`
  defaults to 128 HTTP connections/tasks, a backlog of 128 and a 5-second keepalive.
  Overload returns 503 rather than accepting unbounded work.
- Redis rate limiting fails closed with a retryable 503 when unavailable.
  Preference extraction is limited to three requests per user per ten minutes.
- HTTP error responses, embedding responses and Redis health probes are closed.
- The ForkFit watchdog checks process liveness, tolerates overload (503), and
  requires two failed probes before restarting the affected service.
- Plan UI reports actual stages, distinguishes queued from processing, and does
  not report a polling/network error as a failed AI task. Existing menus remain
  visible during failed refreshes.
- `/zh/help` and `/en/help` document beta limitations, stored data, model-provider
  processing, LangSmith tracing, cookies and manual data requests. No personal
  contact email is published.

## Private feedback

Users submit at `/zh/help#feedback`; administrators use **Admin > 用户反馈**.
Categories are problems, suggestions and data export/deletion requests.

- `POST /feedback`: authenticated, CSRF protected for cookie authentication,
  maximum 2,000 characters, five submissions per ten minutes.
- A client-generated UUID deduplicates retries for the same user and body.
  Reusing an ID for different content returns 409.
- `GET /feedback`: only the authenticated user's submissions and replies.
- `GET /admin/feedback`: administrator-only, status filter and bounded pagination.
- `PATCH /admin/feedback/{id}`: administrator reply and open/resolved status;
  status change and audit record commit in the same transaction. Audit payloads
  contain status, not feedback/reply text.
- Failed submission retains the text. Feedback and replies are rendered as text,
  not HTML. User content is not sent to the LLM or a public issue tracker.
- Submitting or resolving a data request does **not** delete anything. The
  maintainer must verify and fulfil the request manually; no automatic export,
  account deletion or backup erasure is claimed.

Schema change is additive: `site_feedback`, created through the existing
SQLAlchemy startup mechanism. Application rollback must retain this table and
new user submissions, not restore the entire database over live data.

## Incident evidence and limits

Production logged `OSError: [Errno 24] Too many open files` while accepting sockets
on 2026-10-15 at 17:44-17:48 UTC. There were 3,282 matching trace entries, and
3,485 mostly `/posts` requests in the surrounding fifteen-minute window. A restart
at 17:49 UTC recovered the process. The soft descriptor limit was 1,024.

There is no historical descriptor/socket snapshot, so neither a specific leak nor
the original connection source is conclusively identified. These changes add
resource cleanup and bounded admission; they are not proof that every cause of
descriptor exhaustion has been eliminated. Do not turn 503 overload into a
restart loop or claim the failure is impossible.

## Pre-release verification

- Python 3.12 isolated PostgreSQL/Redis backend: `unittest discover -s tests`.
  200 tests, 191 passed and 9 existing skips.
- Frontend: `npm run lint -- --max-warnings=0`, `npx tsc --noEmit`,
  `npx tsc --noEmit -p tsconfig.e2e.json`, production `npm run build`.
- Browser suite: desktop, tablet and mobile, using the isolated 33001/38001
  environment: 56 passed, 4 existing skips, no retries. Covers feedback failure/retry, authenticated submission, admin
  reply, status visibility, progress, disconnect recovery and existing journeys.
  Agent UI tests use controlled responses; they are not new live-model evals.
- Bounded read-only capacity test inside the disposable Docker backend:
  `python scripts/check_http_capacity.py --soak-seconds 120`.
  Initial 1,280 reads all returned 200; 160 held connections produced 127 responses
  with 200 and 33 with 503, then recovered to 200. A further 70 rounds of 160 reads
  all succeeded. Descriptors returned from baseline 12 to final 12; sampled range
  during the soak was 12-17. This is a short local test, not a VPS capacity guarantee.

## Deployment and rollback gates

1. Compare production source hashes and `release.json` with base commit
   `2b8139e003d63792d80431cf0977fdfbf2e62f05`; abort on unexplained differences.
2. Check that runs, meal plans and conversation jobs have no active tasks.
3. Back up the database, changed sources, frontend build and watchdog to
   `/srv/backups/forkfit/20261016-beta-hardening`.
4. Restore the database dump into a disposable PostgreSQL database and query
   it, then delete only the disposable database. Do not restore into production.
5. Run the full backend suite on the VPS with a separate database and Redis.
6. Pause only the ForkFit watchdog around the switch; restart only
   `forkfit-backend` and `forkfit-frontend`. Install the tracked watchdog script.
7. Verify health, frontend routes and source/build hashes; resume the watchdog.
8. Run public read-only browser checks against `https://forkfit.shop`, plus
   internal readiness and service status. Shared Nginx PID must be unchanged.

The deployment helper restores prior application files/build/watchdog on a failed
switch. It does not overwrite user data. The runtime `release.json` records the
actual commit, artifacts, backup path and deployment timestamp; backend test
output is saved as `backend-tests.log` in the release backup directory.

## Beta operation

Start with a small invited group and inspect unresolved feedback and failed jobs.
Keep the existing AI concurrency of one; waiting is presented honestly. Daily
local PostgreSQL backups exist. This release verifies restoration, not off-site
backup delivery. A complete off-site retention policy and self-service account
deletion remain separate work. Live model/provider errors and occasional recipe
quality issues remain possible; existing retry/clarification paths must remain
available.
