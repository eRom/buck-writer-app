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

Dependabot opens weekly PRs for npm, monthly for GitHub Actions and Docker
base images.

A static + SAST audit report lives under `reports/security/` and
`security-audit-*.md`.
