# Windbrook Client Report Portal

Internal admin tool for **Windbrook Solutions** (Atlanta) — generates pixel-faithful **SACS** (Simple Automated Cashflow System) and **TCC** (Total Client Chart) reports for ~6 high-net-worth families on a quarterly cadence. Replaces a full-day manual assembly process across Word, Canva, Excel, Pinnacle email, Schwab, Zillow, and RightCapital.

> **Design constitution:** read [`CLAUDE.md`](./CLAUDE.md) before touching the codebase. **Source of truth for scope:** [`docs/references/PRD-andrew-windham.md`](./docs/references/PRD-andrew-windham.md).

---

## Stack (locked)

| Layer | Tool |
|---|---|
| Runtime | Node 20+ (TypeScript 5.x, strict) |
| Web | Hono 4 + `@hono/node-server` |
| Templates | Hono JSX (server-rendered) |
| Hypermedia | htmx 2.x (self-hosted) |
| Drag-and-drop | SortableJS (self-hosted) |
| Styling | Tailwind 3 (compiled, no CDN) |
| Database | SQLite + better-sqlite3 + Drizzle |
| Auth | better-auth (email/password) |
| PDF | Playwright (chromium) |
| Validation | Zod |
| Tests | Vitest |
| Package manager | pnpm |

---

## Local setup

```bash
pnpm install
npx playwright install chromium  # first time only — needed for PDF export

cp .env.example .env
# Edit .env: set BETTER_AUTH_SECRET (openssl rand -base64 32)

pnpm db:migrate                 # creates SQLite tables
pnpm db:seed                    # creates the 3 internal users (Andrew, Rebecca, Maryann)
pnpm db:seed:synthetic          # OPTIONAL — adds 3 demo households + 24 reports

pnpm css:build                  # compile Tailwind once
pnpm dev                        # tsx watch + tailwind --watch on http://localhost:3000
```

Default seed credentials (rotate before deployment):
- `andrew@windbrook.dev` / `WindbrookDev2026!` (founder)
- `rebecca@windbrook.dev` / `WindbrookDev2026!` (advisor)
- `maryann@windbrook.dev` / `WindbrookDev2026!` (operations)

### Other commands

```bash
pnpm typecheck                  # tsc --noEmit
pnpm test                       # vitest (locked calculation rules — 23 tests)
pnpm lint                       # biome check
pnpm db:generate                # produce a new Drizzle migration after schema edits
pnpm db:studio                  # browse SQLite via Drizzle Studio
```

---

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway, create a new project → **Deploy from GitHub repo**. Railway picks up the `Dockerfile` automatically.
3. **Add a persistent volume** mounted at `/app/data`. SQLite + generated PDFs live there. Without this, every redeploy wipes the database.
4. Set environment variables (in Railway → Variables):
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
   - `BETTER_AUTH_URL` — your Railway public URL, e.g. `https://windbrook.up.railway.app`
   - `DATABASE_URL` — `file:/app/data/portal.db`
   - `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` — from your Canva developer account (see "Connect Canva" below)
   - `CANVA_REDIRECT_URI` — `https://windbrook.up.railway.app/api/canva/callback`
5. Healthcheck is `/healthz` (declared in `railway.json`).
6. Auto-deploy on `main` branch push: Railway → Settings → Deploy → enable "Auto Deploy".

**First boot after deploy:** Railway will run the migrations baked into the Docker image. Run the seed scripts manually one time:

```bash
railway run pnpm db:seed
railway run pnpm db:seed:synthetic   # only if you want demo data
```

---

## Operational tasks

### Add a real client (manual, ~5 minutes)

1. Log into the portal as Maryann.
2. **Clients** → **+ New household** (top-right of Households page).
3. Fill the long-form profile: name, persons (Add spouse if needed), accounts (the 3 SACS-required Inflow/Outflow/Private Reserve are pre-created), expense budget, liabilities. Save at the bottom.
4. From the client detail page, click **+ New SACS** or **+ New TCC** to generate the first quarter's report.

The PRD's "Data Point List" doc (transcript moment 29:14 in `docs/references/transcript.txt`) is the authoritative field map if you have to track down a specific number.

### Rotate seed passwords

The three default-seeded users share the password `WindbrookDev2026!`. Before any production use:

```bash
# Open SQLite (or use db:studio)
pnpm db:studio
# In the auth_account table, find rows where provider_id = 'credential'
# Replace the password column. The format is better-auth's scrypt hash —
# easiest is to delete the user and re-create via the seed with a new password
# in src/db/seed.ts, then re-run pnpm db:seed.
```

Or — recommended — provision SSO via Microsoft Entra (Phase 11 work) so passwords aren't a thing.

### Connect Canva

Canva Connect API requires a developer account and a registered OAuth app.

1. https://www.canva.dev/ → sign in → create a new "Connect Integration".
2. Set **Redirect URI** to `https://your-railway-url/api/canva/callback`.
3. Required scopes: `design:content:write`, `design:meta:read`, `asset:write`.
4. Copy Client ID + Client Secret into Railway env vars (`CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`).
5. Restart the Railway service.
6. In the portal, **Settings** → **Connect Canva**. Each user authorizes their own workspace.

Tokens are stored AES-GCM encrypted (key derived from `BETTER_AUTH_SECRET`). Disconnecting deletes the row.

### Manual ops

- **Re-download a saved report's PDF**: open the report detail page → click **Download PDF**. The endpoint regenerates from `snapshot_json` (which holds the locked layout from generation time), so the visual is pixel-stable across re-downloads.
- **Reset a client's bubble layout**: report detail page → **Reset to default layout**.
- **Backup**: `railway volume backup`. The single SQLite file at `/app/data/portal.db` plus the `data/reports/` folder are the entire state.

---

## File layout

See [`CLAUDE.md`](./CLAUDE.md) §3. In short:

```
src/
  app.ts, server.ts            Hono entry + Node bootstrap
  db/                          schema.ts, client.ts, migrations/, seed*.ts
  auth/                        better-auth config
  routes/pages/                full-page handlers (return Shell + JSX)
  routes/partials/             htmx fragments (return JSX fragments)
  reports/                     SACS + TCC SVG renderers, PDF engine
  lib/                         calculations.ts (locked math), validation.ts, …
  views/                       JSX components, layouts, pages
  styles/app.css               Tailwind source
public/
  css/, vendor/, fonts/, js/   compiled CSS, htmx, SortableJS, woff2
docs/references/               PRD, transcript, sample SACS PDF, TCC template
data/                          SQLite + generated PDFs (gitignored)
tests/                         Vitest — 23 locked calc tests
```

---

## Verification

Toolchain commands all pass on `main`:

```bash
pnpm typecheck     # zero errors, strict mode
pnpm test          # 23 tests passing
pnpm css:build     # builds public/css/app.css
```

Per-phase verification scripts under `scripts/`:
- `sacs-stale-check.ts` — SACS renderer asserts (stale asterisks, embedded fonts, page sizes)
- `tcc-check.ts` — TCC renderer asserts (stale logic, locked Grand Total formula)
- `export-check.ts` — encryption round-trip + PDF render

---

## Project status

10 phases delivered (Phase 0 through Phase 10). See `docs/walkthrough.md` for the user-facing tour and `CLAUDE.md` for the technical constitution.
