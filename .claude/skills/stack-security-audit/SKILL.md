---
name: stack-security-audit
description: Run the repo's local Gitleaks and Trivy security scans, interpret reports, and handle secrets safely. Use when the user says "security audit", "scan for secrets", "run Gitleaks", "run Trivy", "check image vulnerabilities", "scan the stack", or asks about pre-commit security checks. Never use external scanners that upload code or edited files.
---

# Stack Security Audit

## When to use
- Before a risky change, upgrade, or PR.
- When secrets, tokens, or credentials may have entered the repository.
- When image CVEs or fixable HIGH/CRITICAL vulnerabilities are suspected.

## Authoritative sources
- `scripts/scan.sh` — pinned Gitleaks and Trivy versions, image list, reports.
- `.gitleaks.toml`, `.gitleaksignore` — rules and reviewed false positives.
- `.pre-commit-config.yaml` — local commit hooks.
- `README.md` security section.
- `CURRENT_STATE.md` and `docs/PRACTICES-ROADMAP.md` for past incidents.

## Hard rules
1. Run only local tooling: `make scan-secrets`, `make scan-images`, or `make scan`.
2. Do not install or use scanners that send files to external services.
3. Reports go to gitignored `reports/`.
4. Never print real secret values from reports; summarize by file, rule, and line.
5. A secret in git history must be rotated/revoked, not merely deleted.
6. Gitleaks false positives must be reviewed individually and fingerprinted; never blanket-allow.
7. Do not auto-edit `.gitleaksignore` without explaining why and getting approval.

## Steps
1. Confirm Docker is running if container-based scanners are needed.
2. Run `make scan-secrets` for files and full git history.
3. Run `make scan-images` for locally present stack images.
4. Run `make scan` when both are needed.
5. Review `reports/gitleaks.json` and `reports/trivy-*.txt`.
6. For Trivy findings, report fixable HIGH/CRITICAL issues by image and package.
7. For Gitleaks findings, classify as true positive, reviewed false positive, or needs human review.
8. Recommend rotation/revocation for true secrets and a deliberate image/base-image bump for CVEs.

## Checks
- Scanner versions are pinned in `scripts/scan.sh`.
- `STACK_IMAGES` matches `scripts/stack.sh` service images.
- Reports exist and are gitignored.
- No token, password, DSN, or API key value appears in the final report.

## Output format
Report:
1. Commands run.
2. Secret-scan result and count by classification.
3. Image-scan result with CRITICAL/HIGH counts.
4. Required rotations or upgrades.
5. Files that need review, with no secret values.
6. Whether the branch is safe to proceed.
