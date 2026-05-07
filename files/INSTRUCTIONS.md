# Phase 28 — SACS Pixel-Perfect Rebuild from Reference Coordinates

This is different from previous SACS phases. Instead of writing patches that
adjust geometry by eye, I extracted the actual coordinates from the reference
PDF using PyMuPDF and built a complete renderer using those exact numbers.

## Provided file

`patches/render.ts` — full replacement for `src/reports/sacs/render.ts`.

Every coordinate, color, font size, and text position in this file came
directly from the reference PDF measurements. Examples:

- INFLOW circle: cx=159.68, cy=252.92, r=102.08 (exact from reference rect)
- OUTFLOW circle: cx=576.29, cy=253.68, r=102.84
- PRIVATE RESERVE circle: cx=371.37, cy=421.85, r=102.08
- All three circles same radius — they're ALL big (~204px diameter)
- Inflow→Outflow arrow path: exact 7-point polygon from reference
- Canvas: 768 × 576 (PowerPoint 16:9, NOT US Letter)

The reference PDF uses Canva proprietary fonts (CanvaSans, Garet, Inter)
which we don't have. They're substituted with our self-hosted Geist Sans —
the closest open-source equivalent. Visual difference will be minor.

## Apply

```bash
cp patches/render.ts src/reports/tcc/../sacs/render.ts
```

(Adjust path to match the actual location of the SACS renderer in the project.)

## What the renderer expects (interface)

```ts
interface SacsSnapshot {
  householdName: string;
  meetingDate: string;     // ISO yyyy-mm-dd
  asOfDate: string;
  persons: Array<{
    firstName: string;
    monthlyInflowCents: number;
  }>;
  inflow: { monthlyTotalCents: number };
  outflow: {
    monthlyTotalCents: number;
    automatedTransferDay: number;  // 1-31
  };
  privateReserve: {
    monthlyContributionCents: number;
    targetCents: number;
    breakdown: {
      sixMonthsExpensesCents: number;
      homeownerDeductibleCents: number;
      autoDeductibleCents: number;
      medicalDeductibleCents: number;
    };
  };
  schwab: { valueCents: number };
  staleFields: Set<string>;
}
```

If the existing snapshot type differs, you'll need to map fields. Most likely
the existing project has slightly different naming (e.g. `expenseBudget`
instead of `privateReserve.breakdown`). Adapt by changing the field accesses
in the top of `renderPage1` and `renderPage2`, NOT by changing the rest of
the renderer.

## What's new in this rebuild

### Page 1
1. Canvas resized to 768 × 576 (was different)
2. All three circles (Inflow/Outflow/PrivateReserve) at exact reference
   positions and equal radius 102
3. Inflow→Outflow arrow as exact 7-vertex polygon from reference
4. White inset value boxes at exact reference rectangles
5. Diamond-shaped $ icon (rotated square) with $ glyph inside, top-left
6. Contributor list below the diamond, bold green, exact y-positions
7. Papers icon top-right with vertical+horizontal black connector line
   ending in arrow into Outflow circle's right edge
8. Piggy bank with coin stacks and sparkles inside Private Reserve circle
9. Hollow chunky L-arrow from Inflow bottom to Private Reserve left
10. Bottom dotted blue arrow + "MONTHLY EXPENSES" label

### Page 2
1. Title only at top — NO household name, NO date (reference treats
   page 2 as title-only addendum)
2. Dotted descent arrow from title to bidirectional arrows below
3. PINNACLE PR (light blue) and SCHWAB (navy) circles at exact positions
4. White inset value boxes inside both circles
5. "$X TARGET" inside Pinnacle PR circle (NOT outside below)
6. "BROKERAGE" inside Schwab circle below value box
7. "Remainder" outside below Schwab in sentence case
8. Bidirectional bowtie: two solid filled blue arrows
9. Target breakdown text plain centered (not bulleted)
10. Footer "LONG TERM CASHFLOW" + "( Magnified Private Reserve Cashflow)"
    BOLD blue

## What stays the same

- "MONTHLY EXPENSES" stays correctly spelled (reference's typo correction
  was pre-approved by Maryann at 52:42)
- Real client numbers populate where reference shows $00,000 placeholders

## Verification after apply

1. Hard-refresh and open the Cole Household SACS report
2. Click Download PDF
3. Open the downloaded PDF side-by-side with `Copy_of_SACS-_for_Sagan.pdf`
4. The two should look effectively identical (allowing for our Geist Sans
   substitution where the reference uses Canva proprietary fonts)

## What to do if something looks off

The coordinate extraction was done from the actual PDF, so geometry should
be exact. If something is visually wrong:

- **Text is off by a few pixels vertically**: SVG dominant-baseline differs
  from PDF text baseline. Adjust the y-coordinate by ±2-4px on the affected
  text element. The reference y-coordinates are PDF text baselines; our
  SVG text uses `dominant-baseline="alphabetic"` which should match.

- **Circles look smaller than reference**: check the canvas viewBox is
  768×576. If it's still 792× something, the renderer is rendering at the
  wrong scale.

- **Arrow polygon looks wrong**: the path string in `P1.ARROW_PATH` is
  exact from the reference. Don't modify it. If it renders wrong, the
  issue is the surrounding white background rect bleeding through.

- **Fonts look wrong**: we're using Geist Sans as substitute for Canva's
  proprietary fonts. Visual feel should be ~95% match. Don't try to use
  Canva fonts (they're not licensed for our use).

## Important — NO eyeballing

If you (Claude Code) feel tempted to "improve" any of these coordinates,
DON'T. Every number in this file was measured from the actual reference
PDF. Adjusting them by eye breaks pixel parity.

If a coordinate is wrong, it's because either:
(a) The reference was measured at a different DPI (check)
(b) The font substitution requires a small y-offset (adjust by ±4px max)
(c) The renderer isn't being rendered at the correct viewBox scale

Don't add new SVG elements. Don't change the canvas size. Don't replace
arrow paths. Only adjust text y-coordinates if needed for vertical
alignment due to font substitution.

## After deploy

The user will compare the deployed PDF with the reference. If anything is
visibly off, they'll send a fresh side-by-side. At that point we make
SURGICAL adjustments — never wholesale rewrites.
