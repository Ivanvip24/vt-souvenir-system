/**
 * T1 Auto-Sync Content Script
 * Automatically syncs T1 shipments + label PDFs to AXKAN
 * when you visit T1's "Mis envíos" page
 */

(function() {
  const SYNC_API = 'https://vt-souvenir-backend.onrender.com/api/t1/sync';
  const SYNC_KEY = 'axkan-t1-sync-2026';
  const COOLDOWN_MS = 5 * 60 * 1000; // Don't re-sync within 5 minutes

  // Only run on the shipments page
  if (!location.pathname.includes('shippings')) return;

  // Check cooldown
  const lastSync = localStorage.getItem('axkan_t1_last_sync');
  if (lastSync && Date.now() - parseInt(lastSync) < COOLDOWN_MS) return;

  // Wait for table to load
  function waitForTable(attempts) {
    if (attempts <= 0) return;
    const rows = document.querySelectorAll('table tbody tr');
    if (rows.length > 0) {
      runSync(rows);
    } else {
      setTimeout(() => waitForTable(attempts - 1), 1000);
    }
  }

  async function runSync(rows) {
    // Show subtle indicator
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#e72a88;color:white;padding:8px 16px;border-radius:8px;font-family:system-ui;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(231,42,136,0.4);transition:opacity 0.3s';
    badge.textContent = 'AXKAN: Syncing...';
    document.body.appendChild(badge);

    try {
      // Scrape table
      const shipments = [];
      rows.forEach(r => {
        const c = r.querySelectorAll('td');
        if (c.length < 7) return;
        const f = c[1].querySelector('.flex-col');
        const p = f ? f.querySelectorAll('span') : [];
        const client = c[4].textContent.trim().replace(/\s+/g, ' ');
        const status = c[7] ? c[7].textContent.trim() : '';
        if (p[0]) {
          shipments.push({
            tracking: p[0].textContent.trim(),
            carrier: p[1] ? p[1].textContent.trim() : '',
            client: client,
            cost: c[5].textContent.trim(),
            trackingStatus: status
          });
        }
      });

      if (shipments.length === 0) {
        badge.textContent = 'AXKAN: No shipments';
        setTimeout(() => badge.remove(), 2000);
        return;
      }

      badge.textContent = `AXKAN: ${shipments.length} found, fetching PDFs...`;

      // Fetch label PDFs for each shipment
      let pdfCount = 0;
      for (let i = 0; i < shipments.length; i++) {
        try {
          const r = await fetch('/shippings/my-shippings/' + shipments[i].tracking);
          const html = await r.text();
          const m = html.match(/shipping\.cdn\.t1\.com\/labels\/[^"\s]+\.pdf/);
          if (m) {
            shipments[i].labelUrl = 'https://' + m[0];
            pdfCount++;
          }
        } catch (e) {}

        if (i % 5 === 0) {
          badge.textContent = `AXKAN: PDFs ${i + 1}/${shipments.length}...`;
        }
      }

      badge.textContent = 'AXKAN: Uploading...';

      // Sync to AXKAN backend
      const resp = await fetch(SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SYNC_KEY },
        body: JSON.stringify({ shipments })
      });
      const data = await resp.json();

      if (data.success) {
        badge.style.background = '#10b981';
        badge.textContent = `AXKAN: +${data.inserted} new, ${data.updated} updated, ${pdfCount} PDFs`;
        localStorage.setItem('axkan_t1_last_sync', Date.now().toString());
      } else {
        badge.style.background = '#ef4444';
        badge.textContent = 'AXKAN: ' + (data.error || 'Sync failed');
      }
    } catch (e) {
      badge.style.background = '#ef4444';
      badge.textContent = 'AXKAN: Error - ' + e.message;
    }

    setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 300);
    }, 4000);
  }

  // Start after page settles
  setTimeout(() => waitForTable(15), 2000);
})();
