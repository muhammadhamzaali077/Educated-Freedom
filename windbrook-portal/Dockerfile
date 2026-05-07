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

# Phase-30 — LibreOffice headless for the PPTX → PDF pipeline. Installed
# in the runtime stage; multi-stage Docker doesn't carry apt installs
# forward from earlier stages.
#   - libreoffice-core + libreoffice-impress: minimum needed for `soffice
#     --headless --convert-to pdf` against .pptx
#   - default-jre-headless: required by LibreOffice's PDF export filter
#     (~200 MB; --no-install-recommends keeps the image lean)
#   - fonts-liberation: substitution target when our Geist Variable font
#     isn't on fontconfig's path. LibreOffice picks Liberation Sans for
#     missing sans-serif faces, which renders close to Geist
#   - fonts-lato: secondary fallback used by some PowerPoint layouts
# Note: we ship Geist as woff2 only (public/fonts/Geist-Variable.woff2).
# fontconfig doesn't index woff2, so LibreOffice substitutes. To get
# exact Geist rendering through LibreOffice, check in a Geist .ttf at
# public/fonts/Geist-Variable.ttf and uncomment the COPY+fc-cache block
# below (see Phase 30 notes in CLAUDE.md).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core libreoffice-impress \
    default-jre-headless \
    fonts-liberation fonts-lato \
    && rm -rf /var/lib/apt/lists/*

# Optional: install Geist as a system font for exact LibreOffice matching.
# Requires public/fonts/Geist-Variable.ttf to exist (we currently only
# have woff2). Uncomment when a TTF is added.
# COPY public/fonts/Geist-Variable.ttf /usr/share/fonts/truetype/geist/
# RUN fc-cache -f -v

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
