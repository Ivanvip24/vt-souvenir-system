# Employees Production Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Empleados" subtab under Dashboard in the admin panel showing production stats — total pieces per week, per-worker output, designer stats, payroll summary, and a daily input form for production workers.

**Architecture:** New `production_daily_logs` table mirrors `designer_daily_logs` but for production workers (Alicia, Luz, Bony, Ale, Maribel). New backend endpoints aggregate both tables. New frontend view with Chart.js charts, per-worker cards, and a daily log input form. Sidebar nav gets a subtab under Dashboard.

**Tech Stack:** PostgreSQL, Express, Chart.js (already loaded), vanilla JS (DOM building pattern like designer-tracking.js)

---

## Context for Implementor

### Existing Data Sources
- **Designers table:** `designers` (id, name, phone, is_active) — seeded with Sarahi, Majo
- **Designer logs:** `designer_daily_logs` (designer_id, log_date, designs_completed, armados_completed, corrections_made, details JSONB)
- **Designer task stats:** `GET /api/designer-tasks/stats` — per-designer task counts, completion %, avg hours
- **Designer daily logs:** `GET /api/designer-tasks/daily-logs/:designerId?days=30` — history + averages
- **Production tracking:** `production_tracking` table exists but is order-tied, NOT daily piece counts
- **CSV baseline data:** `analytics/employee-production-week-2026-04-06/` has one week of production data for 5 workers

### Production Workers (from analytics CSVs + payroll)
| Name | Role | Weekly Pay |
|------|------|-----------|
| Alicia (ALICE) | Production | $2,800 |
| Luz (LUZ) | Production | $2,300 |
| Bony (BONY) | Production | - |
| Ale (ALE) | Production | - |
| Maribel (MARIBEL) | Production | - |

### Product Types Tracked
imanes_medianos, llaveros, destapadores, imanes_3d, portallaves, portaretratos

### Iman-Equivalent Conversion Rates
imanes_medianos=1.0, destapadores=1.0, llaveros=1.43, imanes_3d=2.5, portallaves=TBD, portaretratos=TBD

### Key Files
- **Sidebar nav:** `frontend/admin-dashboard/index.html` lines 164-168 (Dashboard button)
- **View switching:** `frontend/admin-dashboard/dashboard.js` `switchView()` at line 153
- **Designer routes (model to follow):** `backend/api/designer-routes.js`
- **Designer tracking frontend (model to follow):** `frontend/employee-dashboard/designer-tracking.js`
- **Script tags:** `frontend/admin-dashboard/index.html` lines 3000-3019
- **Server route registration:** `backend/api/server.js` line 593 (`app.use('/api/designer-tasks', ...)`)
- **Migration runner:** `backend/migrations/run-migration.js`

### Auth Pattern
Admin dashboard uses `admin_token` via `authMiddleware` from `admin-routes.js`. The designer-routes use `flexAuth` which tries employee auth then falls back to admin auth. For the new production endpoints, use `authMiddleware` directly (admin-only).

---

## Task 1: Database Migration — `production_workers` + `production_daily_logs`

**Files:**
- Create: `backend/migrations/add-production-tracking-logs.js`
- Modify: `backend/migrations/run-migration.js`

**Step 1: Write the migration file**

```javascript
// backend/migrations/add-production-tracking-logs.js
import { query } from '../shared/database.js';

export async function addProductionTrackingLogs() {
  console.log('🔄 Creating production_workers + production_daily_logs tables...');

  await query(`
    CREATE TABLE IF NOT EXISTS production_workers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      nickname VARCHAR(50),
      phone VARCHAR(20),
      weekly_pay NUMERIC(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS production_daily_logs (
      id SERIAL PRIMARY KEY,
      worker_id INTEGER NOT NULL REFERENCES production_workers(id),
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      imanes_medianos INTEGER NOT NULL DEFAULT 0,
      llaveros INTEGER NOT NULL DEFAULT 0,
      destapadores INTEGER NOT NULL DEFAULT 0,
      imanes_3d INTEGER NOT NULL DEFAULT 0,
      portallaves INTEGER NOT NULL DEFAULT 0,
      portaretratos INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(worker_id, log_date)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_prod_logs_worker_date
    ON production_daily_logs(worker_id, log_date DESC)
  `);

  // Seed production workers
  const workers = [
    ['Alicia', 'ALICE', 2800],
    ['Luz', 'LUZ', 2300],
    ['Bony', 'BONY', null],
    ['Ale', 'ALE', null],
    ['Maribel', 'MARIBEL', null]
  ];

  for (const [name, nickname, pay] of workers) {
    await query(`
      INSERT INTO production_workers (name, nickname, weekly_pay)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, [name, nickname, pay]);
  }

  // Seed historical data from the Apr 6-10 CSV analysis
  const historicalData = [
    ['2026-04-06', 'ALICE', 635, 0, 17, 0, 0, 0],
    ['2026-04-06', 'LUZ', 608, 0, 44, 0, 0, 0],
    ['2026-04-06', 'BONY', 685, 0, 25, 0, 0, 0],
    ['2026-04-06', 'ALE', 0, 0, 0, 0, 0, 0],
    ['2026-04-06', 'MARIBEL', 172, 0, 0, 0, 0, 0],
    ['2026-04-07', 'ALICE', 307, 100, 212, 154, 0, 0],
    ['2026-04-07', 'LUZ', 397, 0, 94, 93, 0, 0],
    ['2026-04-07', 'BONY', 0, 0, 199, 146, 0, 0],
    ['2026-04-07', 'ALE', 0, 0, 0, 0, 0, 0],
    ['2026-04-07', 'MARIBEL', 360, 0, 0, 0, 0, 0],
    ['2026-04-08', 'ALICE', 901, 87, 0, 22, 0, 0],
    ['2026-04-08', 'LUZ', 453, 237, 0, 93, 0, 0],
    ['2026-04-08', 'BONY', 499, 200, 0, 13, 0, 0],
    ['2026-04-08', 'ALE', 541, 346, 0, 0, 0, 0],
    ['2026-04-08', 'MARIBEL', 317, 0, 0, 0, 0, 0],
    ['2026-04-09', 'ALICE', 695, 0, 0, 0, 0, 0],
    ['2026-04-09', 'LUZ', 405, 0, 0, 0, 0, 0],
    ['2026-04-09', 'BONY', 256, 100, 231, 0, 0, 0],
    ['2026-04-09', 'ALE', 279, 54, 96, 0, 0, 0],
    ['2026-04-09', 'MARIBEL', 190, 0, 0, 0, 0, 0],
  ];

  for (const [date, nick, im, ll, dest, i3d, port, ret] of historicalData) {
    await query(`
      INSERT INTO production_daily_logs (worker_id, log_date, imanes_medianos, llaveros, destapadores, imanes_3d, portallaves, portaretratos)
      SELECT pw.id, $1::date, $3, $4, $5, $6, $7, $8
      FROM production_workers pw WHERE pw.nickname = $2
      ON CONFLICT (worker_id, log_date) DO NOTHING
    `, [date, nick, im, ll, dest, i3d, port, ret]);
  }

  console.log('✅ production_workers + production_daily_logs created and seeded');
}
```

**Step 2: Register in run-migration.js**

Add after existing migration imports at top:
```javascript
import { addProductionTrackingLogs } from './add-production-tracking-logs.js';
```

Add call after last migration in the `run()` function:
```javascript
await addProductionTrackingLogs();
```

**Step 3: Run the migration**

```bash
cd backend && node migrations/run-migration.js
```

Expected: `✅ production_workers + production_daily_logs created and seeded`

**Step 4: Commit**

```bash
git add backend/migrations/add-production-tracking-logs.js backend/migrations/run-migration.js
git commit -m "feat(employees): add production_workers + production_daily_logs tables with seed data"
```

---

## Task 2: Backend — Production Stats Endpoints

**Files:**
- Create: `backend/api/production-routes.js`
- Modify: `backend/api/server.js` (add route registration ~line 593)

**Step 1: Create the routes file**

```javascript
// backend/api/production-routes.js
import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import { query } from '../shared/database.js';

const router = Router();

// Iman-equivalent multipliers
const IMAN_EQ = {
  imanes_medianos: 1.0,
  destapadores: 1.0,
  llaveros: 1.43,
  imanes_3d: 2.5,
  portallaves: 1.5,
  portaretratos: 1.5
};

const PRODUCT_COLS = Object.keys(IMAN_EQ);

// GET /api/production/workers — list active workers
router.get('/workers', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM production_workers WHERE is_active = true ORDER BY name'
    );
    res.json({ success: true, workers: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/production/stats?days=30 — aggregate stats for all workers
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [perWorker, dailyTotals] = await Promise.all([
      query(`
        SELECT
          pw.id, pw.name, pw.nickname, pw.weekly_pay,
          COUNT(pdl.id) AS days_logged,
          SUM(pdl.imanes_medianos) AS total_imanes,
          SUM(pdl.llaveros) AS total_llaveros,
          SUM(pdl.destapadores) AS total_destapadores,
          SUM(pdl.imanes_3d) AS total_imanes_3d,
          SUM(pdl.portallaves) AS total_portallaves,
          SUM(pdl.portaretratos) AS total_portaretratos,
          SUM(pdl.imanes_medianos + pdl.llaveros + pdl.destapadores +
              pdl.imanes_3d + pdl.portallaves + pdl.portaretratos) AS total_pieces
        FROM production_workers pw
        LEFT JOIN production_daily_logs pdl ON pdl.worker_id = pw.id
          AND pdl.log_date >= CURRENT_DATE - $1::int
        WHERE pw.is_active = true
        GROUP BY pw.id, pw.name, pw.nickname, pw.weekly_pay
        ORDER BY total_pieces DESC NULLS LAST
      `, [days]),
      query(`
        SELECT
          pdl.log_date,
          SUM(pdl.imanes_medianos) AS imanes_medianos,
          SUM(pdl.llaveros) AS llaveros,
          SUM(pdl.destapadores) AS destapadores,
          SUM(pdl.imanes_3d) AS imanes_3d,
          SUM(pdl.portallaves) AS portallaves,
          SUM(pdl.portaretratos) AS portaretratos,
          SUM(pdl.imanes_medianos + pdl.llaveros + pdl.destapadores +
              pdl.imanes_3d + pdl.portallaves + pdl.portaretratos) AS total_pieces
        FROM production_daily_logs pdl
        JOIN production_workers pw ON pw.id = pdl.worker_id AND pw.is_active = true
        WHERE pdl.log_date >= CURRENT_DATE - $1::int
        GROUP BY pdl.log_date
        ORDER BY pdl.log_date
      `, [days])
    ]);

    // Compute iman-equivalents for each worker
    const workers = perWorker.rows.map(w => {
      const imanEq = Math.round(
        (parseInt(w.total_imanes) || 0) * IMAN_EQ.imanes_medianos +
        (parseInt(w.total_llaveros) || 0) * IMAN_EQ.llaveros +
        (parseInt(w.total_destapadores) || 0) * IMAN_EQ.destapadores +
        (parseInt(w.total_imanes_3d) || 0) * IMAN_EQ.imanes_3d +
        (parseInt(w.total_portallaves) || 0) * IMAN_EQ.portallaves +
        (parseInt(w.total_portaretratos) || 0) * IMAN_EQ.portaretratos
      );
      return { ...w, iman_equivalents: imanEq };
    });

    res.json({ success: true, workers, dailyTotals: dailyTotals.rows, imanEqRates: IMAN_EQ });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/production/weekly-chart?weeks=8 — weekly totals per worker for chart
router.get('/weekly-chart', authMiddleware, async (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 8;

    const result = await query(`
      SELECT
        pw.name,
        DATE_TRUNC('week', pdl.log_date)::date AS week_start,
        SUM(pdl.imanes_medianos + pdl.llaveros + pdl.destapadores +
            pdl.imanes_3d + pdl.portallaves + pdl.portaretratos) AS total_pieces
      FROM production_daily_logs pdl
      JOIN production_workers pw ON pw.id = pdl.worker_id AND pw.is_active = true
      WHERE pdl.log_date >= CURRENT_DATE - ($1 * 7)::int
      GROUP BY pw.name, DATE_TRUNC('week', pdl.log_date)
      ORDER BY week_start, pw.name
    `, [weeks]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/production/daily-log — save/update daily log for a worker
router.post('/daily-log', authMiddleware, async (req, res) => {
  try {
    const { worker_id, log_date, imanes_medianos, llaveros, destapadores, imanes_3d, portallaves, portaretratos, notes } = req.body;
    if (!worker_id) return res.status(400).json({ success: false, error: 'worker_id required' });

    const date = log_date || new Date().toISOString().split('T')[0];
    const result = await query(`
      INSERT INTO production_daily_logs (worker_id, log_date, imanes_medianos, llaveros, destapadores, imanes_3d, portallaves, portaretratos, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (worker_id, log_date)
      DO UPDATE SET
        imanes_medianos = $3, llaveros = $4, destapadores = $5,
        imanes_3d = $6, portallaves = $7, portaretratos = $8,
        notes = $9, updated_at = NOW()
      RETURNING *
    `, [worker_id, date,
        imanes_medianos || 0, llaveros || 0, destapadores || 0,
        imanes_3d || 0, portallaves || 0, portaretratos || 0,
        notes || null]);

    res.json({ success: true, log: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/production/daily-logs?date=YYYY-MM-DD — all workers' logs for a date
router.get('/daily-logs', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const result = await query(`
      SELECT pdl.*, pw.name, pw.nickname
      FROM production_daily_logs pdl
      JOIN production_workers pw ON pw.id = pdl.worker_id
      WHERE pdl.log_date = $1
      ORDER BY pw.name
    `, [date]);
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
```

**Step 2: Register in server.js**

Find `app.use('/api/designer-tasks', designerTaskRoutes);` (~line 593) and add below it:

```javascript
import productionRoutes from './production-routes.js';
```
(Add import near line 57 with other imports)

```javascript
app.use('/api/production', productionRoutes);
```
(Add after the designer-tasks line ~593)

**Step 3: Commit**

```bash
git add backend/api/production-routes.js
git commit -m "feat(employees): add production stats + daily-log API endpoints"
```

---

## Task 3: Sidebar Nav — Add Empleados subtab under Dashboard

**Files:**
- Modify: `frontend/admin-dashboard/index.html` (lines 164-168 and add new view section)

**Step 1: Replace Dashboard standalone button with nav-section**

Find (lines 164-168):
```html
                <!-- 2. Dashboard/Analytics -->
                <button class="nav-item" data-view="analytics" tabindex="0">
                    <i data-lucide="bar-chart-3" class="nav-icon"></i>
                    <span>Dashboard</span>
                </button>
```

Replace with:
```html
                <!-- 2. Dashboard/Analytics -->
                <div class="nav-section">
                    <button class="nav-item" data-view="analytics" tabindex="0">
                        <i data-lucide="bar-chart-3" class="nav-icon"></i>
                        <span>Dashboard</span>
                    </button>
                    <div class="nav-sub-items">
                        <button class="nav-sub-item" data-view="employees-stats" tabindex="0">
                            <i data-lucide="hard-hat" class="nav-icon-sm"></i>
                            <span>Empleados</span>
                        </button>
                    </div>
                </div>
```

**Step 2: Add the view section in the content area**

Add after the closing `</section><!-- End analytics-view -->` (find it by searching for the analytics-view section end — it's the section starting at line 881):

```html
            <!-- Employees Stats View (Sub-tab of Dashboard) -->
            <section id="employees-stats-view" class="view">
                <div class="view-header">
                    <h2>👥 Producción — Empleados</h2>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="emp-stats-period" onchange="loadEmployeesStats()" style="padding: 10px 16px; border: 2px solid #e5e7eb; border-radius: 8px; font-weight: 600;">
                            <option value="7">Última semana</option>
                            <option value="30" selected>Últimos 30 días</option>
                            <option value="90">Últimos 90 días</option>
                        </select>
                        <button class="btn btn-primary" onclick="loadEmployeesStats()">🔄 Actualizar</button>
                    </div>
                </div>

                <!-- Summary Cards -->
                <div id="emp-summary-cards" class="analytics-summary-cards" style="margin-bottom: 24px;">
                    <!-- Dynamic -->
                </div>

                <!-- Per-Worker Cards -->
                <div id="emp-worker-cards" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px;">
                    <!-- Dynamic -->
                </div>

                <!-- Weekly Production Chart -->
                <div style="background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 32px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 16px;">📊 Producción Semanal</h3>
                    <canvas id="emp-weekly-chart" height="300"></canvas>
                </div>

                <!-- Daily Log Input -->
                <div style="background: white; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 32px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; font-size: 16px;">📝 Registro Diario</h3>
                        <input type="date" id="emp-log-date" style="padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-weight: 600;">
                    </div>
                    <div id="emp-daily-log-form">
                        <!-- Dynamic: one row per worker with product inputs -->
                    </div>
                </div>

                <!-- Recent Logs Table -->
                <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0; padding: 20px 24px 0; font-size: 16px;">📋 Registros Recientes</h3>
                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                                    <th style="padding: 12px 16px; text-align: left;">Fecha</th>
                                    <th style="padding: 12px 16px; text-align: left;">Empleada</th>
                                    <th style="padding: 12px 16px; text-align: right;">Imanes</th>
                                    <th style="padding: 12px 16px; text-align: right;">Llaveros</th>
                                    <th style="padding: 12px 16px; text-align: right;">Destap.</th>
                                    <th style="padding: 12px 16px; text-align: right;">3D</th>
                                    <th style="padding: 12px 16px; text-align: right; font-weight: 700;">Total</th>
                                    <th style="padding: 12px 16px; text-align: right; color: #e72a88; font-weight: 700;">Imán-eq</th>
                                </tr>
                            </thead>
                            <tbody id="emp-recent-logs-body">
                                <!-- Dynamic -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
```

**Step 3: Add script tag**

Find the script tags block (~line 3015, after `employees.js`), add:
```html
    <script src="employees-stats.js"></script>
```

**Step 4: Add switchView hook in dashboard.js**

In `switchView()` function (after the employee-portal block ~line 215), add:
```javascript
  if (viewName === 'employees-stats' && typeof loadEmployeesStats === 'function') {
    loadEmployeesStats();
  }
```

**Step 5: Commit**

```bash
git add frontend/admin-dashboard/index.html
git commit -m "feat(employees): add Empleados subtab under Dashboard + view HTML"
```

---

## Task 4: Frontend — `employees-stats.js`

**Files:**
- Create: `frontend/admin-dashboard/employees-stats.js`

**Step 1: Write the full JS file**

This file handles: loading stats, rendering summary cards, per-worker cards, weekly chart, daily log form, and recent logs table. Model after `designer-tracking.js` DOM building pattern. Use `Chart.js` (already loaded globally). Use `getAuthHeaders()` and `API_BASE` from `dashboard.js` (global).

Key functions:
- `loadEmployeesStats()` — main entry, fetches `/api/production/stats` + `/api/production/weekly-chart`, renders everything
- `renderEmpSummaryCards(workers, dailyTotals)` — 4 KPI cards
- `renderEmpWorkerCards(workers)` — per-worker card with product breakdown
- `renderEmpWeeklyChart(chartData, workers)` — stacked bar chart
- `loadEmpDailyLogForm()` — renders input form for today's date
- `saveEmpDailyLog(workerId)` — POST to save a worker's daily log
- `renderRecentLogs(dailyTotals)` — last 14 days table

**Iman-equivalent rates (match backend):**
```javascript
const IMAN_EQ = { imanes_medianos: 1.0, destapadores: 1.0, llaveros: 1.43, imanes_3d: 2.5, portallaves: 1.5, portaretratos: 1.5 };
```

**Summary cards to show:**
1. Total piezas (period) — sum of all workers' total_pieces
2. Imán-equivalentes — sum of all workers' iman_equivalents
3. Promedio diario/equipo — total_pieces / unique days logged
4. Mejor rendimiento — top worker name + their total

**Worker card layout:**
- Avatar circle (first letter, colored like designer cards)
- Name + weekly pay if available
- Mini product breakdown: Imanes: X | Llaveros: X | Destap: X | 3D: X
- Total pieces + iman-equivalents in bold
- Days worked count
- Avg pieces/day

**Weekly chart:**
- Stacked bar chart, one bar per week, segments per worker
- Each worker gets a distinct color from AXKAN palette
- Colors: `['#e72a88', '#09adc2', '#8ab73b', '#f39223', '#e52421']`

**Daily log form:**
- Date picker (defaults to today)
- Grid: one row per active worker, columns for each product type (number inputs), save button per row
- On save: POST `/api/production/daily-log`, show success toast, reload stats

**Recent logs table:**
- Fetch daily totals from stats response
- Show date, each worker's output on that date (need per-worker-per-date — use a separate fetch or expand the stats endpoint)
- For simplicity: show aggregated daily totals from the stats endpoint, with per-row totals and iman-eq

Full implementation is ~300 lines. Build all DOM via `document.createElement` + `textContent` (no innerHTML with data). Use existing CSS classes (`.analytics-summary-cards`, `.stat-card`, `.data-table`) for consistency.

**Step 2: Commit**

```bash
git add frontend/admin-dashboard/employees-stats.js
git commit -m "feat(employees): production stats dashboard JS — cards, chart, daily log form"
```

---

## Task 5: Wire switchView + Mobile Nav

**Files:**
- Modify: `frontend/admin-dashboard/dashboard.js` (~line 215)
- Modify: `frontend/admin-dashboard/index.html` (mobile nav section, ~line 2984)

**Step 1: Add switchView hook** (if not done in Task 3)

**Step 2: Add mobile nav entry**

Find the mobile "more" sheet items (~line 2984) and add:
```html
<button class="more-sheet-item" data-mobile-view="employees-stats">
```

**Step 3: Test navigation**

- Click Dashboard → section expands showing "Empleados" subtab
- Click Empleados → loads employees-stats-view
- Click Dashboard again → shows analytics-view (existing behavior preserved)

**Step 4: Commit**

```bash
git commit -m "feat(employees): wire nav switching + mobile menu entry"
```

---

## Task 6: Smoke Test & Verify

**Step 1: Run migration on Render (auto on deploy) or locally**

```bash
cd backend && node migrations/run-migration.js
```

**Step 2: Start dev server**

```bash
npm run dev
```

**Step 3: Verify endpoints**

```bash
# List workers
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/production/workers

# Get stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/production/stats?days=30

# Get weekly chart data
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/production/weekly-chart?weeks=8

# Save a daily log
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"worker_id":1,"imanes_medianos":500,"llaveros":100}' \
  http://localhost:3000/api/production/daily-log
```

**Step 4: Verify admin dashboard**

- Open admin dashboard
- Click Dashboard → Empleados
- Should see seeded data from Apr 6-9 in charts and cards
- Fill in today's log via the form
- Verify it appears in recent logs

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(employees): complete production dashboard with stats, charts, and daily log input"
```
