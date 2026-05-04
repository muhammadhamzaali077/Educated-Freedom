# Windbrook Client Report Portal — PRD v1.0

**Client**: Andrew Windham / Rebecca Romney / Maryann Pastrana — Windbrook Solutions | **Date**: 2026-04-16 | **Build Type**: New

---

## One-Line Summary

Cuts Windbrook Solutions' quarterly client-meeting prep from a full day to under an hour per client by replacing Canva/Word/Excel chaos with one portal that generates polished, math-checked SACS and TCC PDFs for their 6 high-net-worth families.

---

## Build Spec

_Share this section with the customer for approval before starting the build._

- Set up each client once with their profile, account structure, and static financial details so you never re-enter onboarding data
- Enter current balances through a guided checklist; the portal does every calculation automatically (totals, excess, net worth, liabilities)
- Generate polished SACS (cashflow) and TCC (net worth) PDFs in Andrew's exact existing format, ready to present at quarterly meetings
- Download as PDF or export to Canva for any last-minute visual touch-ups

---

## Company & Problem Context

**Company:** Windbrook Solutions is the financial-planning arm of Andrew Windham's business ecosystem (alongside College Planning Institute and the Educated Freedom podcast), based in the Atlanta area. It's a 3-person shop — Andrew (founder/lead advisor), Rebecca Romney (financial planner with Schwab authorization), and Maryann Pastrana (executive assistant, recently placed through Sagan) — serving ~6 high-net-worth families on monthly retainer plus assets-under-management. Clients are millionaires who meet quarterly and expect bank-grade presentation quality.

**Problem:** Today, preparing for each quarterly client meeting takes Rebecca and Maryann a full day. They assemble two documents by hand — a SACS (Simple Automated Cashflow System) diagram in Word and a TCC (Total Client Chart) net-worth overview in Canva — pulling numbers from Pinnacle Bank (requested by email 2 days before the meeting), Charles Schwab (only Rebecca and Andrew are authorized to log in), RightCapital (whose sync Maryann flatly doesn't trust), Zillow (for house values), and the client's expense worksheet. Every total is added by hand; every bubble must be repositioned when a client has a different number of accounts, which breaks the layout. Errors happen — wrong totals, stale balances — and the team catches them by double-checking each other, which adds hours. Rebecca: "all of that math is done manually, so even just automating that would be great." Maryann: "this takes us a day to prepare. If we could take this down to an hour…" The build replaces the whole assembly process with one portal: enter dynamic balances into a structured checklist, let the math and layout render themselves, click download.

---

## Developer Brief

- **One-time client setup**: Windbrook has no CRM — client info lives in scattered Excel files, PreciseFP questionnaires, and Dropbox folders. The portal is the new source of truth for *report generation* (not the whole client relationship): one record per client holds names, DOBs, SSN last-four, account structure (which retirement/non-retirement accounts each spouse has), monthly salary, agreed expense budget, target savings, property address for the trust, and the liability list. Entered once, reused every quarter. Only ~6 clients to seed, growing to maybe 12.
- **Checklist-driven quarterly data entry + auto-math**: Before a meeting, the team clicks "Generate Report" on a client and sees a form pre-filled with static data and blank fields for the current-quarter balances (each Schwab account, Pinnacle balances, Zillow Zestimate, RightCapital-sourced outside balances). "Use last value" is available per field. Calculations are automatic and deterministic: Excess = Inflow − Outflow; retirement totals per spouse; non-retirement total (excluding trust); grand total = retirement-1 + retirement-2 + non-retirement + trust; liabilities total shown separately and never subtracted. Rebecca was emphatic about these rules at 24:28 and 26:15.
- **Pixel-stable PDF generation matching Andrew's format**: Andrew designed these templates and is happy with how they look — no redesign. SACS = green Inflow → red Outflow (with $X/mo automated-transfer arrow) → blue Private Reserve, plus a second page with Private Reserve, Schwab brokerage, and Target. TCC = Client 1 / Client 2 retirement sections on top, non-retirement on the bottom, Family Trust circle in the center, liabilities box, Grand Total banner. The layout must remain stable regardless of how many account bubbles each client has (variable 1-6 per section). A light visual polish is welcomed — Maryann: "a little [polish] would be nice" (52:42) — but the structure does not change.
- **Export options**: "Download PDF" is the primary output; "Export to Canva" is the secondary path if the team wants to tweak before presenting. Both from the same screen. Zaki proposed this at 52:56-53:07 and Maryann confirmed. If Canva API feasibility is soft, the engineer can ship the PDF path first and wire Canva export as a follow-up without blocking V1.

---

## Prototype

_First deliverable. Fully buildable with synthetic data and zero customer credentials._

**What the prototype delivers:**
- A logged-in portal with 3 pre-loaded synthetic clients covering Windbrook's typical shapes: single-earner household, married couple with Client 1 / Client 2 retirement accounts + joint non-retirement + family trust, and a couple with extra accounts like a 401K and stock options. Each has realistic static data and a prior quarter's balances on file.
- Working "Generate Report" flow: checklist form pre-populates static fields and blank dynamic fields, includes a "use last value" option per field, recalculates the Excess / Retirement / Non-Retirement / Grand Total / Liabilities totals live, and then renders two PDFs — SACS and TCC — matching Andrew's existing layout with a light polish pass.
- Download-as-PDF works end to end. Export-to-Canva is either stubbed (links out to a pre-populated sample in a demo Canva workspace) or functional if the engineer confirms Canva Connect API coverage during build.
- Sample PDFs render side-by-side with the Windbrook originals so the team can do a visual diff during the prototype walkthrough.

**What's simulated (demo mode):**
- All balances, names, addresses, DOBs, SSN last-fours, and account numbers are AI-generated synthetic data modeled on Rebecca's walkthrough and the sample PDFs she shared in Dropbox. No customer data used.
- No live integrations: no Pinnacle email, no Schwab login, no RightCapital API, no Zillow Zestimate lookup. The "enter current balance" fields are the entire input surface.
- Canva export either stubs to a static sample design or (if feasible) creates a new Canva design in a Sagan demo workspace for the engineer to show during the walkthrough.

**To complete (what we need from Windbrook after prototype approval):**
- The "Data Point List" document Rebecca and Maryann prepared (visible at 29:14 in the call) — maps every field on both reports to its source system. This is the authoritative field spec.
- Current sample PDFs — SACS-Example.pdf and tcc_sample_client Green.pdf from the Onboarding Materials Dropbox folder — for pixel-level layout matching.
- Real client data to seed the 6 actual clients (names, account structures, static financial info).
- Access decisions: whether/how the portal should authenticate (email/password only, Microsoft SSO, or Google SSO — Rebecca flagged compliance on Google at 34:50, needs a 5-minute clarification).
- Canva workspace access if "Export to Canva" ships in V1.

---

## Stack Suggestions

_Recommended tools and services, grounded in [stack.md](references/stack.md). The engineer may diverge if the project calls for it._

| Layer | Tool | Rationale |
|-------|------|-----------|
| Hosting | Railway | Sagan default per stack.md. One service handles web + SQLite + PDF generation. No cron, no queues needed. |
| Frontend | HTML + Tailwind CSS + htmx | Sagan default per stack.md. Internal admin portal for 3 users, form-heavy, CRUD, no shared client state — canonical htmx territory. Server returns HTML fragments as balances update. |
| Backend | Hono (Node.js + TypeScript) | Sagan default per stack.md. Clean route structure for client CRUD + report generation endpoints. |
| Database | SQLite on Railway volume | Per stack.md — low-volume default. ~6 clients × 4 reports/year is trivial; no need for Postgres. Keep report history for "use last value." |
| Integrations | None in V1 (direct Canva API if Canva export ships) | Per stack.md integration philosophy — V1 has no external data pulls. Canva's Connect API is a direct call if/when the export feature is built; no n8n needed. |
| AI | None | Per stack.md — only include AI when needed. This is deterministic arithmetic and HTML→PDF rendering. Adding an LLM would be premature and adds failure modes Rebecca/Andrew can't tolerate in front of HNW clients. |
| PDF generation | Headless browser to render HTML/CSS/SVG → PDF | Not in stack.md — capability description only. Layout-fidelity work favors HTML/CSS (same codebase as the portal) rendered via a headless browser. Engineer picks the specific library. |
| Auth | Better Auth with email/password (and optionally Microsoft SSO) | Per stack.md, Better Auth is the default. Rebecca said "we cannot use anything Google" for compliance (34:50) — she was talking about data storage, not identity, but to stay safe avoid Google OAuth. Email/password + Microsoft Entra are fine. |

**Environment Variables**: `DATABASE_URL`, `SESSION_SECRET`, `BETTER_AUTH_SECRET`, `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` _(last two only if Canva export ships in V1)_

---

## Screen Share Timestamps

_Moments in the recording where the customer shared their screen. Numbering on disk is not strictly sequential — timestamps in filenames are authoritative._

| Timestamp | Screenshots | Description | Relevance |
|-----------|-------------|-------------|-----------|
| 04:52 | `1_04m52s.jpg` | Maryann opens the Onboarding Materials Dropbox folder — shows SACS-Example.pdf, tcc_sample_client Green.pdf, Onboarding Process.docx, Monthly Expense Worksheet Blank.pdf | Source of the sample files the engineer needs; confirms current file organization (Dropbox, no CRM) |
| 13:08 | `50_13m08s.jpg`, `51_13m10s.jpg` | SACS-Example.pdf opens in preview — **"Simple Automated Cashflow System (SACS)"** with green Inflow ($15,000) → red Outflow ($12,000) with "X = $12,000/month Automated transfer on the 20th" arrow → blue Private Reserve circle, $1,000 floor notes on each account | **Critical visual reference** — SACS layout to replicate on page 1 |
| 20:52 | `70_20m52s.jpg`, `71_21m12s.jpg`, `72_21m28s.jpg` | tcc_sample_client Green.pdf opens — Client 1 / Client 2 green bubbles with age/DOB/SSN, Retirement account bubbles at top (Roth IRA, IRA, 401K with balances), Client 1 Retirement Only and Client 2 Retirement Only gray totals | **Critical visual reference** — TCC upper half. Shows bubble structure |
| 26:26 | `80_26m26s.jpg`, `81_26m50s.jpg`, `82_26m52s.jpg` | Full TCC view — NAME, DATE, GRAND TOTAL at top; non-retirement bubbles (Wells Fargo accounts, Pinnacle Inflow/Outflow/Private Reserve), Family Trust circle in middle, liabilities box with mortgages/auto loans/interest, asterisk note "Indicates we do not have up to date information" | **Critical visual reference** — TCC full layout, confirms Grand Total + Liabilities placement |
| 29:14 | `100_29m14s.jpg`, `101_29m16s.jpg`, `102_29m18s.jpg` | Word doc titled "Data Point List" — bulleted spec mapping every SACS and TCC field to its source: Inflow (client salary from onboarding), Outflow (expense worksheet), Automated Transfer, Private Reserve (Pinnacle by email 2 days prior), Schwab Brokerage (Andrew or Rebecca only), Target (6+ months expenses + insurance deductibles), Client Information (Name/Age/DOB/SSN last 4), Liabilities (from RightCapital or statements: type, interest rate) | **Authoritative field spec** — request this document from the team before building |

---

## Key Definitions

| Term | Meaning | Examples |
|------|---------|----------|
| SACS | Simple Automated Cashflow System — page-1 cashflow diagram showing how a client's paycheck moves through their accounts each month | Inflow ($15K/mo) → Outflow ($12K/mo via auto-transfer on the 20th) → Private Reserve (excess) |
| TCC | Total Client Chart — net-worth overview with retirement accounts (top), non-retirement (bottom), family trust (center), liabilities (separate), with per-spouse and grand totals | Filename in Dropbox: `tcc_sample_client Green.pdf` |
| Inflow | Client's take-home salary going into their primary checking — static unless they get a raise or change jobs | $15,000/month after taxes |
| Outflow | Agreed monthly expense budget — automatically transferred from inflow to the spending account on the 20th of each month | $12,000/month (rounded up from ~$11,500 actual for buffer) |
| Private Reserve | High-yield savings account that accumulates the excess (Inflow − Outflow) each month | Target = 6 months of expenses + sum of all insurance deductibles |
| Family Trust | Typically funded by the client's primary residence; valued by Zillow Zestimate each quarter | "We go to Zillow, type in their address, that's the number" — Rebecca |
| Client 1 / Client 2 | For married clients, accounts are split by owner. Retirement accounts cannot be joint; non-retirement accounts can be | Client 1: Roth IRA, IRA. Client 2: Roth IRA, 401K |
| Floor | $1,000 minimum balance maintained in each account as buffer — constant | Never changes |
| Grand Total | Net worth = Client 1 Retirement + Client 2 Retirement + Non-Retirement Total + Trust. Liabilities are shown separately and **never** subtracted | — |
| Data Point List | Word document Rebecca and Maryann produced mapping every report field to its source — authoritative spec | Screenshot `100_29m14s.jpg` |

---

## User Stories

### User Story 1: Set up each client once with profile and accounts

**Implementation Considerations:**
- Schema needs to handle variable account counts per client: 1-6 retirement accounts per spouse, 0-6 non-retirement, 0-3 liabilities. Design for flexibility — every client has a different mix.
- Retirement accounts must be owned by Client 1 or Client 2 exclusively (never joint). Non-retirement accounts can be joint or individual. Liabilities are joint by default. Encode these rules in the data model.
- Onboarding data (names, DOB, SSN last 4, family info) currently lives in PreciseFP — PreciseFP has an API, but with only 6 clients, Zaki and Maryann agreed at 50:44 to skip the integration and enter manually. Revisit in V2 if client count grows.
- The "Data Point List" document (screenshot `100_29m14s.jpg`) defines every required field. Request this from the team before modeling the schema.

### User Story 2: Enter current balances through a checklist and let the portal do the math

**Implementation Considerations:**
- Pre-populate the form with the previous quarter's values where available, with a per-field "use last value" option — Rebecca suggested this at 39:54 ("use the old numbers").
- Show the last-known-as-of date next to each balance so the team knows which numbers are stale. The Windbrook originals use a "*" with a footnote to flag stale values — mirror this convention.
- Calculation rules are non-negotiable and came from Rebecca (24:28, 26:15): grand total excludes liabilities; trust counts in net worth but not in the non-retirement subtotal; per-spouse retirement subtotals feed into the grand total.
- Block "Generate PDF" until every required field is filled (or explicitly marked "use last value"). Prevent the silent missing-field error Rebecca described with past assistants.
- The expense worksheet data (used to compute Outflow and Target) today lives in an Excel file. For V1 it's manually entered into the client profile; V2 could ingest the worksheet. Don't try to parse arbitrary Excel in V1.

### User Story 3: Generate polished SACS and TCC PDFs matching Andrew's exact format

**Implementation Considerations:**
- Pixel fidelity matters. Andrew designed these layouts and does not want them changed — Rebecca at 11:15 ("He is happy with the way they look. We're not looking to change the appearance"). A minor polish pass is welcomed (Maryann, 52:42) but structure is locked.
- TCC is the harder one — variable bubbles (1-6 retirement per spouse, 0-6 non-retirement) must not reflow the layout. HTML/CSS grid or SVG with fixed anchor points works better than a WYSIWYG template engine here.
- SACS arrows carry literal text like "X = $12,000/month Automated transfer on the 20th" — these are computed from the client's data, not decorative. Treat arrow labels as data-bound.
- The asterisk footnote convention ("* Indicates we do not have up to date information") should render only when at least one balance is stale. See `80_26m26s.jpg`.
- Client name and meeting date go in the header. Grand Total banner at top-center of TCC.
- Request `SACS-Example.pdf` and `tcc_sample_client Green.pdf` from the Onboarding Materials Dropbox folder — these are the pixel references.

### User Story 4: Download as PDF, or export to Canva for final touch-ups

**Implementation Considerations:**
- PDF download is the primary path and must ship. Canva export is the secondary path — Zaki proposed at 52:56, Maryann confirmed ("Sound? Perfect.") but PDF alone covers the core need if Canva integration slips.
- Canva Connect API supports programmatic design creation via OAuth — doable, but verify the specific "create design from template + inject content" flow during the prototype phase before committing to V1 delivery. If it's flaky or limited, ship with a "Download PDF → open in Canva manually" workflow and mark full export for V2.
- Storage of generated reports: the team wanted Dropbox auto-save (Maryann, 41:23) but Zaki explicitly parked that as a separate lego brick. For V1, keep a report-history view in the portal ("re-download Q1 2026 report for Smith family") — don't integrate Dropbox yet.

---

## Data Sources

| Source | Type | Direction | Integration Method | Notes |
|--------|------|-----------|-------------------|-------|
| Team (portal web form) | Manual input | In | Portal UI | Primary and only data-entry surface for V1. Static fields once per client; dynamic balances each quarter |
| PreciseFP | Client onboarding data | In (one-time) | Manual copy into portal | Has API but Zaki and Maryann agreed to skip at this client count (50:44). Revisit if scaling past 12 clients |
| Canva | Design tool | Out (optional) | Canva Connect API — OAuth | "Export to Canva" is secondary. Ship PDF download first; verify API coverage during prototype before committing Canva export for V1 |

**Parked for V2+:**
- RightCapital API — account aggregation. Maryann: "don't trust RightCapital that much" (49:06). Also the login isn't even the team's — it belongs to someone Andrew used to work with (Rebecca, 48:14)
- Charles Schwab — only Rebecca/Andrew authorized; compliance on credential sharing (48:14)
- Pinnacle Bank — today via secure email; might be automated via API in V2
- Zillow — Zestimate scrape/API for trust property values; small lift but parked
- Plaid — direct bank account aggregation as a potential replacement for RightCapital (Zaki, 49:28)

---

## Discussed But Not Confirmed

- **Auto-save generated reports to client Dropbox folders**: Maryann asked at 41:23 ("Can we have it drop it into their Dropbox automatically linked?"). Zaki acknowledged it but immediately redirected to "pick one problem, one lego brick at a time." Not committed for V1. Easy add — confirm with the team before including.
- **Client-facing monthly expense worksheet portal**: Rebecca's idea at 42:14 — let clients update their expense worksheet directly in the portal instead of Excel. Zaki redirected to the core PDF-generation problem. Separate future build.
- **Monthly (not just quarterly) report auto-email to clients**: Zaki floated this at 15:11; Rebecca clarified "we do this for every client meeting, so quarterly" (15:19). Not a current Windbrook workflow — would change client cadence.
- **"SOP" accessible on the portal**: Maryann mentioned at 41:51 wanting a reference doc on the portal itself for other team members. Not committed; could be as simple as a static help page if desired.

---

## Out of Scope (Future Phases)

- **Auto-pull balances from RightCapital** — Maryann explicitly parked: "make that second version" (49:24). Data quality issues too.
- **Auto-pull balances from Charles Schwab** — compliance on credential sharing (Rebecca, 48:14). Requires a careful read of Schwab's advisor-access options.
- **Auto-fetch Pinnacle Bank balances** — currently an email-based workflow with personal bankers; worth exploring a secure-email parser or Pinnacle API in V2.
- **Auto-fetch Zillow Zestimate for trust property values** — small lift; low priority.
- **Plaid account aggregation** — potential RightCapital replacement; Zaki mentioned at 49:28.
- **PreciseFP sync** — not valuable at 6 clients; revisit if they scale past ~12.
- **Onboarding automation agent** — Zaki proposed at 43:36; the team showed interest. Separate build.
- **Podcast production help** — came up in call 1 with John; that's a Sagan hiring-request, not an agent build.

---

## Confidence Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Scope Definition | 5/5 | Two calls. Sample PDFs shared in Dropbox. "Data Point List" Word document maps every field (screenshot `100_29m14s.jpg`). Rebecca walked through both reports in detail. Crisp in/out boundary. |
| Technical Feasibility | 4/5 | Familiar stack. Zero external integrations in V1. One real risk: pixel-fidelity reproduction of Andrew's TCC circle chart with variable bubble counts — solvable with HTML/CSS grid or SVG, but needs care. Canva export is a secondary path with mild API-feasibility risk. |
| Customer Impact | 4/5 | Day → hour per meeting, plus elimination of math errors in front of HNW clients (reputationally outsized vs. hours saved). Absolute hours saved are modest at 6 clients × 4 meetings/year, but the build also unlocks scaling past 6 clients without adding staff. |
| **Overall** | **4/5** | **= Technical Feasibility / Customer Impact tie** |

Strong build. Scope is exceptionally clear. The value is less about time savings (modest in absolute hours) and more about error elimination in client-facing deliverables and enabling the firm to grow past 6 clients without hiring. Rebecca and Maryann are detail-oriented, engaged collaborators.

---

## Audit Notes

All four user stories trace to explicit transcript moments across both calls. Client setup (US1) — Zaki's portal proposal at 35:44, reinforced by Maryann's "living in a portal" at 40:37. Checklist + auto-math (US2) — Rebecca's report walkthrough at 05:55-28:00, and Maryann's "this takes us a day" at 33:34. PDF generation matching Andrew's format (US3) — Rebecca's "we're not looking to change the appearance" at 11:15, plus the sample PDFs shared in Dropbox. Download + Canva export (US4) — Zaki's proposal at 52:56, Maryann's "Sound? Perfect" at 53:07.

Four items moved to Discussed But Not Confirmed during audit: Dropbox auto-save (Maryann asked, Zaki redirected), client-facing expense worksheet portal (Rebecca's idea, redirected), monthly auto-email (mismatches quarterly cadence), and on-portal SOP (mentioned in passing).

Prototype audit: fully buildable with synthetic data — no customer credentials required. "To Complete" items are real post-prototype needs traceable to the transcript (Data Point List doc, sample PDFs, real client data, auth/Canva access). Synthetic data descriptions match the client shapes Rebecca described. Calculation rules locked to Rebecca's explicit statements at 24:28 and 26:15.

No red flags found. All scope traces to conversation.
