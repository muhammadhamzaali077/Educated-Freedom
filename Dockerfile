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

# Chromium runtime libraries — Playwright needs these for headless PDF export.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxkbcommon0 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copy production deps + built CSS from earlier stages, then the source
# from the windbrook-portal/ subdirectory.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public/css ./public/css
COPY windbrook-portal/ ./

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
