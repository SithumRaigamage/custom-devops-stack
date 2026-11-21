# Design — J10: Merge the JobTrigger `Jenkins/` folder to `develop`

## What will change
- In the **JobTrigger** repository (separate repo, linked worktree at
  `/private/var/folders/…/opencode/jobtrigger-J1/`), merge the tested branch
  `docs/product-proposals-phase-26` into `develop`. The branch contains 10
  commits, including the six `Jenkins/<component>/Jenkinsfile` files and the
  phase-26/27 task docs. `develop` has moved on by 18 commits, so this is a real
  merge, not a fast-forward.
- Push the resulting `develop` to `origin`. The feature branch and the original
  JobTrigger checkout on `feat/owner-decisions-1-0` are left untouched.
- Switch all six JobTrigger jobs in Jenkins from `*/docs/product-proposals-phase-26`
  to `*/develop`:
  - `JobTrigger-backend-CI`, `JobTrigger-frontend-CI`,
    `JobTrigger-security-CI`, `JobTrigger-tools-CI`,
    `JobTrigger-website-CI`, `JobTrigger-release-CD`.
- Verify with a quick job (website or tools, `SEND_EMAIL=false`) that Jenkins
  builds successfully from `develop`. The known release EINTR issue (J11) is
  unaffected and remains open.

## Files touched
- JobTrigger repo: `develop` branch history only (merge commit); no source files
  are hand-edited.
- Jenkins runtime job `config.xml` files for the six jobs (written through
  Jenkins, not by hand-editing).
- `docs/design/J10-merge-jenkins-folder-to-develop.md` (this note),
  `docs/backlog.md`, `docs/CHANGELOG.md`.

## Pre-flight checks already done
- `git merge-tree develop HEAD` reports no conflict markers → clean merge.
- `develop` == `origin/develop` (8dec860); no remote drift at inspection time.
- Original JobTrigger checkout is clean on `feat/owner-decisions-1-0`.
- All six job branch specs currently point at
  `*/docs/product-proposals-phase-26`.

## Approval gate
- This changes another repository's `develop` branch, pushes to a remote, and
  reconfigures six jobs. Ask for explicit approval before doing any of it.
  No commits to `main`, no force-push, no container or volume changes.

## Verification
- `git log --oneline -3 develop` shows the merge commit; `git status` clean;
  `origin/develop` matches local after push.
- Six job configs show `<name>*/develop</name>`.
- A smoke build from `develop` passes with `SEND_EMAIL=false`.
- No secrets printed or committed.

## Interim outcome (2026-11-21) — BLOCKED
- With approval, the merge was performed locally in the JobTrigger worktree:
  `develop` now has merge commit `368d3e5` (clean `ort` merge, all six
  Jenkinsfiles present). The feature branch and the original checkout are
  untouched.
- Pushing `develop` to `origin` was **rejected** by GitHub branch protection
  (`GH006`): 9 required status checks (`analyze-and-test`, `build-android`,
  `build-ios`, `test (22.x)`, `web`, `secrets`, `dependencies`,
  `backend-image`, `manifest`). Existing PR #149 is open, mergeable but
  `BEHIND`, with **0** reported checks and no workflow runs on the branch.
- User asked to stop work in the JobTrigger repo and keep this session in
  `custom-devops-stack`. Decision: leave J10 **open/blocked**; do **not** switch
  the six Jenkins jobs to `*/develop` because the Jenkinsfiles are not on the
  remote `develop`. The local merge commit remains unpushed (no push, force-push,
  or branch-protection change was made).
