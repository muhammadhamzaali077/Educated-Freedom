import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { AppLayout } from '../layouts/app-layout.js';

type Props = {
  userName: string;
  userRole: string | null;
  page1Svg: string;
  page2Svg: string;
};

export const DevSacsDiffPage: FC<Props> = ({ userName, userRole, page1Svg, page2Svg }) => (
  <AppLayout
    title="SACS · Visual Diff"
    active="reports"
    crumbs={[{ label: 'Reports' }, { label: 'SACS visual diff' }]}
    userName={userName}
    userRole={userRole}
  >
    <header class="form-header">
      <h1 class="form-title">SACS · visual diff</h1>
      <p class="label">Generated SVG (left) vs. Sagan PDF reference (right). Synthetic Lipski-shaped data.</p>
    </header>

    <div class="diff-row">
      <p class="diff-label">Page 1 — Monthly Cashflow</p>
      <div class="diff-pair">
        <div class="diff-frame">{raw(page1Svg)}</div>
        <embed
          class="diff-pdf"
          src="/dev/refs/sacs.pdf#page=1&view=Fit"
          type="application/pdf"
          aria-label="Sagan SACS reference PDF page 1"
        />
      </div>
    </div>

    <div class="diff-row">
      <p class="diff-label">Page 2 — Long-Term Cashflow</p>
      <div class="diff-pair">
        <div class="diff-frame">{raw(page2Svg)}</div>
        <embed
          class="diff-pdf"
          src="/dev/refs/sacs.pdf#page=2&view=Fit"
          type="application/pdf"
          aria-label="Sagan SACS reference PDF page 2"
        />
      </div>
    </div>
  </AppLayout>
);
