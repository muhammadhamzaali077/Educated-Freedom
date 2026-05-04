import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { AppLayout } from '../layouts/app-layout.js';

type Props = {
  userName: string;
  userRole: string | null;
  rows: Array<{ label: string; svg: string }>;
};

export const DevTccDiffPage: FC<Props> = ({ userName, userRole, rows }) => (
  <AppLayout
    title="TCC · Visual Diff"
    active="reports"
    crumbs={[{ label: 'Reports' }, { label: 'TCC visual diff' }]}
    userName={userName}
    userRole={userRole}
  >
    <header class="form-header">
      <h1 class="form-title">TCC · visual diff</h1>
      <p class="label">
        Generated SVG (left) vs. Sagan template render (right). Three account-count
        scenarios stacked: 1, 3, 6 retirement accounts per side.
      </p>
    </header>

    {rows.map((row) => (
      <div class="diff-row">
        <p class="diff-label">{row.label}</p>
        <div class="diff-pair">
          <div class="diff-frame">{raw(row.svg)}</div>
          <img
            class="diff-pdf"
            src="/dev/refs/tcc.png"
            alt="Sagan TCC reference image"
          />
        </div>
      </div>
    ))}
  </AppLayout>
);
