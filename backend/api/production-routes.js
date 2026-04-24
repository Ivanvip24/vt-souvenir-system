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
