# Repo-root Dockerfile — Railway deploys with Root Directory = / and we
# can't change that from code. Each COPY path explicitly references the
# windbrook-portal/ subdirectory; the resulting image is identical to
# what you'd get from `docker build windbrook-portal/`.
#
# Final image: Node 20 + chromium (for Playwright PDF export) + compiled
# Tailwind CSS + the source TS (run via tsx).
#
# Persistent storage: /app/data — attach a Railway Volume to this mount
# path via the Railway dashboard. (We deliberately do NOT use a Dockerfile
# `VOLUME` instruction — Railway's Dockerfile builder rejects that.)
FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---------- deps stage ----------
FROM base AS deps
WORKDIR /app
COPY windbrook-portal/package.json windbrook-portal/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build stage (compile Tailwind, run typecheck) ----------
FROM deps AS build
WORKDIR /app
COPY windbrook-portal/ ./
RUN pnpm css:build
RUN pnpm typecheck

# ---------- runtime stage ----------
FROM base AS runtime
WORKDIR /app

# Copy production deps + built CSS from earlier stages, then the source
# from the windbrook-portal/ subdirectory.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public/css ./public/css
COPY windbrook-portal/ ./

# Playwright chromium — install in the runtime stage so the browser binary
# lands at the path Playwright's launch() looks at by default
# (/root/.cache/ms-playwright/...). `--with-deps` pulls every shared
# library chromium needs (libnss3 / libatk / libcups / fonts / etc.) so
# we don't have to enumerate them here. Production-stage install is the
# preferred fix because pdf.ts calls chromium.launch() with NO
# executablePath — it relies on the default browser-cache lookup. An
# apt-get system chromium would only work if pdf.ts passed
# executablePath: '/usr/bin/chromium' explicitly.
RUN npx --yes playwright install --with-deps chromium

# Volume mount path — Railway must attach a Volume to /app/data via the
# dashboard (Service → Settings → Volumes → Mount Path = /app/data).
# No `VOLUME` directive — Railway's Dockerfile builder rejects it.
RUN mkdir -p /app/data /app/data/reports

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
