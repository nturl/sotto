# Sotto self-hosted image: builds the static client export and runs
# apps/server serving it on the same origin (docs/self-hosting.md).
#
# apps/server has no compile step of its own — it runs its TypeScript
# source directly via tsx (see apps/server/package.json's "dev" script and
# src/index.ts), and so do its workspace deps (@sotto/core, @sotto/content
# export ".ts" files directly, see packages/*/package.json "exports"). So
# the only real build artifact this image produces is apps/client's static
# web export; the runtime stage ships source + a full pnpm install (incl.
# devDependencies, since tsx/typescript are needed at runtime) rather than
# a slimmed prod-only node_modules.
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

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
RUN npm install -g pnpm@11.25.0
ENV NODE_ENV=production \
    SOTTO_HOST=0.0.0.0 \
    SOTTO_PORT=8790 \
    SOTTO_STATIC_DIR=/app/apps/client/dist
# Whole workspace, minus what .dockerignore already excluded from the build
# context (node_modules from the host, docs/screenshots, planning, evidence,
# git history) — pnpm's symlinked node_modules layout means the server's
# and content package's dependencies live partly under the root
# node_modules and partly under each package's own, so copying the full
# tree from the build stage (which already has everything installed and
# built) is the reliable option here rather than hand-picking paths.
COPY --from=build /app /app
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SOTTO_PORT||8790)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@sotto/server", "exec", "tsx", "src/index.ts"]
