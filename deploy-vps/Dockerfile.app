# syntax=docker/dockerfile:1.7

# ── Stage 1: deps ───────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──────────────────────────────────────────────
FROM deps AS build
COPY . .
# URL bible-ui injectee par Vite a la compilation (build arg surchargeable)
ARG VITE_BIBLE_UI_URL=https://bible.buck.romain-ecarnot.com
ENV VITE_BIBLE_UI_URL=${VITE_BIBLE_UI_URL}
RUN pnpm --filter @buck/shared build \
 && pnpm --filter @buck/web build \
 && pnpm --filter @buck/api build
# pnpm deploy creates a standalone /deploy dir with flat node_modules
# (resolves all workspace: and hoisted deps — no MODULE_NOT_FOUND in runtime)
RUN pnpm deploy --filter @buck/api --prod /deploy

# ── Stage 3: runtime ────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache sqlite=3.51.2-r0
# Strip bundled npm / corepack / yarn from runtime. Buck uses pnpm at
# build time and runs `node dist/index.js` directly — npm is never
# invoked at runtime. The bundled npm brings transitive HIGH CVEs
# (cross-spawn, glob, minimatch, tar: CVE-2024-21538, CVE-2025-64756,
# CVE-2026-26996/27903/27904/23745/23950/24842/26960/29786/31802).
# Removing npm removes the attack surface with zero functional impact.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack \
           /opt/yarn-* \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg 2>/dev/null || true
COPY --from=build /deploy /app
COPY --from=build /repo/packages/api/migrations /app/migrations
COPY --from=build /repo/packages/web/dist /app/web-dist
COPY vps/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN mkdir -p /app/data /app/workspace \
 && chmod +x /app/docker-entrypoint.sh \
 && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
