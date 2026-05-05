# Windbrook Client Report Portal — Project Constitution

> Read this file first. It is the source of truth for conventions, locked rules, and design decisions. Where this file disagrees with anything else, **this file wins**. The PRD at `docs/references/PRD-andrew-windham.md` is the source of truth for product scope.

---

## 1. Project Overview

The Windbrook Client Report Portal is an **internal admin tool** for a 3-person wealth-advisory firm (Andrew Windham, Rebecca Romney, Maryann Pastrana — Atlanta) that generates the firm's two flagship client documents — **SACS** (Simple Automated Cashflow System) and **TCC** (Total Client Chart) — for ~6 high-net-worth families on a quarterly cadence. Today these documents are stitched together by hand from Word, Canva, Excel, and four data sources; preparing for one client meeting takes a full day. The portal replaces that whole assembly process: enter current-quarter balances into a checklist, every total renders deterministically, click "Download PDF" or "Export to Canva." Time-to-prep drops from a day to under an hour. The portal is the *report-generation* source of truth — not a CRM.

---

## 2. Stack & Versions

Locked. Do not deviate without an explicit written decision in this file.

| Layer | Tool | Version |
|---|---|---|
| Runtime | Node.js | `>=20.0.0` |
| Language | TypeScript (strict mode) | `^5.7.2` |
| Web framework | Hono | `^4.6.14` |
| Server adapter | `@hono/node-server` | `^1.13.7` |
| Templates | Hono JSX (server-rendered, never client React) | bundled with Hono |
| Hypermedia | htmx (self-hosted at `/vendor/htmx.min.js`) | `2.0.4` |
| Drag-and-drop | Native pointer events on SVG `<g>` elements (Phase 16 — replaces SortableJS) | — |
| Styling | Tailwind CSS (compiled, no CDN) | `^3.4.17` |
| Database | SQLite via `better-sqlite3` | `^11.7.0` |
| ORM | Drizzle ORM + drizzle-kit | `^0.38.3` / `^0.30.1` |
| Auth | `better-auth` (email/password; Microsoft SSO is V2) | `^1.1.10` |
| PDF | Playwright (chromium only) | `^1.49.1` |
| Validation | Zod | `^3.24.1` |
| Date handling | `date-fns` (no Moment, no Day.js) | `^4.1.0` |
| Lint/format | Biome (single tool for both) | `^1.9.4` |
| Tests | Vitest | `^2.1.8` |
| Package manager | pnpm | (any recent) |

**Forbidden in V1:** React, shadcn, Radix, Next.js, any client-side framework. CDN-loaded htmx or fonts. SortableJS (replaced in Phase 16 with native SVG pointer events — see §12). Inter, Roboto, Arial, system-ui as a display face. AI/LLM in the report pipeline. Glassmorphism, heavy box-shadows, emoji as iconography.

---

## 3. Folder Conventions

```
src/
  app.ts                  Hono app: middleware + route mounting
  server.ts               Node bootstrap (port, listen)
  db/
    client.ts             Drizzle client + better-sqlite3 connection
    schema.ts             ALL tables live here
    migrations/           drizzle-kit output
  auth/
    index.ts              better-auth instance
  routes/
    pages/                Full-page handlers — return Shell + body JSX
    partials/             htmx fragment handlers — return JSX fragments
    api/                  JSON endpoints (Canva, future webhooks)
  views/
    layouts/shell.tsx     Root HTML shell (head, vendor scripts, body)
    components/           Reusable JSX components (Wordmark, Button, …)
  reports/
    sacs/                 SACS SVG renderer (Phase 5)
    tcc/                  TCC SVG renderer (Phase 6)
    pdf.ts                Playwright PDF service (Phase 8)
  lib/
    calculations.ts       Locked math (Phase 4) — every number traces here
    canva.ts              Canva Connect API client (Phase 9)
    format.ts             Currency / date / quarter formatters
  middleware/
    auth.ts               Session middleware
  styles/
    app.css               Tailwind source (compiled to public/css/app.css)
public/
  css/app.css             Compiled Tailwind output
  vendor/                 Pinned htmx, SortableJS
  fonts/                  Self-hosted woff2
docs/references/          PRD, transcript, sample SACS PDF, TCC template
data/                     SQLite file (gitignored)
tests/                    Vitest specs — calculations only in V1
```

---

## 4. Locked Calculation Rules

Copied verbatim from PRD §Key Definitions and §User Story 2. These are non-negotiable and originate from Rebecca's explicit statements at 24:28 and 26:15 in the discovery transcript.

- **Excess = Inflow − Outflow**
- **Grand Total = Client 1 Retirement Total + Client 2 Retirement Total + Non-Retirement Total + Trust value**
- **Non-Retirement Total EXCLUDES the trust** (the trust is its own term in the Grand Total).
- **Liabilities are displayed separately and NEVER subtracted from Grand Total.**
- **$1,000 floor** on inflow/outflow accounts is a constant display element, **never editable**.
- **Target = (6 × monthly expenses) + sum of all insurance deductibles**
- **Retirement accounts are owned by exactly one spouse** (never joint).
- **Non-retirement accounts can be joint or individual.**
- **Liabilities default to joint.**

Money is always integer cents. Calculations live in exactly one place: `src/lib/calculations.ts`. Every number on a SACS or TCC report must trace to a function there. No inline math in views or routes. Changing a rule requires updating both the test in `tests/calculations.test.ts` *and* this section.

---

## 5. Design System — "Quiet Wealth"

Editorial-financial. Modern private bank crossed with a high-end editorial product. **Calm, authoritative, warm.** Not generic SaaS blue, not dark-mode developer tool.

**Tokens are defined in two places that must stay in sync:**
- CSS variables: `src/styles/app.css` (`:root` block)
- Tailwind theme: `tailwind.config.ts` (under `theme.extend.colors`/`fontFamily`)

| Token | Value | Purpose |
|---|---|---|
| `--color-bg` | `#FAF8F4` | Surface — warm ivory, not white |
| `--color-bg-raised` | `#FFFFFF` | Cards, dialogs |
| `--color-bg-sunken` | `#F2EFE8` | Inset panels, table headers |
| `--color-ink` | `#0A1F3A` | Primary text — deep navy, not black |
| `--color-ink-muted` | `#4A5568` | Secondary text |
| `--color-ink-soft` | `#8B9099` | Tertiary, captions |
| `--color-accent` | `#B8956A` | Single muted gold, used **sparingly** |
| `--color-accent-soft` | `#E5D9C4` | Accent background |
| `--color-success` | `#2F6B4F` | Confirmations |
| `--color-warning` | `#C68B2E` | Stale-data flags |
| `--color-danger` | `#A33A3A` | Destructive, validation errors |
| `--color-rule` | `#E2DDD3` | Hairlines, borders |

**Type:**

- Display: **Source Serif 4** (variable, weights 400–700). Page titles + section headings + hero numbers. **Use weight 500** — heavier reads as more authoritative and is more legible than a thin display face. Letter-spacing `-0.01em`, line-height 1.1. Italic via the same variable file. Self-hosted as `SourceSerif4-Variable.woff2`.
- Body: **Geist** (variable, weights 400–600). Designed for screens, neutral character. Default weight 400, line-height 1.55. Self-hosted as `Geist-Variable.woff2`.
- Mono: **Geist Mono** (variable, weights 400–500) for keyboard-shortcut hints and any code display. Self-hosted as `GeistMono-Variable.woff2`.
- Numbers: Geist with `font-feature-settings: 'tnum' 1, 'lnum' 1;` (tabular **lining** figures so digits align both horizontally and vertically). Use the `.num` class or `<td class="num">`.
- Labels: Geist 500, uppercase, `letter-spacing: 0.06em` (slightly tighter than the prior 0.08em), size `var(--fs-xs)` = 13px. Use the `.label` class.
- **Italic emphasis** uses Source Serif 4 italic via the global `em, i` rule — sparingly.
- **Never use bold for emphasis.** Cap body weight at 500.

**Type scale (CSS variables — do not inline raw px values when one of these fits):**

| Variable | Size | Use |
|---|---|---|
| `--fs-xs` | 13px | uppercase labels |
| `--fs-sm` | 15px | meta / dates / breadcrumb |
| `--fs-base` | 17px | body (html root) |
| `--fs-md` | 19px | emphasized body |
| `--fs-lg` | 24px | section subheadings |
| `--fs-xl` | 32px | sidebar wordmark |
| `--fs-2xl` | 44px | — |
| `--fs-3xl` | 56px | page headings (Households, client name) |
| `--fs-4xl` | 72px | hero numbers, login wordmark |
| `--fs-5xl` | 96px | dashboard hero |

> **If a future session is tempted to swap these fonts back to Fraunces / General Sans / Inter — do not.** Source Serif 4 + Geist was a deliberate readability decision: the previous Fraunces optical-soft 100 axis was thin and fragile at the smaller sizes (sidebar nav labels, breadcrumb, helper text); General Sans had legibility issues with its `0.08em` label letter-spacing on the smaller fields. The current pairing tested noticeably better in the Cole Household walkthrough. The renderer code in `src/reports/` retains Fraunces / General Sans for SACS / TCC SVGs because Andrew's locked layouts depend on those exact metrics — chrome and renderer typography are intentionally separate territories.

**Motion:**
- Page transitions: `200ms cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind: `duration-page ease-editorial`)
- Hover lifts: `translateY(-1px..-2px)` only — never larger
- htmx swap: 180ms fade via `htmx-settling` class
- No spinners. Buttons in flight = `opacity-70 cursor-wait` (use `aria-busy="true"`).

**Iconography:** One set only. Pick **Lucide** when the first icon is needed. Do not mix sets. No emoji.

**Dashboard Composition** — `/dashboard` follows a three-section layout (deliberately *not* a 4-card metric row, the SaaS default this design rejects):

1. **Hero** (full width, 96 px top padding) — time-aware greeting on a single line ("Good morning, Maryann — *Friday, April 21st.*"), then a 50/50 stat row: primary metric on the left ("QUARTERLY MEETINGS PREPARED · 4 of 6" with a context phrase like *"Two households remain — Cole and Park-Rivera due by May 15."*) and a hand-rolled SVG sparkline panel on the right ("REPORTS GENERATED, LAST 12 MONTHS"), with a *Peak / This month* annotation underneath.
2. **Secondary stats** — a single row of three figures separated by 1 px vertical hairlines: Average Portfolio · Stale Balances · Next Meeting. Each is `--fs-2xl` Source Serif 4 with a one-line italic Geist footnote that links to the relevant client when applicable.
3. **Households grid + Activity ledger** — 60/40 split. Left column is a 2-column card grid (240 px tall, 1 px-ruled, no shadows) with a 7th cell that's a **dashed-rule "+ Add household"** placeholder (intentionally not card-shaped — a quiet outline). Right column is a sticky-header activity ledger with `--fs-base` italic Source Serif 4 descriptions and Geist meta.

**Sparkline** is a hand-rolled inline SVG (`src/views/components/sparkline.tsx`) — never a chart library. ~30 lines compute the d-attribute from a small array; peaks are detected as local maxima, the final point always renders larger as the "current" dot, x-axis labels render every other bucket. Background is `--color-bg-sunken`, line is `--color-ink` 1.5 px, peak dots are `--color-accent`. **Do not animate the sparkline drawing on load** — it's a static visualization, not a hero animation.

**Stagger reveal** — page-load animation, one-shot, CSS-only with a `prefers-reduced-motion: reduce` guard:

| Section | Delay |
|---|---|
| Greeting | 0 ms |
| Hero stat row | 120 ms |
| Secondary stats | 240 ms |
| Card grid | 320 ms + 60 ms × index, max 8 staggers, then snap |
| Activity ledger | 480 ms |

All transitions: 600 ms `cubic-bezier(0.16, 1, 0.3, 1)` (the smooth easing curve, not linear).

**The dashboard chrome is the only territory these tokens describe.** The SACS/TCC report renderings keep Andrew's existing palette (green Inflow / red Outflow / light-blue Private Reserve / navy bubbles) — see Section 6.

---

## 6. Pixel Fidelity Rule

Reports must match Andrew's existing layouts:
- **SACS** — `docs/references/SACS-Example.pdf` is the pixel reference.
- **TCC** — `docs/references/TCC-template.docx` and `docs/references/TCC-reference.png` are the pixel references.

Andrew designed these layouts and is happy with them. **Do not redesign.** A light visual polish is welcome (Maryann at 52:42), but structure does not change:
- SACS: green Inflow → red Outflow with "$X/mo Automated transfer on the 20th" arrow → light-blue Private Reserve. Page 2: Private Reserve, Schwab brokerage, Target.
- TCC: Client 1 / Client 2 retirement bubbles top, non-retirement bubbles bottom, Family Trust circle center, Liabilities box separate, Grand Total banner top-center.

Variable account counts (1–6 per section) must not reflow the layout. Use SVG with fixed anchor points, or HTML/CSS grid with deterministic slot positions — **not** a WYSIWYG template engine. The "* Indicates we do not have up to date information" footnote renders only when at least one balance is stale.

The Quiet Wealth tokens (Section 5) are **forbidden inside report renderings**. The two territories never mix.

---

## 7. htmx Conventions

- htmx is loaded once from `/vendor/htmx.min.js` in `views/layouts/shell.tsx`. Never CDN.
- **Server returns HTML fragments** to htmx routes — never JSON.
- Use `hx-target` to address an id-prefixed element (`#client-list`, `#report-preview`, `#balance-row-{id}`).
- Default `hx-swap="innerHTML"`. Use `outerHTML` only when replacing the addressed element itself; document the choice inline.
- Fragment handlers live in `src/routes/partials/` and return JSX fragments (no `<Shell>` wrapper).
- Loading state: rely on the `htmx-settling` / `htmx-swapping` opacity transition defined in `app.css`. No spinners.
- Validation errors come back as the same fragment with error markup inline. Don't redirect.

---

## 8. Hono Conventions

Three folders, three concerns:

| Folder | Returns | Wraps in `<Shell>`? |
|---|---|---|
| `routes/pages/` | Full page JSX | **Yes** |
| `routes/partials/` | JSX fragment | No |
| `routes/api/` | JSON | No |

- One Hono sub-app per top-level resource (`clientsApp`, `reportsApp`, …) mounted in `src/app.ts`.
- Validate request bodies with Zod at the route boundary. Pass typed objects inward.
- Keep handlers thin — push logic into `lib/` or `reports/`. Routes orchestrate; they don't compute.
- Use `hono/logger` middleware in dev only. Production logging is structured JSON to stdout.
- All static assets served via `@hono/node-server/serve-static` from `./public`. No symlinks.

---

## 9. Drizzle Conventions

- **All tables in `src/db/schema.ts`.** No per-feature schema files.
- Primary keys: `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())`.
- Timestamps: `integer({ mode: 'timestamp' })` — created/updated columns on every table.
- **Money: integer cents only.** Never `real`, never floats. The Drizzle column type is `integer` and the variable name ends in `_cents`.
- Foreign keys: declare with `references(() => parent.id, { onDelete: 'cascade' })` where deletion cascades make sense (e.g., a client's accounts).
- Migrations are committed under `src/db/migrations/`. Never edit a generated migration file — generate a new one.
- Drizzle client is a singleton in `src/db/client.ts`. Routes import the singleton; they don't open new connections.

---

## 10. Testing

V1 unit tests cover **`src/lib/calculations.ts` only.** Reports, routes, and views are validated by visual diff against the references in `docs/references/` during the prototype walkthrough — automated browser testing is parked for V2.

- Framework: Vitest. Run with `pnpm test`.
- One spec file per pure-function module. Spec lives next to the convention test pattern: `tests/<module>.test.ts`.
- Every locked rule in Section 4 must have at least one test pinning the exact behavior — and a comment in the test referencing the transcript timestamp it traces to.
- Never mock the calculations to make a route test pass. If you need calculations in a route test, run them.

---

## 11. Canva Integration Notes

Canva Connect API integration (Phase 11 rewrite — Phase 8's was broken in two ways: missing PKCE and using `/v1/imports`).

**OAuth flow — PKCE is required.** Canva's Connect API rejects authorization-code exchanges without `code_verifier`. Implementation in `src/lib/canva.ts`:

- `generateCodeVerifier()` produces 32 bytes of random base64url
- `deriveCodeChallenge(verifier)` SHA-256 hashes and base64url-encodes
- `getAuthorizeUrl(state, challenge)` → `…/api/oauth/authorize?…&code_challenge=…&code_challenge_method=S256`
- `exchangeCode(code, verifier)` POSTs `application/x-www-form-urlencoded` body with `code_verifier` and uses HTTP Basic auth (`client_id:client_secret` base64) on the `Authorization` header — Canva accepts `client_secret_basic` or `client_secret_post`; we send Basic.
- The `verifier` is stored in an httpOnly `canva_oauth_verifier` cookie alongside the existing state cookie; both clear after callback.

**Endpoints (do not confuse — they live on different hosts):**

| Purpose | URL |
|---|---|
| Authorize | `https://www.canva.com/api/oauth/authorize` |
| Token | `https://api.canva.com/rest/v1/oauth/token` |
| API base | `https://api.canva.com/rest/v1` |

**Required scopes:** `asset:read asset:write design:content:read design:content:write design:meta:read` (space-separated). Phase 8 was missing `asset:read` and `design:content:read` — add new ones here in `SCOPES` if a future endpoint demands more.

**Export flow uses asset-upload + design-create, NOT `/v1/imports`.** `/v1/imports` is gated to certain Canva tiers and 400s for arbitrary PDF on Free/Pro plans. The reliable path on Pro is:

1. `POST /v1/asset-uploads` — multipart form with the PDF as `file`, plus an `Asset-Upload-Metadata` request **header** (not form field) carrying `{"name_base64": "<base64-encoded filename>"}`. Returns `{ job: { id, status, asset? } }`.
2. Poll `GET /v1/asset-uploads/{job_id}` every 1.5s, max 30s ceiling. Status transitions `in_progress → success` (with `asset.id`) or `failed`.
3. `POST /v1/designs` (JSON) with `{ design_type: { type: 'preset', name: 'doc' }, asset_id, title }`. Returns `{ design: { id, urls: { edit_url, view_url } } }`.

PDF assets render as image-pages in Canva — the user can annotate on top but cannot edit the underlying content. This is acceptable per PRD §User Story 4 (Maryann's "last-minute touch-up" use case); template-fill-on-PDF requires Enterprise.

**Token refresh.** `getValidAccessToken(userId)` checks `expiresAt - 60s < now` and pre-emptively refreshes via `grant_type=refresh_token` on the same token endpoint. If refresh returns 4xx (revoked or expired refresh_token), the credential row is deleted and a `CanvaConnectionError` is thrown — the route returns 401 with copy that prompts re-connect at `/settings`.

**Diagnostic logging** lives in `canvaRequest()` (the wrapper used by every Canva HTTP call). Each request gets a short `requestId`; both directions log to console with the bearer scrubbed:

```
[canva:1a2b3c4d] → POST https://api.canva.com/rest/v1/asset-uploads
                   { headers: { Authorization: 'Bearer ***', ... }, bodyKind: 'multipart' }
[canva:1a2b3c4d] ← 200 { contentType: 'application/json; charset=utf-8', body: '{"job":{...}}' }
```

Non-2xx throws `CanvaApiError(status, bodyText, url, method)`. The export route catches it and returns the actual Canva message in the response body (truncated to 240 chars) so the frontend's fallback handler can surface a real diagnostic instead of a generic "400".

**Frontend fallback (graceful failure).** When `/export/canva` returns non-2xx, `public/js/canva-fallback.js` listens for `htmx:responseError`, displays the actual error text inline near the button, auto-submits the PDF download form, and opens `https://www.canva.com/design/?create_canvas` in a new tab. The user always gets the report into Canva; in the worst case it's a one-extra-step manual import. This honors PRD §User Story 4: "If Canva API feasibility is soft, the engineer can ship the PDF path first and wire Canva export as a follow-up without blocking V1."

**Dev token-status route.** `GET /dev/canva-token-status` (404 in production) returns the logged-in user's Canva token state as JSON: `obtainedAt`, `expiresAt`, `ageSeconds`, `expiresInSeconds`, `isExpired`, `shouldRefreshSoon`, `scope`, plus the encrypted-token *lengths* (never plaintext). Used to verify refresh logic by manually setting `expires_at` to a past date in the DB and re-running an export.

**Tokens at rest:** AES-GCM encrypted with a key derived from `BETTER_AUTH_SECRET` (see `src/lib/encryption.ts`). Never log the plaintext token; `scrubHeaders` in `canvaRequest` redacts both `Bearer …` and `Basic …` to `***` before printing.

---

## Canva Developer Portal Setup

The portal's "Connect Canva" feature requires a Canva integration registered in the Canva Developer Portal. This is a one-time manual setup per environment (dev / staging / prod). Code-side validation in `src/server.ts` logs the active `CANVA_REDIRECT_URI` at startup with a `✓` if it passes validation, or an error if `localhost` was used.

### Prerequisites

- The Canva account being used must have **Multi-factor Authentication (MFA)** enabled. Without MFA, Canva blocks integration creation.
- Use the **Andrew@Windbrook** Canva account, not a personal Canva account.

### Steps

1. Log in to <https://www.canva.com/developers/integrations>. The legacy `/developers/apps` URL no longer exists — the correct path is `/integrations`.

2. **Create a new integration** (or click into the existing `educated_freedom` integration to edit it):
   - Click **Create an integration**
   - Choose **Private** if your team is on Canva Enterprise; otherwise **Public**
   - Agree to the Canva Developer Terms
   - Click **Create integration**

3. Set a clear name: `Windbrook Portal — Dev` for local, `Windbrook Portal — Production` for prod.

4. Under **Credentials**:
   - Copy the **Client ID** into your `.env` as `CANVA_CLIENT_ID`
   - Click **Generate secret** and copy the secret into `.env` as `CANVA_CLIENT_SECRET`. Canva shows the secret only once — save it before navigating away.

5. Left menu → **Scopes** → enable:
   - `asset:read`
   - `asset:write`
   - `design:content:read`
   - `design:content:write`
   - `design:meta:read`
   - `profile:read`

6. Left menu → **Authentication** → **Authorized redirects** → add the redirect URL:
   - **Local development**: `http://127.0.0.1:3000/api/canva/callback`
   - **Production**: `https://portal.windbrook.app/api/canva/callback`
   - **Critical**: Canva does **NOT** accept `localhost` as a registered redirect URL — only `127.0.0.1` is allowed for local development. This is the cause of every "has not configured its redirect URI" error in earlier phases. Source: <https://www.canva.dev/docs/connect/creating-integrations/>.
   - Save the page.

7. Update your local `.env`:

   ```
   CANVA_CLIENT_ID=<from step 4>
   CANVA_CLIENT_SECRET=<from step 4>
   CANVA_REDIRECT_URI=http://127.0.0.1:3000/api/canva/callback
   ```

8. Restart the portal: `pnpm dev`. The startup log will print:

   ```
   [canva] ✓ OAuth redirect URI: http://127.0.0.1:3000/api/canva/callback
   [canva] This exact URI must be registered in your Canva developer integration …
   Windbrook portal listening on http://127.0.0.1:3000
   ```

   Open **http://127.0.0.1:3000** in your browser (NOT `http://localhost:3000`) and log in. The Connect Canva flow will now match the registered redirect URI exactly.

### Common errors

- **"educated_freedom has not configured its redirect URI"** — the URI sent in the authorize request does not match any URI registered on the **Authentication** page. Check for trailing slash, port mismatch, protocol mismatch (`http` vs `https`), or — most often — `localhost` vs `127.0.0.1`. The startup log prints the exact URI being sent; copy that into the Canva portal verbatim.

- **"insufficient_scope"** — a scope is missing in the integration. Re-check step 5. New scopes added here in the future must be appended to `SCOPES` in `src/lib/canva.ts`.

- **"invalid_client"** — wrong client_id or client_secret. Re-copy from step 4 (the secret is only shown once at generation time, so generate a fresh one if the original wasn't saved).

If the env vars are missing entirely, the report-detail page replaces the **Connect Canva** action with a soft-ink note `Canva export disabled — see CLAUDE.md.` so users don't click into a broken OAuth flow.

---

## 12. Layout Edit Mode UX (Phase 16 rewrite — SVG-native pointer events)

The TCC layout editor was originally an HTML overlay driven by SortableJS. Phase 16 replaced it with native pointer-event drag directly on SVG `<g class="bubble">` elements. SortableJS is no longer in the project. The implementation lives entirely in `public/js/layout-editor.js` (no library) plus the slot indicators emitted by `src/reports/tcc/render.ts` → `slotIndicators()`.

### Why native pointer events

SortableJS is designed for HTML list reordering. Wrestling it onto an SVG via a transform-scaled HTML overlay was fragile (the original "bubbles do not respond to drag" report). Native `pointerdown`/`pointermove`/`pointerup` on `<g>` elements gives us:

- 1:1 coordinate fidelity — `getScreenCTM().inverse()` maps pointer screen-space to SVG userspace exactly, no scale-divisor math.
- Same drag flow on mouse + touch + pen — pointer events unify them.
- Zero JS dependencies — the file is ~250 lines, zero external code.

### State machine

Driven by class + dataset toggles. The same class is added to both the `<svg>` (for slot CSS) and the `.report-canvas` (for hint + popover CSS).

| State | Selectors | Slots visible? |
|---|---|---|
| View mode | `data-edit-mode='off'` | none |
| Edit mode, idle | `[data-edit-mode='on']` (no `.drag-active`) | none — bubbles get `cursor: grab`, hint shows top-right |
| Drag active | `[data-edit-mode='on'].drag-active[data-drag-side]` + `svg.edit-mode.drag-active[data-drag-side]` | same-section slots fade in over 150 ms |
| Near a slot | `.slot.near` | nearest same-section slot within 80 px gets opacity 1 + stroke 2 + 12 px gold ambient `drop-shadow` |

Fade-in 150 ms, fade-out 200 ms. CSS owns the transitions; JS only flips classes.

### Section integrity (the four data-section values)

Each slot + bubble carries `data-section` ∈ `{retirement-left, retirement-right, nonret-left, nonret-right}`:

- `p1-*` slots → `retirement-left` (Client 1's qualified accounts)
- `p2-*` slots → `retirement-right` (Client 2's qualified accounts)
- `nr-l-*` slots → `nonret-left`
- `nr-r-*` slots → `nonret-right`

The drag's `findNearestSlot()` filters by `[data-section="${origin}"]`, so a bubble can only land on slots in its own section. This both preserves CLAUDE.md §4's "retirement accounts owned by exactly one spouse" rule (a Roth IRA can never visually migrate from p1 to p2) and keeps the visual non-retirement left/right balance fixed. The server-side POST (`POST /clients/:id/reports/:rid/layout`) re-checks `sectionOf(slotId)` and refuses cross-section drops with 400 — the safety net for any client-side bypass.

### Persistence flow

1. Drop on a same-section slot → `fetch('POST /clients/:cid/reports/:rid/layout', { accountId, slotId })`
2. Server merges the single-bubble change into existing `bubble_layouts` row (preserves every other bubble's position; swaps if another account already occupied the destination)
3. Server returns 204
4. Client `window.location.reload()` redraws the SVG with the new arrangement

The reload is intentionally simple — server-rendered SVG always wins, no client-side optimistic update to keep in sync. The user sees a ~200 ms flicker that's well within the editorial pacing of the page.

**No save button, no toast.** Every drop persists silently. "Done editing" exits edit mode; "Reset to default layout" (only visible while editing) hits the existing `DELETE /clients/:id/layouts/:reportType` endpoint and returns the canvas fragment via htmx.

### Escape cancels

Document-level `keydown` capture: `Esc` immediately calls `cleanupDrag()`, clears the bubble's `transform`, and skips the network call. `pointercancel` (e.g. fingerprint-tap, system gesture) does the same.

### Slot positions (Phase 18)

Phase 18 reverted Phase 17's circle bubbles. Account bubbles are **ELLIPSES** (rx=70, ry=55 → 140×110 px) matching `docs/references/TCC-template.docx`. The Phase 17 r=90 circles were wrong on both shape and size. The slot grid is back to **24 slots** (2 cols × 3 rows × 2 sides × 2 sections, schema `p1/p2/nr-l/nr-r × 1..6`) — the original Phase 13 schema, so saved layouts from before Phase 17 work without changes.

Slot ID layout per side:
- index 1 = TOP_OUTER, index 2 = TOP_INNER (or for `p2`/`nr-r`: 1=TOP_INNER, 2=TOP_OUTER)
- index 3 = MID_OUTER, index 4 = MID_INNER (or 3=MID_INNER, 4=MID_OUTER)
- index 5 = BOT_OUTER, index 6 = BOT_INNER (or 5=BOT_INNER, 6=BOT_OUTER)

So `p1-4` = MID_INNER for Client 1 (cx=250, cy=290), `p2-3` = MID_INNER for Client 2 (cx=542, cy=290) — they sit symmetrically beside the central client oval.

Lateral cols: cx=110 (outer-left), 250 (inner-left), 542 (inner-right), 682 (outer-right). Retirement rows cy=170/290/410. Non-retirement rows cy=540/620/700 (NR_TCY=620 ± 80). Client oval cx=396/cy=290/rx=110/ry=60 (220×120). Trust circle cx=396/cy=620/r=70 (140 px diameter — reduced from brief's 220 px because at r=110 the trust would overlap the inner-col bubbles by 34 px).

**Canvas:** 792×800 (Phase 17 was 1520, Phase 18 brief said 612 — the brief's stated 612 is mathematically incompatible with its own slot positions because 3 NR rows at tcy ± 80 with ry=55 need ≥270 px of NR band, available on 612 is ~115 px). 800 fits cleanly with 80 px of margin below the NR banner.

**Capacity:** 6 retirement accounts per spouse, 6 non-retirement per side = 12 retirement + 12 non-retirement total. Park-Rivera Daniel's 4 retirement now fits cleanly. The 4th account placement (cx=110/cy=290 = MID_OUTER) sits to the far left, mirroring the Ana side.

### Hard-coded text values (do NOT tune)

```ts
BUBBLE_RX = 70; BUBBLE_RY = 55   // 140 × 110 px ellipse
Y_ACCT_NUM = -32; Y_ACCT_TYPE = -10; Y_BALANCE = +12; Y_DATE = +34
FONT_ACCT = 9; FONT_TYPE = 12; FONT_BALANCE = 15; FONT_DATE = 9
TRUST_RADIUS = 70                // 140 px diameter (compromise from brief's 110)
CLIENT_OVAL_RX = 110; CLIENT_OVAL_RY = 60   // 220 × 120
```

When the account type wraps to two lines (e.g. "Cash Management"), `Y_BALANCE` and `Y_DATE` shift down by 12 px each so the balance and a/o date don't collide with the wrapped second line.

### Debug overlay

Append `?debug=1` to any TCC report URL to render visual guides:
- Pink fill at 5 % opacity over each bubble
- 0.6 px dashed red **safe-zone** ELLIPSE at (rx=58, ry=43) inside each bubble (rx-12, ry-12)
- Yellow horizontal underlines at every text baseline
- Dimension label `140×110 / safe 116×86` above each bubble

The verification gate: every glyph of every text line must fall inside the red dashed ellipse. If any does not, the hard-coded values are wrong.

### Phase 22 — Layout consistency + Canva 403 diagnosis

**Self-healing slot remap.** When a `bubble_layouts` row pins a bubble to a slot ID that no longer exists (e.g. `nr-l-5` from before Phase 21's slot reduction) — or when a future schema change leaves stale IDs in the DB — the renderer now silently routes the bubble to the next free default slot instead of dropping it. Per-spouse for retirement (`p1-1..6` / `p2-1..6` priority lists), row-major outer-mirror-first for NR. The fallback fill order in `render.ts` mirrors `lib/layouts.ts` `NR_FILL_ORDER` exactly so primary and fallback land at the same positions.

**Default fill order rewritten.** Phase 21's inner-mirror-first NR_FILL_ORDER produced diagonal layouts (1+1+1 across rows). Phase 22 uses **row-major outer-mirror first**:

```ts
const NR_FILL_ORDER = [
  'nr-l-1', // row 1 outer-L
  'nr-r-2', // row 1 outer-R
  'nr-l-2', // row 1 inner-L
  'nr-r-1', // row 1 inner-R
  'nr-l-3', // row 2 outer-L
  'nr-r-4', // row 2 outer-R
  'nr-l-4', // row 2 inner-L
  'nr-r-3', // row 2 inner-R
];
```

Verified: Cole (2 NR) → row 1 corners. Lipski (3 NR) → row 1 outer-L + outer-R + inner-L, row 2 empty. Park-Rivera (5 NR) → row 1 fully populated + row 2 outer-L. Screenshots in `docs/phase22-{cole,lipski,park}-tcc.png`.

**One-shot migration.** `src/db/migrations/phase22-clear-tcc-layouts.ts`, run via `pnpm db:migrate:phase22`. Deletes every `bubble_layouts` row where `reportType='TCC'` so previously-saved layouts (any pinning to deprecated `nr-{l,r}-{5,6}` IDs or to the Phase 21 inner-first geometry) get reset to the new default. Idempotent; safe to re-run. The synthetic seed data has no manually-saved layouts, so the first run cleared 0 rows — but the migration is in place for any production database that has accumulated saved positions.

**Canva 403 — integration in Draft.** Phase 19 fixed the OAuth round-trip (`s256` lowercase). The new failure happens at API-call time, not auth time, with a Canva trace ID and a generic 403 page. The most likely cause is the `educated_freedom` integration sitting in **Draft** status: Draft integrations can only authorize against the Canva account that registered them, and other accounts trying to call API endpoints get a 403. Resolution paths:

- **Submit for review** (Canva developer portal → integration → Submit for review). Becomes Public after 5–10 business-day review. Required for production multi-advisor use.
- **Convert to Private** (requires Canva Enterprise plan). Skips review, immediate access for Enterprise team accounts only.
- **Use as-is from the registering Canva account only.** Other team members hit the 403 — this is the "demo / single-operator" path.

To narrow down the exact restriction, look at the next 403 response in the server log. The Phase 11 `[canva:NN]` diagnostic block prints the response body. The `error` field tells us:

| Canva error | Meaning |
|---|---|
| `permission_denied` | Integration draft, account can't use this endpoint — submit for review |
| `insufficient_scope` | A required scope was not granted at OAuth time — add to `SCOPES` in `src/lib/canva.ts` |
| `quota_exceeded` | Free-tier rate limit |
| `feature_not_enabled` | API feature not available on this account type |

This is the diagnose-first path. Don't guess at fixes before the server log shows the exact error code.

---

### Phase 21 — TCC spacing rebuild

The Phase 20 patch fixed bubble-vs-oval overlap, but two issues remained: adjacent bubbles in the same row touched (cx=100 + cx=240, with rx=70, gives a 0 px gap), and NR row 1 bubbles crashed into the divider line. Phase 21 recomputes the entire spacing with verified math — every gap is now ≥ 10 px.

| Property | Phase 20 | Phase 21 |
|---|---|---|
| Inner column | cx=240 | cx=270 (30 px gap from outer-col bubble) |
| Client oval | rx=80, ry=55 | rx=ry=50 (circular — visually balances trust) |
| Trust radius | r=70 | r=50 |
| Retirement rows | 150/290/430 | 125/270/415 |
| Retirement banner | y=495 | y=480 (10 px gap below row 3 at cy=415+ry=55=470) |
| NR rows | 530/620/710 (3 rows) | 595/875 (2 rows, trust between) |
| NR trust cy | 620 | 720 |
| Liabilities box | content-sized at trust+16 | fixed 320×40, centered, y=775 |
| NR banner | y=780 | y=945 |
| Footnote | y=808 | y=975 |
| Canvas H | 820 | 1000 |

**Slot count reduction.** NR section dropped 4 slots (`nr-l-5`, `nr-l-6`, `nr-r-5`, `nr-r-6`). Total slots: 24 → 20 (12 retirement + 8 NR). Saved layouts referencing the deprecated IDs silently skip in the renderer (the `if (!a) return ''` guard in the bubble map). The seeded synthetic households (Cole / Lipski / Park-Rivera) hit `defaultTccAssignments` so they automatically use the new layout.

`src/lib/layouts.ts` `NR_FILL_ORDER` was rewritten to use only the 8 valid slots — the previous 12-entry order included the deprecated 5/6 IDs and would silently drop accounts (Park-Rivera's 5th NR was vanishing as a result). New order:

```ts
'nr-l-2',  // inner-L top
'nr-r-1',  // inner-R top  (mirror across the trust)
'nr-l-4',  // inner-L bot
'nr-r-3',  // inner-R bot
'nr-l-1',  // outer-L top
'nr-r-2',  // outer-R top
'nr-l-3',  // outer-L bot
'nr-r-4',  // outer-R bot
```

A single NR account lands at `nr-l-2` (above the trust, left side). Two flank the trust (left + right). Three add a row-2 bubble. Four fill the inner ring across both rows. Five+ spill into the outer ring.

**Verified screenshots in `docs/`:**
- `phase21-cole-tcc.png` — 3 retirement bubbles + 2 NR + small client oval + trust + liability box
- `phase21-lipski-tcc.png` — 2+2 retirement around joint oval, 3 NR
- `phase21-park-tcc.png` — 7 retirement + 5 NR + 3 liability rows. **All 5 NR bubbles now render** — under the old fill order the 5th hit `nr-r-5` and dropped silently.

The Phase 17/18 hard-coded internal-text values (`Y_ACCT_NUM = -32`, `Y_ACCT_TYPE = -10`, `Y_BALANCE = +12`, `Y_DATE = +34`, fonts 9/12/15/9) are preserved — text positioning math is unchanged.

---

### Phase 20 — spacing + drag fixes

**Two real bugs surfaced in the Phase 19 hand-off, both fixed in surgical patches that preserve every existing export and signature.**

**Spacing — bubbles overlapping the central client oval.** Phase 18 had inner-column bubbles at cx=250 (right edge x=320) and the client oval at cx=396 rx=110 (left edge x=286). When the bubble's y-coord aligned with the oval's (mid row at cy=290 = oval cy), the bubble drew on top of the oval. That was the "merging" Andrew flagged. Patches in `src/reports/tcc/render.ts`:

| Constant | Phase 18 | Phase 20 | Why |
|---|---|---|---|
| `CLIENT_OVAL_RX` | 110 | 80 | Oval now extends x=316–476; inner bubble right edge x=310, gap 6 px |
| `RET_ROW_CY` | [170,290,410] | [150,290,430] | More vertical breathing room above row 1 and below row 3 |
| `COL_LEFT_OUTER` | 110 | 100 | Symmetric ±10 push outward |
| `COL_LEFT_INNER` | 250 | 240 | Adds 10 px lateral cushion |
| `COL_RIGHT_INNER` | 542 | 552 | Symmetric mirror |
| `COL_RIGHT_OUTER` | 682 | 692 | Symmetric mirror |
| `RET_BANNER_Y` | 475 | 495 | Row 3 ends at cy=485; banner now 10 px below |
| `NR_ROW_CY` | [540,620,700] | [530,620,710] | Matching ±90 rhythm vs ±80 |
| `CANVAS_H` | 800 | 820 | Absorbs the slight bottom growth + footnote at y=808 |

Slot ID schema unchanged (`p1-1..6`, `p2-1..6`, `nr-l-1..6`, `nr-r-1..6`) so existing rows in `bubble_layouts` keep working. Verified via `scripts/rasterize-tcc.mts` — Cole/Lipski/Park-Rivera screenshots committed to `docs/phase20-{cole,lipski,park}-tcc.png`. All three render with no overlap on either section.

**Drag — silent snap-back.** Two compounding bugs in `public/js/layout-editor.js`:

1. The diagnostic dump path used `svg.querySelectorAll('circle.slot')` to list all slots when section-matching failed. Phase 18 changed slot indicators from `<circle>` to `<ellipse>`, so the diagnostic was reporting **0 slots even when 24 existed** — every "slots missing" warning was a false positive. Fixed: `'ellipse.slot, circle.slot'`.
2. `findNearestSlot` always returns the closest same-section slot regardless of distance (Phase 18 design). Combined with the `newSlotId === originSlotId` early-return, dragging a bubble even slightly snapped it back **without any visible feedback**.

The fix introduces a `MIN_MOVE_PX = 50` threshold:
- Below threshold → treat as click, snap back silently (correct).
- Above threshold AND nearest slot is origin → log "nearest slot is origin", snap back.
- Above threshold AND nearest slot differs → POST `/clients/:cid/reports/:rid/layout` with `{ accountId, slotId }`. On 4xx/5xx, surface an `alert()` with the response body (no more silent failures). On network error, alert "Network error saving layout."

The end-to-end happy-path log block during a successful drag:

```
[layout-editor] pointer up. Total move: 184px (threshold 50px)
[layout-editor] findNearestSlot: section="retirement-left", found 6 slots
[layout-editor]   → nearest slot: data-slot-id="p1-4" at distance 23px
[layout-editor] POST /clients/.../reports/.../layout
[layout-editor] POST response status: 204
[layout-editor] persist OK, reloading
```

The "found 6 slots" line is the proof both bugs are gone — under the old buggy selector it printed "0 slots".

**Canva — port mismatch (config, not code).** Phase 19's `s256` lowercase fix landed correctly. The remaining failure was a portal-side mismatch: server runs on `127.0.0.1:3030`, `.env` `CANVA_REDIRECT_URI` is `http://127.0.0.1:3030/api/canva/callback`, but the Canva developer-portal "URL 1" was registered as `http://127.0.0.1:3000/api/canva/callback`. Resolution is operator-side: open the integration's Authentication page and edit URL 1 to match the server's port. Either change Canva to `:3030` or switch the server's port to 3000 (`.env` PORT=3000). With ports aligned and `code_challenge_method=s256`, OAuth completes.

The startup banner and `[canva:authorize]` block continue to print the byte-for-byte URI being sent so the operator can paste-compare against the registered URL.

---

### Phase 19 root-cause fix — `code_challenge_method` is lowercase

**This is the bug we kept misdiagnosing.** Phase 8 / 12 / 15 / 17 / 18 all sent `code_challenge_method=S256` (uppercase, the RFC 7636 spec form). Canva's docs and the example URL their portal generates use lowercase `s256`. Uppercase is silently rejected — the `redirect_uri mismatch` and `invalid_request` errors we saw on the callback weren't actually about the redirect URI; they were Canva refusing the PKCE method. Five rounds of redirect-URI lockdown didn't fix it because the registered URI was always correct. `src/lib/canva.ts` `getAuthorizeUrl` now sends `code_challenge_method: 's256'`. The startup diagnostic prints the value so we never regress this again.

**Recommended scopes** (a Phase 19 drop-in suggestion, not yet wired into the SCOPES const): `profile:read asset:read asset:write design:meta:read design:content:read design:content:write brandtemplate:meta:read brandtemplate:content:read`. Adding `profile:read` and the `brandtemplate:*` pair to the existing 5-scope list opens future Canva-portal features without re-prompting the user. Update `SCOPES` in `src/lib/canva.ts` if the next phase needs them.

### Canva redirect URI lockdown (Phase 18)

`src/lib/canva.ts` exports `getCanvaRedirectUri()` as the **single source of truth** for the Canva redirect URI. It throws if `CANVA_REDIRECT_URI` is unset, validates the hostname (must be `127.0.0.1` for local or a real domain — `localhost` is rejected), and strips any trailing slash. Every authorize-URL build, token exchange, and refresh routes through this helper — `process.env.CANVA_REDIRECT_URI` is no longer read directly.

The startup banner and the `/api/canva/connect` log both print a byte-for-byte block (length, hostname, port, path, trailing-slash) of the URI being sent. When OAuth fails, the `/api/canva/callback` page renders an HTML diagnostic with the registered URI we expect (computed from the same helper) so the operator can paste-compare against the Canva developer portal.

---

## 13. Report Detail Page (Phase 14)

`/clients/:id/reports/:reportId` is the highest-traffic page in the app — every generation lands here, every export starts here. The Phase 14 polish raised the bar without becoming SaaS-y.

**Heading hierarchy** — three-line stacked block:

1. **Eyebrow** — `TCC · FINAL · GENERATED 2 HOURS AGO BY MARYANN`. Geist 12 px / 500 / 0.08em / uppercase / `--color-ink-soft`. Three segments separated by middots; the third is computed at request time via `formatDistanceToNow(report.generatedAt)` plus the user's first name.
2. **Household name** — Source Serif 4, `--fs-3xl` (56 px), weight 500, line-height 1.05, `--color-ink`.
3. **Meeting date** — Source Serif 4 italic, weight 400, `--fs-xl` (32 px), `--color-ink-muted`. Indented 0 px so it sits flush under the household name.

The action cluster sits to the right of the title block (or wraps below at `<1024 px`).

**Atmospheric document frame** — the report sits inside a `.report-doc-frame`:
- White (`#FFFFFF`) on the ivory page background
- 1 px `--color-rule` border, no rounded corners (print-document feel)
- 2-stop drop shadow: `0 1px 0 rgba(10,31,58,.04), 0 8px 32px -8px rgba(10,31,58,.08)`
- 80 px breathing room above and below the document

**Bubble hover popover** (view mode only — fully suppressed when `data-edit-mode='on'`):
- Triggered by `mouseover` on any `g.bubble`, with a 400 ms delay
- Anchored above the bubble's screen-space center via `position: fixed`, `transform: translate(-50%, -100%)`
- Background `--color-ink`, white text, 12 px padding, 4 px radius
- Three lines: account type (Geist 13 / 500), institution + last-four (Geist 12 / 70 % opacity), as-of date (Geist italic 11 / 60 % opacity)
- Fades in over 150 ms, hides on mouseout
- The bubble's `.bubble-ring` `<circle>` also widens its stroke from 1.2 to 2.7 on hover (200 ms transition) for tactile feedback

**Primary action distinction** — exactly one action in the cluster gets the bordered treatment:
- Class `.action-link-primary` — 1 px `--color-ink` border, 8 px / 4 px padding, hover fills with ink and inverts text to bg-raised
- The chosen action is **Canva** when the user has a connected Canva token; otherwise **Download PDF**
- All other actions remain `.text-link-accent` / `.text-link-muted` plain text links

**Edit-mode banner** — a thin horizontal strip with `--color-accent` 8% tint background, 16 px padding, italic Source Serif 4 copy "Editing layout — drop bubbles into any slot. Click 'Done editing' when finished." Hairline rule below. Only visible when `.report-detail-page[data-edit-mode='on']`.

**Print stylesheet** — `@media print` hides chrome (sidebar, top bar, breadcrumb, action cluster, heading block, edit banner, hint, popover, layout editor) and unwraps the document frame (no border, no shadow). The SVG sizes to `11in × 8.5in`. Cmd+P produces a clean printable artifact when Canva is unavailable.

**Skeleton loading** — `body.htmx-request .report-doc-frame::after` paints a 1.5 s gradient sweep (`--color-bg-sunken → --color-bg-raised → --color-bg-sunken`) at 60 % opacity over the frame. CSS-only, respects `prefers-reduced-motion`. No spinner, no "Loading…" text.

---

## 14. Local Development

The dev server **must bind to 0.0.0.0** (Phase 16 fix), not the Node default. On some Node versions the default is IPv6-only (`::`) and IPv4 traffic to 127.0.0.1 returns ECONNREFUSED — exactly what Canva sends mid-OAuth. `src/server.ts` passes `hostname: '0.0.0.0'` explicitly.

A self-check 1 second after boot fetches `/healthz` against 127.0.0.1 and prints `[server] ✓ 127.0.0.1:${port} is reachable` (or an `✗` error) so the operator gets immediate confirmation before opening the browser. `/healthz` itself is a public route (allowlisted in `src/middleware/auth.ts` `PUBLIC_PREFIXES`) returning the literal `ok`.

**Always access the portal at `http://127.0.0.1:3000`** during development. Bookmark this URL. Avoid `http://localhost:3000` — it works for the portal itself but breaks Canva OAuth callbacks because the registered redirect URI uses 127.0.0.1 (Canva does not accept the `localhost` host — see §11 / Canva Developer Portal Setup).

The startup log spells this out:

```
[canva] ✓ OAuth redirect URI: http://127.0.0.1:3000/api/canva/callback
[canva] This exact URI must be registered in your Canva developer integration …
[server] Listening on:
  http://127.0.0.1:3000   ← USE THIS for Canva OAuth
  http://localhost:3000   ← convenience, do NOT use for Canva
[server] ✓ 127.0.0.1:3000 is reachable
```

If the self-check prints `✗ unreachable`, another process is on the port or the OS firewall is blocking it. Diagnose before opening Canva.

---

## 15. Deployment (Railway)

The portal ships as a single Docker image. Railway picks up `Dockerfile`
(declared in `railway.json`), builds, and runs `pnpm start`.

### Persistent storage

SQLite + generated PDFs live under `/app/data` inside the container.
Railway must attach a **Volume** to the service with mount path **`/app/data`**.
Without this, every redeploy resets the database and previous reports are
lost. Railway → service → Settings → Volumes → confirm Mount Path is
`/app/data`.

### Required env vars

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `file:/app/data/portal.db` | Absolute path inside the volume mount. Default `file:./data/portal.db` resolves to `/app/data/portal.db` because `WORKDIR /app`. If your volume mounts at a different path (e.g. `/data`), set this explicitly to that path + `/portal.db`. |
| `PORT` | `3000` | Container EXPOSE'd at 3000. |
| `NODE_ENV` | `production` | Set in Dockerfile. |
| `BETTER_AUTH_SECRET` | (`openssl rand -base64 32`) | Required. |
| `BETTER_AUTH_URL` | `https://portal.windbrook.app` | Production hostname (HTTPS). |
| `CANVA_CLIENT_ID` | (from Canva portal) | Optional unless Canva is connected. |
| `CANVA_CLIENT_SECRET` | (from Canva portal) | Optional. |
| `CANVA_REDIRECT_URI` | `https://portal.windbrook.app/api/canva/callback` | Must match the Canva developer-portal Authorized Redirect URL byte-for-byte. |

### Migrations on boot

`package.json` `start` runs the migration runner before the server:

```
"start": "tsx src/db/migrate.ts && node --import tsx src/server.ts"
```

`src/db/migrate.ts` calls drizzle's `migrate()` against `src/db/migrations/`.
Idempotent — the `__drizzle_migrations` tracking table inside the SQLite
DB skips already-applied SQL files. On a fresh volume, the migrations
create the schema; on a redeploy with the volume retained, only NEW
migrations apply.

If a migration fails (column conflict, etc.), the start script exits 1
and Railway's healthcheck-on-`/healthz` will keep failing. The `[migrate]
✗ migrations FAILED:` block in the logs has the exact SQL error.

### `SQLITE_CANTOPEN` on first deploy

Both `src/db/client.ts` and `src/db/migrate.ts` call
`mkdirSync(dirname(dbPath), { recursive: true })` before
`new Database(...)`. better-sqlite3 raises `SQLITE_CANTOPEN` if the
parent directory doesn't exist; the mkdir is idempotent and cheap.
Without it, the first deploy onto a fresh empty volume crashes.

### Production-codebase note

The `aw-portal@1.0.0` log line in earlier production traces (`> node
dist/index.js`) is **not** this repo's `windbrook-portal/`. If a Railway
service is currently deploying from a different source, point it at this
repo (`muhammadhamzaali077/Educated-Freedom`, root `windbrook-portal/`)
or merge the fixes from this directory into whatever source is wired up.
The `windbrook-portal/` codebase ships source + runs via `tsx`; there is
no `dist/` build step.

---

## Reference Index

- `docs/references/PRD-andrew-windham.md` — full PRD, source of truth for scope.
- `docs/references/transcript.txt` — discovery call transcript with timestamped quotes.
- `docs/references/SACS-Example.pdf` — pixel reference for SACS report.
- `docs/references/TCC-template.docx` — pixel reference for TCC report (Word source).
- `docs/references/TCC-reference.png` — annotated TCC reference image.
