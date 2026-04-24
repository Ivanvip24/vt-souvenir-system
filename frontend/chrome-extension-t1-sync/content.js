/**
 * AXKAN T1 Sync — Content Script
 * Runs on shipping.t1.com/shippings/my-shippings*
 * Scrapes the shipments table and syncs to AXKAN backend automatically.
 */

(function () {
  'use strict';

  var API_URL = 'https://vt-souvenir-backend.onrender.com/api/t1/sync';
  var SYNC_KEY = 'axkan-t1-sync-2026';
  var DEBOUNCE_MS = 30000; // Don't re-sync within 30 seconds

  // ── Badge UI ──────────────────────────────────────────────

  function showBadge(text, isError) {
    var existing = document.getElementById('axkan-sync-badge');
    if (existing) existing.remove();

    var badge = document.createElement('div');
    badge.id = 'axkan-sync-badge';
    badge.textContent = text;
    badge.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:99999',
      'padding:10px 18px',
      'border-radius:8px',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'font-size:13px',
      'font-weight:600',
      'color:white',
      'background:' + (isError ? '#ef4444' : '#22c55e'),
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'transition:opacity 0.3s ease',
      'opacity:1'
    ].join(';');

    document.body.appendChild(badge);

    setTimeout(function () {
      badge.style.opacity = '0';
      setTimeout(function () { badge.remove(); }, 300);
    }, 3000);
  }

  // ── Scrape Table ──────────────────────────────────────────

  function scrapeShipments() {
    var rows = document.querySelectorAll('table tbody tr');
    var shipments = [];

    rows.forEach(function (row) {
      var cells = row.querySelectorAll('td');
      if (cells.length < 7) return;

      var flexCol = cells[1].querySelector('.flex-col');
      var spans = flexCol ? flexCol.querySelectorAll('span') : [];
      if (!spans[0]) return;

      var tracking = spans[0].textContent.trim();
      var carrier = spans[1] ? spans[1].textContent.trim() : '';
      var client = cells[4].textContent.trim().replace(/\s+/g, ' ');
      var cost = cells[5].textContent.trim();
      var trackingStatus = cells[7] ? cells[7].textContent.trim() : '';

      if (tracking) {
        shipments.push({
          tracking: tracking,
          carrier: carrier,
          client: client,
          cost: cost,
          trackingStatus: trackingStatus
        });
      }
    });

    return shipments;
  }

  // ── Sync Logic ────────────────────────────────────────────

  function doSync() {
    // Debounce check
    var lastSync = sessionStorage.getItem('axkan_t1_last_sync');
    if (lastSync && Date.now() - parseInt(lastSync) < DEBOUNCE_MS) {
      return;
    }

    var shipments = scrapeShipments();
    if (shipments.length === 0) return;

    sessionStorage.setItem('axkan_t1_last_sync', String(Date.now()));

    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': SYNC_KEY
      },
      body: JSON.stringify({ shipments: shipments })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          var msg = 'AXKAN Sync: ' + data.inserted + ' nuevos, ' + data.updated + ' actualizados';
          showBadge(msg, false);
          console.log('[AXKAN T1 Sync]', msg);
        } else {
          showBadge('AXKAN Sync error', true);
          console.error('[AXKAN T1 Sync] Error:', data);
        }
      })
      .catch(function (err) {
        showBadge('AXKAN Sync failed', true);
        console.error('[AXKAN T1 Sync] Network error:', err);
      });
  }

  // ── Wait for Table & Auto-Sync ────────────────────────────

  function waitForTableAndSync() {
    var rows = document.querySelectorAll('table tbody tr');
    if (rows.length > 0) {
      doSync();
      return;
    }

    // Table not ready yet — observe DOM for changes
    var observer = new MutationObserver(function () {
      var rows = document.querySelectorAll('table tbody tr');
      if (rows.length > 0) {
        observer.disconnect();
        // Small delay to let all rows render
        setTimeout(doSync, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Safety timeout — stop observing after 15 seconds
    setTimeout(function () { observer.disconnect(); }, 15000);
  }

  // ── Init ──────────────────────────────────────────────────

  console.log('[AXKAN T1 Sync] Extension loaded on T1 Mis Envios page');
  waitForTableAndSync();

  // Also re-sync when the page becomes visible (user switches back to this tab)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      waitForTableAndSync();
    }
  });
})();
