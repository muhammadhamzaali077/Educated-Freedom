# Multi-stage build for the Windbrook portal.
# Final image carries Node 20 + chromium (for Playwright PDF export) + the
# compiled Tailwind CSS + the source TS (run via tsx).
# Persistent storage:
#   /app/data — SQLite + generated PDFs (mount Railway volume here)
FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---------- deps stage ----------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build stage (compile Tailwind, run typecheck) ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm css:build
RUN pnpm typecheck

# ---------- runtime stage ----------
FROM base AS runtime
WORKDIR /app

# Copy production deps + built assets.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public/css ./public/css
COPY . .

# Playwright chromium installed in the RUNTIME stage so the browser binary
# lands at the path Playwright's chromium.launch() looks at by default
# (/root/.cache/ms-playwright/...). `--with-deps` pulls all the shared
# libraries chromium needs (libnss3 / libatk / libcups / fonts / etc.) so
# we don't enumerate them here.
#
# pdf.ts calls chromium.launch() with no executablePath, so it relies on
# Playwright's default browser-cache lookup. Setting an apt-get system
# chromium via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (an env var that does
# not actually exist in Playwright) was a no-op — that's why the previous
# image had chromium installed but pdf.ts couldn't find it.
RUN npx --yes playwright install --with-deps chromium

# Volume mount target for SQLite + PDFs. Railway must attach a Volume to
# /app/data via the dashboard (Service → Settings → Volumes → Mount Path =
# /app/data). The Dockerfile `VOLUME` directive is intentionally absent —
# Railway's Dockerfile builder rejects it.
RUN mkdir -p /app/data /app/data/reports

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck mirrors what Railway uses via railway.json
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
