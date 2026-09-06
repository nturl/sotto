# Sotto self-hosted image: builds the static client export and runs
# apps/server serving it on the same origin (docs/self-hosting.md).
#
# apps/server has no compile step of its own — it runs its TypeScript
# source directly via tsx (see apps/server/package.json's "dev" script and
# src/index.ts), and so do its workspace deps (@sotto/core, @sotto/content
# export ".ts" files directly, see packages/*/package.json "exports"). tsx
# and typescript are regular `dependencies` of apps/server (not
# devDependencies) precisely so a production-only install still includes
# them. The runtime stage therefore installs only @sotto/server's
# production dependency graph (`--prod --filter "@sotto/server..."`)
# instead of the full monorepo install — this also drops apps/client's and
# packages/voice's much larger dependency trees (Expo/React Native,
# transformers.js, web-llm), which the server never needs; only the
# client's static web export (built below) ships to the runtime stage.
#
# apps/server also serves /content/packs directly from
# packages/content/packs on disk (apps/server/src/app.ts,
# CONTENT_PACKS_DIR), resolved three directories above its own source —
# so the runtime image must keep the monorepo's relative layout intact,
# not just copy apps/server in isolation.

ARG NODE_VERSION=26-slim

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN npm install -g pnpm@11.25.0
# Playwright is a root devDependency (e2e scripts) but its browser binaries
# are never needed inside this image (e2e runs against the container from
# outside) — skip the download so `pnpm install` doesn't fetch ~300MB of
# Chromium for nothing.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/voice/package.json packages/voice/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Re-run install now that full workspace source is present (some packages'
# postinstall/build steps read source files, and this also catches a
# lockfile drift the package.json-only install above wouldn't).
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @sotto/client web:export

# Production-only node_modules, scoped to @sotto/server and the workspace
# packages it actually depends on (@sotto/core, @sotto/content). Built
# fresh, not layered on `deps`'s full install, so the result is exactly
# this one command's output: no devDependencies, no apps/client or
# packages/voice trees.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY . .
RUN pnpm install --prod --frozen-lockfile --filter "@sotto/server..."

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
RUN npm install -g pnpm@11.25.0
ENV NODE_ENV=production \
    SOTTO_HOST=0.0.0.0 \
    SOTTO_PORT=8790 \
    SOTTO_STATIC_DIR=/app/apps/client/dist
# Source + monorepo layout (minus what .dockerignore excluded) plus the
# production-only, server-scoped node_modules from prod-deps above — keeps
# apps/server nested under the root the same three levels above
# packages/content that CONTENT_PACKS_DIR expects. prod-deps never installs
# apps/client's dependencies, so its static export is copied in separately
# from the build stage.
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/client/dist /app/apps/client/dist
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SOTTO_PORT||8790)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@sotto/server", "exec", "tsx", "src/index.ts"]
