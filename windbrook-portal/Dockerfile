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

# Tell Playwright to use the system chromium (no separate ~280 MB download).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copy production deps + built assets.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public/css ./public/css
COPY . .

# Volume for SQLite + PDFs. Mount a Railway volume here.
RUN mkdir -p /app/data /app/data/reports
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck mirrors what Railway uses via railway.json
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
