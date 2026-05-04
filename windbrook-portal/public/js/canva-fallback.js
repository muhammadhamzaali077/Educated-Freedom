/**
 * Canva export fallback — when the server returns non-2xx for /export/canva,
 * surface the error inline near the button, auto-trigger the PDF download,
 * and open canva.com's "create blank design" page in a new tab. PRD §User
 * Story 4 explicitly permits this fallback path:
 *   "If Canva API feasibility is soft, the engineer can ship the PDF path
 *    first and wire Canva export as a follow-up without blocking V1."
 */
(function () {
  'use strict';

  function showError(form, message) {
    var slot = form.parentElement.querySelector('.canva-fallback-error');
    if (!slot) {
      slot = document.createElement('p');
      slot.className = 'canva-fallback-error';
      slot.setAttribute('role', 'alert');
      form.parentElement.appendChild(slot);
    }
    slot.textContent = message;
  }

  function triggerPdfDownload(canvaForm) {
    // Find the sibling PDF form by matching the report id in the action URL.
    var match = (canvaForm.getAttribute('action') || '').match(/\/clients\/[a-f0-9-]+\/reports\/[a-f0-9-]+\/export\/canva$/);
    if (!match) return;
    var pdfAction = canvaForm.getAttribute('action').replace(/\/canva$/, '/pdf');
    // Submit a transient form to trigger the browser download.
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = pdfAction;
    f.style.display = 'none';
    document.body.appendChild(f);
    f.submit();
    setTimeout(function () { f.remove(); }, 1500);
  }

  function openCanvaBlank() {
    window.open('https://www.canva.com/design/?create_canvas', '_blank', 'noopener,noreferrer');
  }

  function isCanvaExportUrl(path) {
    return /\/export\/canva$/.test(path || '');
  }

  document.body.addEventListener('htmx:responseError', function (evt) {
    var cfg = evt.detail && evt.detail.requestConfig;
    if (!cfg || !isCanvaExportUrl(cfg.path)) return;

    var status = evt.detail.xhr && evt.detail.xhr.status;
    var bodyText = (evt.detail.xhr && evt.detail.xhr.responseText) || '';

    // 401 = not connected (CanvaConnectionError) — direct user to /settings.
    if (status === 401) {
      var form = cfg.elt && cfg.elt.closest ? cfg.elt.closest('form[action*="/export/canva"]') : null;
      if (form) {
        showError(form,
          (bodyText || 'Canva connection expired.') +
          ' Reconnect at /settings.');
      }
      return;
    }

    // 5xx or 502 = upload/design step failed → fall back gracefully.
    var canvaForm = cfg.elt && cfg.elt.closest ? cfg.elt.closest('form[action*="/export/canva"]') : null;
    if (!canvaForm) return;

    showError(canvaForm,
      'Canva export unavailable on this account. Downloading the PDF — import to Canva manually in the new tab.');

    triggerPdfDownload(canvaForm);
    openCanvaBlank();
  });

  // Friendly extra signal — Canva might respond 200 with HX-Redirect (success).
  // Nothing to do there; this listener only fires on errors.
})();
