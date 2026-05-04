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

### Accepted residual risks

Findings the audit deliberately did not close, with their reasoning:

- **CSP `style-src 'unsafe-inline'`** (REC-11). React + Radix + shadcn +
  Tailwind v4 produce many `style="..."` attributes that the browser
  treats as inline styles. Closing this would require per-request
  nonces (no SSR today, Buck is a Vite SPA) or a Tailwind-v4
  build-time hash export (not yet stable in 4.2). `script-src` already
  excludes `'unsafe-inline'`, which is the high-impact half of the
  protection. Re-evaluate when (a) we move to SSR or (b) Tailwind 4.x
  ships `csp.hashes`.
- **Rate-limiter buckets in RAM** (VULN-005). In-memory `Map` resets on
  container restart, giving an attacker a fresh window after every
  deploy or OOM. Compensating control: Caddy edge `caddy-rate-limit`
  + fail2ban on the host. Re-evaluate when traffic warrants either
  SQLite-persisted buckets or a Redis sidecar.
- **Workspace HTML/SVG inline rendering** (VULN-003). `/api/workspace/file`
  serves `*.html` / `*.svg` with their native MIME, which lets a
  whitelisted user phish themselves on the app's origin. CSP
  `script-src 'self'` blocks <script>-based XSS, but unauthenticated
  CSS / form-action attacks on the same origin remain. Forcing
  `Content-Disposition: attachment` would break the in-UI file viewer
  for legitimate previews; the UX trade-off has not been made.
- **MCP credentials at rest** (REC-08). Today MCP server config stores
  only env-var *names* and a server URL — never a credential. The
  encryption-at-rest work only matters once we let users add custom
  MCPs with their own tokens, which is currently out of scope.
