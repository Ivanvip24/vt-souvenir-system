# Guías Label Printing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add checkboxes, date quick-filters, and a silent print-to-printer button to the existing Guías view so Ivan can select labels and print their PDFs directly to the SHARP MX-6580N without any browser dialog.

**Architecture:** Enhance existing Guías frontend with selection state (checkboxes + select-all), date filter buttons (Hoy/Ayer/Esta semana/Período), and a print toolbar. Backend gets two new routes: `GET /shipping/printers` (lists available printers via `lpstat`) and `POST /shipping/labels/print` (downloads PDFs from Skydropx URLs and sends them to the printer via `lp` command).

**Tech Stack:** Vanilla JS (matching existing guias.js style), Express routes, Node.js `child_process.execFile` for `lp`/`lpstat` (safe, no shell injection), `fetch` for downloading PDFs to temp files.

---

### Task 1: Backend — Printers Endpoint

**Files:**
- Modify: `backend/api/shipping-routes.js` (add route at end, before `export`)

**Step 1: Add GET /shipping/printers route**

Add this route to shipping-routes.js:

```javascript
/**
 * GET /shipping/printers
 * Lists available system printers
 */
router.get('/printers', async (req, res) => {
  try {
    const { execFileSync } = await import('child_process');
    const output = execFileSync('lpstat', ['-p'], { encoding: 'utf8', timeout: 5000 });
    let defaultPrinter = null;
    try {
      const defaultOutput = execFileSync('lpstat', ['-d'], { encoding: 'utf8', timeout: 5000 });
      const defaultMatch = defaultOutput.match(/destination:\s*(.+)/);
      defaultPrinter = defaultMatch ? defaultMatch[1].trim() : null;
    } catch (_) {}

    const printers = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^printer\s+(\S+)\s+is\s+(.+)/);
      if (match) {
        printers.push({
          name: match[1],
          status: match[2].trim(),
          isDefault: match[1] === defaultPrinter
        });
      }
    }

    res.json({ success: true, printers, defaultPrinter });
  } catch (error) {
    res.json({ success: true, printers: [], defaultPrinter: null, error: 'No printers found' });
  }
});
```

**Step 2: Test it**

Run: `curl http://localhost:3000/api/shipping/printers`
Expected: JSON with SHARP_MX_6580N printer listed.

**Step 3: Commit**

```bash
git add backend/api/shipping-routes.js
git commit -m "feat: add GET /shipping/printers endpoint"
```

---

### Task 2: Backend — Print Labels Endpoint

**Files:**
- Modify: `backend/api/shipping-routes.js` (add imports at top, add route)

**Step 1: Add imports at top of file**

```javascript
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
```

**Step 2: Add POST /shipping/labels/print route**

```javascript
/**
 * POST /shipping/labels/print
 * Downloads label PDFs and sends them to the system printer
 * Body: { labelIds: [1, 2, 3], printer?: "PRINTER_NAME" }
 */
router.post('/labels/print', async (req, res) => {
  try {
    const { labelIds, printer } = req.body;

    if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ success: false, error: 'labelIds array required' });
    }

    if (labelIds.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 labels per print job' });
    }

    // Validate labelIds are numbers
    if (!labelIds.every(id => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ success: false, error: 'Invalid label IDs' });
    }

    // Fetch label URLs from DB
    const placeholders = labelIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `SELECT id, label_url, tracking_number FROM shipping_labels WHERE id IN (${placeholders}) AND label_url IS NOT NULL`,
      labelIds
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No printable labels found' });
    }

    const { execFileSync } = await import('child_process');
    const tmpDir = mkdtempSync(join(tmpdir(), 'axkan-labels-'));
    let printed = 0;
    let failed = 0;
    const errors = [];

    for (const label of result.rows) {
      try {
        // Download PDF
        const response = await fetch(label.label_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Save to temp file
        const filePath = join(tmpDir, `label-${label.id}.pdf`);
        writeFileSync(filePath, buffer);

        // Send to printer using execFileSync (safe, no shell injection)
        const args = [];
        if (printer) { args.push('-d', printer); }
        args.push(filePath);
        execFileSync('lp', args, { timeout: 10000 });

        printed++;

        // Cleanup temp file
        try { unlinkSync(filePath); } catch (_) {}
      } catch (err) {
        failed++;
        errors.push({ id: label.id, tracking: label.tracking_number, error: err.message });
      }
    }

    // Cleanup temp dir
    try {
      const { rmdirSync } = await import('fs');
      rmdirSync(tmpDir);
    } catch (_) {}

    res.json({ success: true, printed, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Step 3: Test with a real label**

```bash
# Find a label with a URL
curl "http://localhost:3000/api/shipping/labels?limit=1&status=label_generated" | jq '.labels[0] | {id, label_url}'

# Print it (replace ID)
curl -X POST http://localhost:3000/api/shipping/labels/print \
  -H "Content-Type: application/json" \
  -d '{"labelIds": [LABEL_ID_HERE]}'
```

Expected: `{"success":true,"printed":1,"failed":0}` and paper comes out of the SHARP printer.

**Step 4: Commit**

```bash
git add backend/api/shipping-routes.js
git commit -m "feat: add POST /shipping/labels/print — silent print to system printer"
```

---

### Task 3: Frontend — Add Selection State & Checkboxes to Cards

**Files:**
- Modify: `frontend/admin-dashboard/guias.js`

**Step 1: Add selection state variable**

After existing state vars (line ~13), add:

```javascript
let guiasSelectedForPrint = new Set();
```

**Step 2: Add checkbox to createGuiaCard()**

Inside `createGuiaCard(guia)`, at the start of the function after the card element is created and before row1, add checkbox if label has PDF:

```javascript
if (guia.label_url) {
  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'guia-card__checkbox';
  checkbox.checked = guiasSelectedForPrint.has(guia.id);
  checkbox.onclick = function(e) {
    e.stopPropagation();
    if (this.checked) {
      guiasSelectedForPrint.add(guia.id);
    } else {
      guiasSelectedForPrint.delete(guia.id);
    }
    updatePrintToolbar();
  };
  card.appendChild(checkbox);
  card.classList.add('guia-card--selectable');
}
```

**Step 3: Add helper functions**

```javascript
function toggleSelectAllGuias() {
  var printable = guiasData.filter(function(g) { return g.label_url; });
  var allSelected = printable.length > 0 && printable.every(function(g) { return guiasSelectedForPrint.has(g.id); });

  if (allSelected) {
    guiasSelectedForPrint.clear();
  } else {
    printable.forEach(function(g) { guiasSelectedForPrint.add(g.id); });
  }

  renderGuiasList();
  updatePrintToolbar();
}

function updatePrintToolbar() {
  var count = guiasSelectedForPrint.size;
  var counterEl = document.getElementById('guias-print-count');
  var printBtn = document.getElementById('guias-print-btn');
  var selectAllCb = document.getElementById('guias-select-all');

  if (counterEl) counterEl.textContent = count > 0 ? count + ' seleccionada' + (count > 1 ? 's' : '') : '';
  if (printBtn) printBtn.disabled = count === 0;

  if (selectAllCb) {
    var printable = guiasData.filter(function(g) { return g.label_url; });
    selectAllCb.checked = printable.length > 0 && printable.every(function(g) { return guiasSelectedForPrint.has(g.id); });
    selectAllCb.indeterminate = count > 0 && !selectAllCb.checked;
  }
}
```

**Step 4: Add CSS for checkbox to dynamic stylesheet**

```css
.guia-card--selectable { padding-left: 40px; position: relative; }
.guia-card__checkbox {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 18px; cursor: pointer; accent-color: #e72a88;
}
```

**Step 5: Export new functions**

```javascript
window.toggleSelectAllGuias = toggleSelectAllGuias;
window.updatePrintToolbar = updatePrintToolbar;
```

**Step 6: Commit**

```bash
git add frontend/admin-dashboard/guias.js
git commit -m "feat: add checkboxes and selection state to guía cards"
```

---

### Task 4: Frontend — Date Quick-Filters

**Files:**
- Modify: `frontend/admin-dashboard/guias.js`
- Modify: `frontend/admin-dashboard/index.html`

**Step 1: Add date filter state**

```javascript
let guiasDateFilter = null;
```

**Step 2: Add date filter functions**

```javascript
function setGuiasDateFilter(preset) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var start, end;

  if (preset === 'today') {
    start = end = today.toISOString().split('T')[0];
  } else if (preset === 'yesterday') {
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    start = end = yesterday.toISOString().split('T')[0];
  } else if (preset === 'week') {
    var weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    start = weekAgo.toISOString().split('T')[0];
    end = today.toISOString().split('T')[0];
  } else if (preset === 'clear') {
    guiasDateFilter = null;
    updateDateFilterChips(null);
    guiasSelectedForPrint.clear();
    loadGuias(1);
    updatePrintToolbar();
    return;
  }

  guiasDateFilter = { startDate: start, endDate: end };
  updateDateFilterChips(preset);
  guiasSelectedForPrint.clear();
  loadGuias(1);
  updatePrintToolbar();
}

function setGuiasCustomDateRange() {
  var startEl = document.getElementById('guias-date-start');
  var endEl = document.getElementById('guias-date-end');
  if (!startEl || !endEl || !startEl.value || !endEl.value) return;

  guiasDateFilter = { startDate: startEl.value, endDate: endEl.value };
  updateDateFilterChips('custom');
  guiasSelectedForPrint.clear();
  loadGuias(1);
  updatePrintToolbar();
}

function updateDateFilterChips(active) {
  document.querySelectorAll('.guias-date-chip').forEach(function(btn) {
    btn.classList.toggle('guias-date-chip--active', btn.dataset.date === active);
  });
  var rangeEl = document.getElementById('guias-date-range');
  if (rangeEl) rangeEl.classList.toggle('hidden', active !== 'custom');
}

window.setGuiasDateFilter = setGuiasDateFilter;
window.setGuiasCustomDateRange = setGuiasCustomDateRange;
window.updateDateFilterChips = updateDateFilterChips;
```

**Step 3: Update loadGuias() to include date params**

In the `loadGuias` function, after the search param line (`if (guiasSearchQuery) params.append(...)`), add:

```javascript
if (guiasDateFilter) {
  params.append('startDate', guiasDateFilter.startDate);
  params.append('endDate', guiasDateFilter.endDate);
}
```

**Step 4: Add date filter HTML to index.html**

Inside the `.guias-topbar` div, after `.guias-filters` div and before `.guias-topbar-actions`, add:

```html
<div class="guias-date-filters">
    <button class="guias-date-chip" data-date="today" onclick="setGuiasDateFilter('today')">Hoy</button>
    <button class="guias-date-chip" data-date="yesterday" onclick="setGuiasDateFilter('yesterday')">Ayer</button>
    <button class="guias-date-chip" data-date="week" onclick="setGuiasDateFilter('week')">Semana</button>
    <button class="guias-date-chip" data-date="custom" onclick="updateDateFilterChips('custom'); document.getElementById('guias-date-range').classList.remove('hidden');">Período</button>
    <button class="guias-date-chip guias-date-chip--clear" data-date="clear" onclick="setGuiasDateFilter('clear')">✕</button>
    <div id="guias-date-range" class="guias-date-range hidden">
        <input type="date" id="guias-date-start">
        <span>→</span>
        <input type="date" id="guias-date-end">
        <button class="guias-date-apply" onclick="setGuiasCustomDateRange()">Aplicar</button>
    </div>
</div>
```

**Step 5: Add CSS for date filters (in the dynamic stylesheet in guias.js)**

```css
.guias-date-filters { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.guias-date-chip {
  padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--gray-200); background: white; color: var(--gray-600);
  cursor: pointer; transition: all 0.15s;
}
.guias-date-chip:hover { border-color: var(--gray-400); }
.guias-date-chip--active { background: #e72a88; color: white; border-color: #e72a88; }
.guias-date-chip--clear { border: none; background: none; color: var(--gray-400); font-size: 14px; padding: 4px 6px; }
.guias-date-range { display: flex; align-items: center; gap: 6px; margin-left: 4px; }
.guias-date-range input { padding: 3px 6px; border: 1px solid var(--gray-200); border-radius: 6px; font-size: 12px; }
.guias-date-apply {
  padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: #e72a88; color: white; border: none; cursor: pointer;
}
```

**Step 6: Commit**

```bash
git add frontend/admin-dashboard/guias.js frontend/admin-dashboard/index.html
git commit -m "feat: add date quick-filters (Hoy/Ayer/Semana/Período) to Guías"
```

---

### Task 5: Frontend — Print Toolbar & Print Action

**Files:**
- Modify: `frontend/admin-dashboard/index.html`
- Modify: `frontend/admin-dashboard/guias.js`

**Step 1: Add print toolbar HTML**

Inside `#guias-view`, right before the `.guias-layout` div, add:

```html
<div class="guias-print-toolbar" id="guias-print-toolbar">
    <label class="guias-select-all-label">
        <input type="checkbox" id="guias-select-all" onchange="toggleSelectAllGuias()">
        <span>Todas</span>
    </label>
    <span class="guias-print-count" id="guias-print-count"></span>
    <button class="guias-print-btn" id="guias-print-btn" disabled onclick="printSelectedGuias()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir
    </button>
</div>
```

**Step 2: Add printSelectedGuias() function in guias.js**

```javascript
async function printSelectedGuias() {
  var ids = Array.from(guiasSelectedForPrint);
  if (ids.length === 0) return;

  var btn = document.getElementById('guias-print-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Imprimiendo...'; }

  try {
    var response = await guiasFetch(GUIAS_API_URL + '/labels/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelIds: ids })
    });
    var result = await response.json();

    if (!result.success) throw new Error(result.error || 'Error');

    var msg = result.printed + ' guía' + (result.printed > 1 ? 's' : '') + ' enviada' + (result.printed > 1 ? 's' : '') + ' a imprimir';
    if (result.failed > 0) msg += ' (' + result.failed + ' fallida' + (result.failed > 1 ? 's' : '') + ')';
    guiasToast(msg, result.failed > 0 ? 'error' : 'success');

    guiasSelectedForPrint.clear();
    renderGuiasList();
    updatePrintToolbar();
  } catch (error) {
    guiasToast('Error al imprimir: ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Imprimir';
    }
  }
}

window.printSelectedGuias = printSelectedGuias;
```

**Step 3: Add CSS for print toolbar (in dynamic stylesheet)**

```css
.guias-print-toolbar {
  display: flex; align-items: center; gap: 12px; padding: 8px 16px;
  background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 8px;
  margin-bottom: 8px;
}
.guias-select-all-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--gray-600); cursor: pointer; }
.guias-select-all-label input { width: 18px; height: 18px; accent-color: #e72a88; cursor: pointer; }
.guias-print-count { font-size: 13px; color: var(--gray-500); flex: 1; }
.guias-print-btn {
  display: flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 700; border: none; cursor: pointer;
  background: #e72a88; color: white; transition: all 0.15s;
}
.guias-print-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.guias-print-btn:not(:disabled):hover { background: #c4216f; }
```

**Step 4: Commit**

```bash
git add frontend/admin-dashboard/guias.js frontend/admin-dashboard/index.html
git commit -m "feat: add print toolbar with select-all and Imprimir button"
```

---

### Task 6: Test End-to-End

**Step 1:** Start the server with `npm run dev`

**Step 2:** Open admin dashboard, navigate to Guías

**Step 3: Test date filters**
- Click "Hoy" → only today's labels show
- Click "Ayer" → only yesterday's labels show
- Click "Período" → pick date range → click "Aplicar"
- Click "✕" → clears date filter

**Step 4: Test selection**
- Check individual label checkboxes → counter updates
- Click "Todas" checkbox → selects all with PDFs
- Click "Todas" again → deselects all

**Step 5: Test printing**
- Select 1-2 labels with PDFs
- Click "Imprimir"
- Verify toast shows "X guías enviadas a imprimir"
- Verify PDF comes out of the SHARP MX-6580N
