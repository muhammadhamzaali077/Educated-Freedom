# Windbrook Portal — Walkthrough

A short tour for **Andrew, Rebecca, and Maryann**, in the order you'll actually use it.

> **Where:** the portal lives at `https://<your-railway-url>` (your team's Railway URL).
> **Who:** sign in with your `@windbrook.dev` email. If you've forgotten the password, ask Andrew to reset it.

The screenshots referenced below are placeholders — capture them from the deployed portal once it's live (`docs/walkthrough/01-login.png`, etc.) and the references will resolve.

---

## 1. Sign in

> ![Login page](walkthrough/01-login.png)

- Enter your `@windbrook.dev` email and password.
- Hit **Continue**.
- That's it — sessions last 30 days, so on your work laptop you'll only see this screen once a month.

If you see "Email or password is incorrect," check the email — it's the `.dev` domain, not `.com`.

---

## 2. The dashboard

> ![Dashboard home](walkthrough/02-dashboard.png)

Two columns:

- **Left — Recent activity.** Reports you've generated, most recent first. Click any row to jump straight to that report.
- **Right — At a glance.**
  - *This Quarter* — count of households whose meeting report is on file for the current quarter.
  - *Upcoming Meetings* — the next three households due.
  - *Stale Balances* — count of accounts whose latest balance is more than 90 days old. Click to filter the Clients page.

The greeting changes based on time of day — morning, afternoon, evening.

---

## 3. Clients list — your households

> ![Clients list](walkthrough/03-clients-list.png)

Click **Clients** in the left sidebar.

- Each row shows the household name, the people in it (e.g., "Jonathan & Sandra Lipski"), the date of their last meeting, and a status pill:
  - `READY` — setup complete, balances fresh.
  - `BALANCES STALE` — has an existing report but the latest balance entry is over 90 days old.
  - `NEEDS SETUP` — missing the SACS-required accounts (Inflow, Outflow, Private Reserve) or no Person 1 yet.
- Top-right: **+ New household**.

Click any row to open that client's detail page.

---

## 4. Create a new client

> ![New client form](walkthrough/04-new-client.png)

From the Clients page, click **+ New household**. The portal creates a draft and opens the editor.

The form is one long page, top to bottom:

1. **Household** — name (used in report headers), meeting cadence, optional trust property address.
2. **Persons** — Person 1 always shown. Toggle **Add spouse** to reveal Person 2.
3. **Accounts** — sub-grouped:
   - *Retirement* — one row per IRA / 401K, each owned by Person 1 or Person 2 (never joint). Up to 6 per person.
   - *Inflow / Outflow / Private Reserve* — three required Pinnacle accounts, pre-created.
   - *Investment Brokerage* — Schwab side, up to 4 accounts.
   - *Other Non-Retirement* — Computershare, StoneCastle, family trust, etc. Up to 6.
4. **Expense Budget** — agreed monthly outflow + automated transfer day + deductibles.
5. **Liabilities** — mortgage, autos, etc. with interest rate and payoff date.

Click **Save household** at the bottom. Validation errors show inline next to the offending field — never as a top banner.

---

## 5. Generate a quarterly report

> ![Report generator](walkthrough/05-report-generator.png)

From the client detail page, click **+ New SACS** or **+ New TCC** in the header.

The screen is split:

- **Left — checklist.** One row per balance to enter. The "Last: $X,XXX as of {date}" line shows the prior quarter's value; click **Use last** to carry it forward (a small `*` will appear next to that field — it'll show as "stale" on the printed report).
- **Right — live preview.** Updates as you type. The Grand Total at the bottom-left is the biggest number on the page — it's the source of truth.

The **Generate Report** button stays disabled until every required balance has either a value or is marked "Use last." Below the button, "{N} of {M} fields ready" tells you how many you still need.

Click **Generate Report**. The portal redirects to the report's detail page.

---

## 6. Download the PDF

> ![Report detail with PDF download](walkthrough/06-report-pdf.png)

On any report detail page (the one that opens after Generate, or any historical report), the action bar across the top:

- **Download PDF** — generates the PDF on demand, downloads as `{Household} {Type} {Date}.pdf` (e.g., `Lipski Family TCC 2026-04-21.pdf`).
- **Edit layout** — toggle to drag bubbles between predefined slots. They snap into place; no free-form positioning. Saved per client + report type, so once you arrange Lipski's TCC, every future Lipski TCC inherits the layout.
- **Reset to default layout** — clears your saved positions for this client + report type.

The PDF is **pixel-stable**: re-downloading 6 months from now produces the exact same image, even if account balances or the layout have since changed. The snapshot used at generation time is locked into the report.

---

## 7. Export to Canva

> ![Canva export](walkthrough/07-canva-export.png)

**One-time:** **Settings** → **Connect Canva**. Authorize the integration. Each team member connects their own Canva workspace.

Once connected, every report detail page shows **Export to Canva**. Click it; the portal:

1. Generates the PDF.
2. Uploads it to your Canva workspace via the Connect API.
3. Opens the new Canva design in a new tab.
4. Stores the design URL on the report so **View in Canva** works for future visits.

A second click on **Re-export to Canva** uploads a fresh design (Canva's API doesn't support in-place updates without an Enterprise plan; the previous design stays in your workspace and the portal points to the latest).

---

## 8. Report history per client

> ![Report history](walkthrough/08-history.png)

Every client detail page has a **Report history** section.

- Filter pills: *All / SACS / TCC* — gold underline shows the active filter.
- Sort: *Most recent first* (default) / *Oldest first*.
- Each row: meeting date, type pill, who generated it, when, and how many balances were marked stale.

Per-row actions:

- **View** — open the full report detail page.
- **PDF** — re-download the locked PDF.
- **Duplicate as new** — opens the generator with this report's balances pre-populated, so the most common task ("the same form last quarter, with new numbers") is one click. You'll see the calc panel already showing fields-ready and a draft Grand Total. Adjust whatever needs adjusting and Generate.

---

## Quick keyboard shortcuts

| Action | Where |
|---|---|
| `Tab` | Walk through any form linearly |
| Arrow keys (in **Edit layout** mode) | Move the focused bubble to the nearest slot in that direction |
| `⌘ K` (label only — search comes in a future phase) | top-bar search box |

---

## When something goes wrong

- **"PDF export failed"** — the Playwright chromium binary may not be installed on the server. Tell Andrew; one command on Railway fixes it (`railway run npx playwright install chromium`).
- **"SACS requires Inflow, Outflow, and Private Reserve accounts"** — go to the client's profile and re-add whichever account got removed.
- **"Email or password is incorrect"** — double-check `.dev` not `.com`.
- **Anything else** — the page will say "Something is amiss" and Andrew gets a notification. Take a screenshot and Slack him.

---

## What's NOT in V1

Per the PRD, these were parked deliberately:

- **No automatic balance pulls** from Schwab / Pinnacle / RightCapital / Zillow — every quarterly balance is typed in.
- **No mass email of reports** to clients — the cadence is the in-person quarterly meeting.
- **No Dropbox auto-save** — re-download from the portal is the canonical history.

Each of those is its own future phase if/when the team decides it's worth the build.

---

If you find something confusing or broken, open an issue with a screenshot. The portal is small and pliable; we can change it.
