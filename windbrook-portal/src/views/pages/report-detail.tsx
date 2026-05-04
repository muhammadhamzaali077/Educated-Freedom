import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { formatDistanceToNow } from 'date-fns';
import type { LayoutPayload } from '../../lib/layouts.js';
import { AppLayout } from '../layouts/app-layout.js';

type ReportDetailProps = {
  userName: string;
  userRole: string | null;
  clientId: string;
  householdName: string;
  reportId: string;
  reportType: 'SACS' | 'TCC';
  meetingDate: string;
  status: string;
  /** ISO 8601. Optional because the layout-edit canvas re-render route
   * returns a partial fragment that only needs ReportCanvas's subset. */
  generatedAt?: string;
  /** Display name of the user who generated the report. */
  generatedByName?: string | null;
  pages: string[];
  layout: LayoutPayload;
  bubbleLabels: Record<string, string>;
  canvaConnected?: boolean;
  canvaDesignId?: string | null;
  canvaEditUrl?: string | null;
  /** False when CANVA_CLIENT_ID/SECRET/REDIRECT_URI are missing on the server. */
  canvaEnvConfigured?: boolean;
};

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export const ReportDetailPage: FC<ReportDetailProps> = (p) => {
  const generatedRel = p.generatedAt
    ? formatDistanceToNow(new Date(p.generatedAt), { addSuffix: false })
    : null;
  const eyebrowSegments = [
    p.reportType,
    p.status.toUpperCase(),
    generatedRel
      ? `GENERATED ${generatedRel.toUpperCase()} AGO${p.generatedByName ? ` BY ${p.generatedByName.split(' ')[0]?.toUpperCase()}` : ''}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <AppLayout
      title={`${p.reportType} · ${p.householdName}`}
      active="reports"
      crumbs={[
        { label: 'Clients', href: '/clients' },
        { label: p.householdName, href: `/clients/${p.clientId}` },
        { label: `${p.reportType} · ${dateFmt.format(new Date(`${p.meetingDate}T00:00:00`))}` },
      ]}
      userName={p.userName}
      userRole={p.userRole}
    >
      <section class="report-detail-page" data-edit-mode="off">
        <header class="report-detail-header">
          <div class="report-detail-titles">
            <p class="report-detail-eyebrow">
              {eyebrowSegments.map((seg, i) => (
                <>
                  {i > 0 ? <span class="report-detail-eyebrow-sep" aria-hidden="true"> · </span> : null}
                  <span>{seg}</span>
                </>
              ))}
            </p>
            <h1 class="report-detail-title">{p.householdName}</h1>
            <p class="report-detail-meeting-date">
              {dateFmt.format(new Date(`${p.meetingDate}T00:00:00`))}
            </p>
          </div>
          <ActionBar p={p} />
          <details class="report-detail-actions-mobile">
            <summary>Actions</summary>
            <div class="report-detail-actions-mobile-list">
              <ActionItems p={p} />
            </div>
          </details>
        </header>

        {/* Edit-mode banner — only visible when data-edit-mode="on" on the
            outer .report-detail-page; CSS owns the show/hide. */}
        <div class="report-edit-banner" role="status" aria-live="polite">
          <em>Editing layout — drop bubbles into any slot. Click "Done editing" when finished.</em>
        </div>

        <ReportCanvas {...p} />
      </section>

      <script src="/js/layout-editor.js" defer></script>
      <script src="/js/canva-fallback.js" defer></script>
    </AppLayout>
  );
};

// =============================================================================
// Action bar — desktop (flex-wrap) + mobile (<details>) variants share items
// =============================================================================
const ActionBar: FC<{ p: ReportDetailProps }> = ({ p }) => (
  <div class="report-detail-actions">
    <ActionItems p={p} withDividers />
  </div>
);

const ActionItems: FC<{ p: ReportDetailProps; withDividers?: boolean }> = ({ p, withDividers }) => {
  const Divider = () => (withDividers ? <span class="report-detail-divider" aria-hidden="true">·</span> : <></>);
  const canvaConfigured = p.canvaEnvConfigured ?? true;
  // Polish 4 — exactly one action gets the bordered "primary" treatment.
  // Prefer Canva when the user has it connected (that's the path Maryann
  // takes); fall back to PDF otherwise.
  const primary: 'canva' | 'pdf' = canvaConfigured && p.canvaConnected ? 'canva' : 'pdf';
  const pdfClass = primary === 'pdf' ? 'action-link-primary' : 'text-link-accent';
  const canvaClass = primary === 'canva' ? 'action-link-primary' : 'text-link-accent';
  return (
    <>
      <form method="post" action={`/clients/${p.clientId}/reports/${p.reportId}/export/pdf`}>
        <button type="submit" class={pdfClass}>Download PDF</button>
      </form>
      <Divider />
      {!canvaConfigured ? (
        <span class="text-link-muted" title="See CLAUDE.md → Canva Developer Portal Setup">
          <em>Canva export disabled — see CLAUDE.md.</em>
        </span>
      ) : p.canvaConnected ? (
        <form
          method="post"
          action={`/clients/${p.clientId}/reports/${p.reportId}/export/canva`}
          hx-post={`/clients/${p.clientId}/reports/${p.reportId}/export/canva`}
          hx-disabled-elt="find button"
          target="_blank"
        >
          <button type="submit" class={canvaClass}>
            {p.canvaDesignId ? 'Re-export to Canva' : 'Export to Canva'}
          </button>
        </form>
      ) : (
        <a class="text-link-muted" href="/settings">Connect Canva to enable export &rarr;</a>
      )}
      {p.canvaEditUrl ? (
        <a class="text-link-muted" href={p.canvaEditUrl} target="_blank" rel="noreferrer">
          View in Canva &rarr;
        </a>
      ) : null}
      <Divider />
      <button
        type="button"
        id="edit-layout-toggle"
        class="text-link-accent edit-layout-toggle"
        aria-pressed="false"
      >
        Edit layout
      </button>
      <Divider />
      {/* Reset is hidden in view mode; only revealed when the page enters
          edit mode (CSS rule on [data-edit-mode="on"] .report-detail-reset). */}
      <button
        type="button"
        class="text-link-muted report-detail-reset"
        hx-delete={`/clients/${p.clientId}/layouts/${p.reportType}?reportId=${p.reportId}`}
        hx-target={`#report-canvas-${p.reportId}`}
        hx-swap="outerHTML"
        hx-confirm="Reset to default layout? Saved positions for this client + report type will be cleared."
      >
        Reset to default layout
      </button>
    </>
  );
};

export const ReportCanvas: FC<ReportDetailProps> = (p) => (
  <div
    id={`report-canvas-${p.reportId}`}
    class="report-canvas"
    data-report-id={p.reportId}
    data-client-id={p.clientId}
    data-report-type={p.reportType}
    data-edit-mode="off"
  >
    {p.pages.map((svg, i) => (
      <div class="report-page" data-page-index={i}>
        {/* Phase 14 atmospheric frame. The skeleton sweep activates via
            body.htmx-request and fades back out on swap. Phase 16 — slot
            indicators now live inside the SVG itself, so no HTML overlay
            is mounted; the floating hint stays for edit-mode affordance. */}
        <div class="report-doc-frame">
          <div class="report-svg-frame">
            {raw(svg)}
            {i === 0 && p.reportType === 'TCC' ? (
              <p class="report-edit-hint" aria-hidden="true">
                <em>Drag any bubble to reposition. Layout saves automatically.</em>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    ))}
  </div>
);
