console.log('[layout-editor] Script loaded at', new Date().toISOString());

/**
 * Layout editor — native SVG pointer-event drag.
 *
 * Phase 20 fix: removed the silent snap-back when nearest slot equals origin.
 * The previous "always snap to nearest slot" logic combined with the
 * `newSlotId === originSlotId` early return meant any small drag returned
 * the bubble silently — visible to the user as "drag does nothing".
 *
 * New behavior: nearest slot becomes the drop target only when the drag has
 * actually moved enough that a DIFFERENT slot is nearer than the origin slot.
 * If the user releases without moving meaningfully, snap back is correct.
 * If they move toward another slot, that slot wins even if origin is still
 * "nearest" — we use a distance threshold relative to the bubble's own size.
 */
(function () {
  'use strict';

  // The bubble is 140×110, so half-width = 70. If the user moved the bubble
  // center by MORE than 50 px in any direction, they meant to move it.
  // Combined with the section filter and the "nearest" search, that's enough
  // to disambiguate intent.
  var MIN_MOVE_PX = 50;

  /** @type {{ element: SVGGElement, svg: SVGSVGElement, sectionType: string,
   *           startX: number, startY: number, originCX: number, originCY: number,
   *           currentX: number, currentY: number, originSlotId: string,
   *           reportId: string, clientId: string, accountId: string,
   *           pointerId: number } | null} */
  var dragging = null;
  var editMode = false;

  function svgPoint(svg, evt) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return pt;
    return pt.matrixTransform(ctm.inverse());
  }

  function findNearestSlot(svg, x, y, sectionType) {
    var slots = svg.querySelectorAll('.slot[data-section="' + sectionType + '"]');
    console.log('[layout-editor] findNearestSlot: section="' + sectionType + '", found ' + slots.length + ' slots');
    if (slots.length === 0) {
      var allSlots = svg.querySelectorAll('.slot');
      console.warn('[layout-editor]   ⚠ no slots match section "' + sectionType + '". Total .slot in SVG: ' + allSlots.length);
      allSlots.forEach(function (s, i) {
        console.warn('[layout-editor]   slot ' + i + ': data-section="' + s.getAttribute('data-section') + '" data-slot-id="' + s.getAttribute('data-slot-id') + '"');
      });
      return null;
    }
    var nearest = null;
    var minDist = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var sx = parseFloat(slot.getAttribute('data-cx'));
      var sy = parseFloat(slot.getAttribute('data-cy'));
      var dx = x - sx;
      var dy = y - sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = slot;
      }
    }
    if (nearest) {
      console.log('[layout-editor]   → nearest slot: data-slot-id="' + nearest.getAttribute('data-slot-id') + '" at distance ' + Math.round(minDist) + 'px');
    }
    return nearest;
  }

  function getReportSvg() {
    return document.querySelector('.report-canvas .report-svg-frame > svg');
  }

  function enableEditMode() {
    console.log('[layout-editor] enableEditMode called');
    editMode = true;
    var svg = getReportSvg();
    if (!svg) {
      console.warn('[layout-editor] enableEditMode: no report SVG found');
      return;
    }
    svg.classList.add('edit-mode');
    var bubbles = svg.querySelectorAll('g.bubble');
    console.log('[layout-editor] Edit mode ON, bubbles bound:', bubbles.length);
    bubbles.forEach(function (b) {
      b.style.cursor = 'grab';
      b.addEventListener('pointerdown', onPointerDown);
    });
  }

  function disableEditMode() {
    editMode = false;
    var svg = getReportSvg();
    if (!svg) return;
    svg.classList.remove('edit-mode', 'drag-active');
    svg.removeAttribute('data-drag-side');
    svg.querySelectorAll('.slot.near').forEach(function (s) { s.classList.remove('near'); });
    var bubbles = svg.querySelectorAll('g.bubble');
    bubbles.forEach(function (b) {
      b.style.cursor = '';
      b.removeEventListener('pointerdown', onPointerDown);
    });
  }

  function onPointerDown(evt) {
    console.log('[layout-editor] pointer down on bubble', evt.currentTarget.getAttribute('data-account-id'), 'pointerType:', evt.pointerType, 'button:', evt.button);
    if (!editMode) {
      console.log('[layout-editor] onPointerDown: editMode is OFF, ignoring');
      return;
    }
    if (evt.button !== undefined && evt.button !== 0) return;
    var bubble = evt.currentTarget;
    var svg = bubble.ownerSVGElement;
    if (!svg) {
      console.warn('[layout-editor] onPointerDown: bubble has no ownerSVGElement');
      return;
    }
    var canvas = svg.closest('.report-canvas');
    if (!canvas) {
      console.warn('[layout-editor] onPointerDown: SVG not inside .report-canvas');
      return;
    }

    evt.preventDefault();

    var pt = svgPoint(svg, evt);
    var cx = parseFloat(bubble.getAttribute('data-cx'));
    var cy = parseFloat(bubble.getAttribute('data-cy'));

    dragging = {
      element: bubble,
      svg: svg,
      sectionType: bubble.getAttribute('data-section') || '',
      startX: pt.x,
      startY: pt.y,
      originCX: cx,
      originCY: cy,
      currentX: cx,
      currentY: cy,
      originSlotId: bubble.getAttribute('data-slot-id') || '',
      accountId: bubble.getAttribute('data-account-id') || '',
      reportId: canvas.getAttribute('data-report-id') || '',
      clientId: canvas.getAttribute('data-client-id') || '',
      pointerId: evt.pointerId,
    };

    bubble.style.cursor = 'grabbing';
    svg.classList.add('drag-active');
    svg.dataset.dragSide = dragging.sectionType;
    canvas.classList.add('drag-active');
    canvas.dataset.dragSide = dragging.sectionType;

    try { bubble.setPointerCapture(evt.pointerId); } catch (_) {}
    bubble.addEventListener('pointermove', onPointerMove);
    bubble.addEventListener('pointerup', onPointerUp);
    bubble.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function onPointerMove(evt) {
    if (!dragging) return;
    var pt = svgPoint(dragging.svg, evt);
    var dx = pt.x - dragging.startX;
    var dy = pt.y - dragging.startY;
    dragging.currentX = dragging.originCX + dx;
    dragging.currentY = dragging.originCY + dy;

    dragging.element.setAttribute('transform', 'translate(' + dx + ',' + dy + ')');

    var slot = findNearestSlot(dragging.svg, dragging.currentX, dragging.currentY, dragging.sectionType);
    var prev = dragging.svg.querySelectorAll('.slot.near');
    prev.forEach(function (s) { if (s !== slot) s.classList.remove('near'); });
    if (slot) slot.classList.add('near');
  }

  function onPointerUp() {
    if (!dragging) return;
    var d = dragging;

    // ── PHASE 20 FIX ──────────────────────────────────────────────────────
    // Distance moved (in SVG userspace) determines whether this was a real drag
    // or a click. Below MIN_MOVE_PX, snap back without persisting.
    var totalMoveX = d.currentX - d.originCX;
    var totalMoveY = d.currentY - d.originCY;
    var totalMove = Math.sqrt(totalMoveX * totalMoveX + totalMoveY * totalMoveY);
    console.log('[layout-editor] pointer up. Total move:', Math.round(totalMove) + 'px (threshold ' + MIN_MOVE_PX + 'px)');
    // ─────────────────────────────────────────────────────────────────────

    var slot = findNearestSlot(dragging.svg, dragging.currentX, dragging.currentY, dragging.sectionType);
    cleanupDrag();

    if (totalMove < MIN_MOVE_PX) {
      console.log('[layout-editor] move below threshold — treating as click, snapping back');
      d.element.setAttribute('transform', '');
      return;
    }

    if (!slot) {
      console.log('[layout-editor] no slot found — snapping back');
      d.element.setAttribute('transform', '');
      return;
    }

    var newSlotId = slot.getAttribute('data-slot-id');
    if (!newSlotId) {
      console.warn('[layout-editor] slot has no data-slot-id — snapping back');
      d.element.setAttribute('transform', '');
      return;
    }

    if (newSlotId === d.originSlotId) {
      // The user moved the bubble far enough to count as a drag, but the
      // nearest slot is still its origin (e.g. they dragged it 60px and let
      // go before reaching another slot). Snap back without persisting —
      // this matches user intent (they didn't reach a target) and avoids
      // a no-op POST.
      console.log('[layout-editor] nearest slot is origin (' + newSlotId + ') — snapping back');
      d.element.setAttribute('transform', '');
      return;
    }

    var url = '/clients/' + encodeURIComponent(d.clientId) +
              '/reports/' + encodeURIComponent(d.reportId) +
              '/layout';
    console.log('[layout-editor] POST', url, '{ accountId:', d.accountId, ', slotId:', newSlotId, '}');

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ accountId: d.accountId, slotId: newSlotId }),
    })
      .then(function (resp) {
        console.log('[layout-editor] POST response status:', resp.status);
        if (!resp.ok) {
          return resp.text().then(function (text) {
            console.warn('[layout-editor] POST failed:', text);
            d.element.setAttribute('transform', '');
            alert('Could not save layout: ' + (text || resp.status) + '\n\nThe page will reload to restore the original layout.');
            window.location.reload();
          });
        }
        console.log('[layout-editor] persist OK, reloading');
        window.location.reload();
      })
      .catch(function (err) {
        console.error('[layout-editor] POST error:', err);
        d.element.setAttribute('transform', '');
        alert('Network error saving layout. Check console.');
      });
  }

  function onPointerCancel() {
    if (!dragging) return;
    dragging.element.setAttribute('transform', '');
    cleanupDrag();
  }

  function onKeyDown(evt) {
    if (evt.key !== 'Escape' && evt.key !== 'Esc') return;
    if (!dragging) return;
    evt.preventDefault();
    evt.stopPropagation();
    dragging.element.setAttribute('transform', '');
    cleanupDrag();
  }

  function cleanupDrag() {
    if (!dragging) return;
    var d = dragging;
    dragging = null;
    try { d.element.releasePointerCapture(d.pointerId); } catch (_) {}
    d.element.style.cursor = 'grab';
    d.svg.classList.remove('drag-active');
    d.svg.removeAttribute('data-drag-side');
    d.svg.querySelectorAll('.slot.near').forEach(function (s) { s.classList.remove('near'); });
    var canvasEl = d.svg.closest('.report-canvas');
    if (canvasEl) {
      canvasEl.classList.remove('drag-active');
      canvasEl.removeAttribute('data-drag-side');
    }
    d.element.removeEventListener('pointermove', onPointerMove);
    d.element.removeEventListener('pointerup', onPointerUp);
    d.element.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function bindToggle() {
    var toggle = document.getElementById('edit-layout-toggle');
    var svg = getReportSvg();
    var bubbles = svg ? svg.querySelectorAll('g.bubble') : [];
    // PHASE 20 FIX: was 'circle.slot' — slots are <ellipse>, not <circle>.
    // The diagnostic dump was always showing 0 slots because of this.
    var slots = svg ? svg.querySelectorAll('ellipse.slot, circle.slot') : [];
    console.log('[layout-editor] bindToggle called');
    console.log('[layout-editor]   toggle button found:', !!toggle, toggle ? 'id=' + toggle.id : '');
    console.log('[layout-editor]   report SVG found:', !!svg);
    console.log('[layout-editor]   bubbles in SVG:', bubbles.length);
    console.log('[layout-editor]   slots in SVG (ellipse|circle):', slots.length);
    if (bubbles.length > 0) {
      var b = bubbles[0];
      console.log('[layout-editor]   first bubble attrs:', {
        'data-account-id': b.getAttribute('data-account-id'),
        'data-slot-id': b.getAttribute('data-slot-id'),
        'data-section': b.getAttribute('data-section'),
        'data-cx': b.getAttribute('data-cx'),
        'data-cy': b.getAttribute('data-cy'),
      });
    } else if (svg) {
      console.warn('[layout-editor]   no g.bubble elements — saved layout may reference deprecated slot IDs');
    }
    if (slots.length > 0) {
      console.log('[layout-editor]   first slot attrs:', {
        'data-slot-id': slots[0].getAttribute('data-slot-id'),
        'data-section': slots[0].getAttribute('data-section'),
        'tagName': slots[0].tagName,
      });
    }
    if (!toggle) {
      console.error('[layout-editor] No toggle button found — looking for #edit-layout-toggle');
      return;
    }
    if (toggle.dataset.bound === '1') {
      console.log('[layout-editor] toggle already bound — skipping');
      return;
    }
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', function () {
      var page = document.querySelector('.report-detail-page');
      if (editMode) {
        disableEditMode();
        toggle.textContent = 'Edit layout';
        toggle.classList.remove('is-active');
        toggle.setAttribute('aria-pressed', 'false');
        if (page) page.dataset.editMode = 'off';
      } else {
        enableEditMode();
        toggle.textContent = 'Done editing';
        toggle.classList.add('is-active');
        toggle.setAttribute('aria-pressed', 'true');
        if (page) page.dataset.editMode = 'on';
      }
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(bindToggle);
  document.body.addEventListener('htmx:afterSwap', bindToggle);
})();

// View-mode bubble hover popover (Phase 14 Polish 3, kept as-is).
(function () {
  'use strict';

  function init() {
    var canvas = document.querySelector('.report-canvas');
    if (!canvas) return;
    if (canvas.dataset.popoverBound === '1') return;
    canvas.dataset.popoverBound = '1';

    var popover = document.querySelector('.bubble-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.className = 'bubble-popover';
      popover.setAttribute('role', 'tooltip');
      popover.setAttribute('aria-hidden', 'true');
      document.body.appendChild(popover);
    }

    var hoverTimer = null;
    var currentBubble = null;

    function show(bubble) {
      var rect = bubble.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var top = rect.top;
      var type = bubble.dataset.accountType || '';
      var inst = bubble.dataset.institution || '';
      var last4 = bubble.dataset.acctLast4 || '';
      var asof = bubble.dataset.asof || '';
      var instLine = inst + (last4 ? ' · ••' + last4 : '');
      popover.innerHTML =
        '<div class="bubble-popover-type">' + escapeHtml(type) + '</div>' +
        (instLine ? '<div class="bubble-popover-meta">' + escapeHtml(instLine) + '</div>' : '') +
        (asof ? '<div class="bubble-popover-asof">a/o ' + escapeHtml(asof) + '</div>' : '');
      popover.style.left = cx + 'px';
      popover.style.top = (top - 12) + 'px';
      popover.classList.add('visible');
      popover.setAttribute('aria-hidden', 'false');
    }
    function hide() {
      popover.classList.remove('visible');
      popover.setAttribute('aria-hidden', 'true');
    }

    canvas.addEventListener('mouseover', function (e) {
      var svg = canvas.querySelector('.report-svg-frame > svg');
      if (svg && svg.classList.contains('edit-mode')) return;
      var g = e.target.closest('g.bubble');
      if (!g || g === currentBubble) return;
      currentBubble = g;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function () { show(g); }, 400);
    });
    canvas.addEventListener('mouseout', function (e) {
      var g = e.target.closest('g.bubble');
      if (!g) return;
      if (e.relatedTarget && g.contains(e.relatedTarget)) return;
      currentBubble = null;
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      hide();
    });
  }

  var ENT = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) { return String(s).replace(/[<>&"']/g, function (c) { return ENT[c]; }); }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  document.body.addEventListener('htmx:afterSwap', init);
})();
