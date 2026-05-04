# Security Policy

## Reporting a vulnerability

Buck Writer is a personal, client-grade writing app. If you believe you have
found a security vulnerability — do NOT open a public GitHub issue.

Email **romain.ecarnot@gmail.com** with:

- a short description of the issue and the affected component
  (api, web, bible-mcp, infra, …),
- steps to reproduce or a proof-of-concept,
- the commit hash you tested against,
- any suggested remediation.

### SLA

The project is maintained by a single person. Expected response times:

| Severity | First ack | Fix or mitigation |
|---|---|---|
| Critical (RCE, auth bypass, data exfiltration) | 48 h | 7 days |
| High (privilege escalation, SSRF, SQLi) | 72 h | 14 days |
| Medium / Low | 7 days | next release window |

Please do not publicly disclose until a fix has shipped to `main` and the
affected deployment has been upgraded.

## Supported versions

Only `main` is supported. There are no backported security patches for past
tags.

## Scope

In scope:

- `packages/api`, `packages/web`, `packages/bible-mcp`, `packages/shared`,
  `packages/bible-ui`
- Dockerfiles, docker-compose, `.github/workflows/*`
- any secret exposure in git history

Out of scope:

- third-party MCP servers we connect to (report upstream)
- OpenAI platform-level issues (report to OpenAI)
- Hostinger VPS infrastructure (report to Hostinger)

## Security tooling

Every push and PR runs, via `.github/workflows/security.yml`:

- `pnpm audit --prod --audit-level high`
- Semgrep (typescript / nodejs / security-audit / jwt / sql-injection)
- Gitleaks (full history)
- Trivy fs (HIGH + CRITICAL, fail on findable CVEs)

Every push and PR also runs, via `.github/workflows/codeql.yml`:

- CodeQL on `javascript-typescript` with the `security-extended` query
  pack. SARIF is published as a workflow artifact (this repo is private
  without GitHub Advanced Security, so the Code scanning UI cannot accept
  the results; toggle on GHAS or make the repo public to switch the
  workflow to native Security-tab integration).

Each `buck-v*` tag triggers `.github/workflows/release.yml`, which after
the GHCR push runs:

- Trivy image scan on every published image (HIGH + CRITICAL fixable,
  `exit-code: 1`). A failing scan fails `build-push`, which blocks the
  downstream `dispatch` from triggering the production deploy.

Dependabot opens weekly PRs for npm, monthly for GitHub Actions and Docker
base images. Dependabot vulnerability alerts and automated security
updates are enabled at the repo level.

A static + SAST audit report lives under `reports/security/` and
`security-audit-*.md`.

### Settings still requiring manual action

These need GitHub Pro or GHAS, which the repo does not currently have:

- Branch protection on `main` requiring the security checks above.
- Code scanning UI (Security tab) for CodeQL findings.

Until those are enabled, `main` is conventionally protected by the solo
maintainer and CodeQL findings ship as workflow artifacts.
