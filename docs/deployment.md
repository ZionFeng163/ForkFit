# Git is the source of truth

All application changes must be committed and pushed to `origin/main` before
deployment. Do not use loose server files as a newer application version, copy
partial tests between releases, or write application fixes only on the VPS.

## Release gates

1. Fetch `origin`, confirm the intended commit, and require a clean local tree.
   Run `python3 scripts/check_git_release.py --ref origin/main` after committing.
2. Build/test the exact commit. Produce source archives with `git archive`, not a
   directory copy that might include uncommitted files. Read previous file content
   with `git cat-file blob <commit>:<path>`; a missing path is not an empty file.
3. Before updating the VPS, run the same read-only audit against its currently
   installed source commit. Unexpected changes stop deployment. Inspect and back
   them up; useful changes go into Git first. Never run `git clean -fdx` or a blind
   hard reset on the production checkout.
4. Back up the database, source changes, build and release metadata. Verify the
   database dump can restore into a separate temporary database. Wait for active
   AI jobs to finish. Keep the existing service-specific rollback procedure.
5. For normal releases from a clean server checkout, use `git fetch origin` and
   `git merge --ff-only <verified-commit>`. Switch a frontend build only if it was
   built from that commit. Restart only the affected ForkFit services.
6. Audit all Git-tracked files, file modes, HEAD and index, not just this release's
   changed files. Run public read-only browser checks and internal readiness.
   `python3 scripts/check_git_release.py --ref <verified-commit>` must exit zero.

`release.json` is generated runtime metadata, not a source of application code.
Record `source_commit`, `backend_commit`, `frontend_commit`, artifact hashes and
backup path. For an operations/docs-only commit, the source checkout may advance
without rebuilding unchanged application artifacts; retain their actual commit
IDs instead of falsely relabelling the binaries. Remove obsolete artifact entries
from the current record after preserving the previous record in the backup.

## Data boundary

Never commit or overwrite production `.env` files, `/etc/forkfit`, uploaded user
images, databases, dependency directories or build outputs as part of Git cleanup.
They remain on disk and are backed up independently. Ignore rules do not untrack
the two existing legacy image assets already in Git; do not add new user uploads.
Unknown untracked source files must be inspected, not hidden by ignore rules.

## 2026-10-17 reconciliation

The VPS HEAD/index had lagged behind copied release files. A complete comparison
against `844b505` found application sources matched Git; differences were three
old verification/test files and two absent E2E files. The server-only verification
script was an older version, not a newer fix. Preserve the old Git metadata and
those files in `/srv/backups/forkfit/20261017-git-reconcile` before aligning them.
Move the obsolete `build/lib` source copy into that backup, leaving live `src`,
the running frontend build, uploads and configuration intact.

Initial online checks: public browser tests 4/4 passed; database, Redis, executor
and model configuration readiness OK; 40 bounded reads returned 200; backend had
14 open descriptors. Shared Nginx PID remained unchanged. Model readiness is a
configuration check, not a new live-model quality evaluation.
