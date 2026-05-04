import type { FC } from 'hono/jsx';

/**
 * Phase 4 placeholder. Replace with the real SVG renderer in Phase 5 (SACS)
 * and Phase 6 (TCC). The structure here is just enough to convey the report
 * layout the live preview will eventually paint.
 */
export const ReportPreviewPlaceholder: FC<{ reportType: 'SACS' | 'TCC' }> = ({ reportType }) => (
  <div class="preview-pane" aria-label={`${reportType} live preview placeholder`}>
    <div class="preview-tag">Live preview · {reportType}</div>
    {reportType === 'SACS' ? <SacsSkeleton /> : <TccSkeleton />}
    <p class="preview-note">
      Phase 5 / 6 wires this preview to the real renderer. For now, the layout
      below indicates the structure each report follows.
    </p>
  </div>
);

const SacsSkeleton: FC = () => (
  <svg viewBox="0 0 400 520" xmlns="http://www.w3.org/2000/svg" class="preview-svg" role="img">
    <title>SACS report skeleton</title>
    <text x="200" y="28" text-anchor="middle" class="preview-svg-title">
      Simple Automated Cashflow System
    </text>
    <rect x="40" y="60" width="120" height="80" rx="4" class="skel-green" />
    <text x="100" y="100" text-anchor="middle" class="skel-label">Inflow</text>
    <text x="100" y="120" text-anchor="middle" class="skel-amount">$XX,XXX</text>

    <line x1="160" y1="100" x2="240" y2="100" class="skel-arrow" marker-end="url(#arrow-r)" />
    <text x="200" y="92" text-anchor="middle" class="skel-arrow-label">auto / mo</text>

    <rect x="240" y="60" width="120" height="80" rx="4" class="skel-red" />
    <text x="300" y="100" text-anchor="middle" class="skel-label">Outflow</text>
    <text x="300" y="120" text-anchor="middle" class="skel-amount">$XX,XXX</text>

    <circle cx="200" cy="240" r="60" class="skel-blue" />
    <text x="200" y="234" text-anchor="middle" class="skel-label">Private Reserve</text>
    <text x="200" y="252" text-anchor="middle" class="skel-amount">$XX,XXX</text>

    <text x="200" y="340" text-anchor="middle" class="preview-svg-page">— page 2 —</text>

    <rect x="40" y="360" width="100" height="60" rx="4" class="skel-faint" />
    <text x="90" y="395" text-anchor="middle" class="skel-label">Schwab</text>
    <rect x="150" y="360" width="100" height="60" rx="4" class="skel-faint" />
    <text x="200" y="395" text-anchor="middle" class="skel-label">Brokerage</text>
    <rect x="260" y="360" width="100" height="60" rx="4" class="skel-faint" />
    <text x="310" y="395" text-anchor="middle" class="skel-label">Target</text>

    <defs>
      <marker id="arrow-r" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="currentColor" />
      </marker>
    </defs>
  </svg>
);

const TccSkeleton: FC = () => (
  <svg viewBox="0 0 400 560" xmlns="http://www.w3.org/2000/svg" class="preview-svg" role="img">
    <title>TCC report skeleton</title>
    <text x="200" y="28" text-anchor="middle" class="preview-svg-title">
      Total Client Chart
    </text>
    <text x="200" y="50" text-anchor="middle" class="preview-svg-page">Grand Total · $X,XXX,XXX</text>

    {/* Client 1 retirement */}
    <text x="100" y="84" text-anchor="middle" class="skel-label">Client 1 retirement</text>
    {[0, 1, 2].map((i) => (
      <circle cx={50 + i * 50} cy="120" r="22" class="skel-faint" />
    ))}

    {/* Client 2 retirement */}
    <text x="300" y="84" text-anchor="middle" class="skel-label">Client 2 retirement</text>
    {[0, 1, 2].map((i) => (
      <circle cx={250 + i * 50} cy="120" r="22" class="skel-faint" />
    ))}

    {/* Family Trust */}
    <circle cx="200" cy="240" r="48" class="skel-trust" />
    <text x="200" y="244" text-anchor="middle" class="skel-label">Family Trust</text>

    {/* Non-retirement bottom */}
    <text x="200" y="340" text-anchor="middle" class="skel-label">Non-retirement</text>
    {[0, 1, 2, 3].map((i) => (
      <circle cx={70 + i * 90} cy="380" r="22" class="skel-faint" />
    ))}

    {/* Liabilities box */}
    <rect x="40" y="440" width="320" height="80" rx="4" class="skel-liab" />
    <text x="200" y="466" text-anchor="middle" class="skel-label">Liabilities</text>
    <text x="200" y="488" text-anchor="middle" class="skel-amount-faint">$XXX,XXX (separate)</text>
  </svg>
);
