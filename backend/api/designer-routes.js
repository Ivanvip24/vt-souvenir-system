import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import { triggerDailyReport, triggerWeeklyReport, sendDailyFollowUp } from '../services/designer-scheduler.js';
import {
  getPendingTasks, getDailySummary, getWeeklySummary,
  createTask, completeTask, markCorrection
} from '../services/designer-task-tracker.js';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';

const router = Router();

// Accept both admin auth and employee auth (JWT from either system)
// Try employee auth first (employee dashboard), fall back to admin auth
async function flexAuth(req, res, next) {
  // Try loading employee auth middleware dynamically
  try {
    const { employeeAuth } = await import('./middleware/employee-auth.js');
    employeeAuth(req, res, (err) => {
      if (!err && req.employee) {
        // Check if manager/admin
        if (!['manager', 'admin'].includes(req.employee.role)) {
          return res.status(403).json({ success: false, error: 'Manager access required' });
        }
        return next();
      }
      // Fall back to admin auth
      authMiddleware(req, res, next);
    });
  } catch {
    authMiddleware(req, res, next);
  }
}

// Auth that allows ANY authenticated employee (not just managers)
async function anyEmployeeAuth(req, res, next) {
  try {
    const { employeeAuth } = await import('./middleware/employee-auth.js');
    employeeAuth(req, res, (err) => {
      if (!err && req.employee) {
        return next();
      }
      // Fall back to admin auth
      authMiddleware(req, res, next);
    });
  } catch {
    authMiddleware(req, res, next);
  }
}

// Daily log & designers list — accessible to ALL authenticated employees
router.get('/designers', anyEmployeeAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM designers WHERE is_active = true ORDER BY name');
    res.json({ success: true, designers: result.rows });
  } catch (err) {
    logError('designer.error-fetching-designers', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/daily-log/:designerId', anyEmployeeAuth, async (req, res) => {
  try {
    const { designerId } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const result = await query(
      'SELECT * FROM designer_daily_logs WHERE designer_id = $1 AND log_date = $2',
      [designerId, date]
    );
    res.json({ success: true, log: result.rows[0] || null });
  } catch (err) {
    logError('designer.error-fetching-daily-log', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/daily-log', anyEmployeeAuth, async (req, res) => {
  try {
    const { designerId, designs_completed, armados_completed, corrections_made, notes, details } = req.body;
    if (!designerId) return res.status(400).json({ success: false, error: 'designerId required' });

    const today = new Date().toISOString().split('T')[0];
    const detailsJson = JSON.stringify(details || []);
    const result = await query(`
      INSERT INTO designer_daily_logs (designer_id, log_date, designs_completed, armados_completed, corrections_made, notes, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (designer_id, log_date)
      DO UPDATE SET
        designs_completed = $3,
        armados_completed = $4,
        corrections_made = $5,
        notes = $6,
        details = $7::jsonb,
        updated_at = NOW()
      RETURNING *
    `, [designerId, today, designs_completed || 0, armados_completed || 0, corrections_made || 0, notes || null, detailsJson]);

    res.json({ success: true, log: result.rows[0] });
  } catch (err) {
    logError('designer.error-saving-daily-log', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// All other routes require manager auth
router.use(flexAuth);

// ── READ ENDPOINTS (manager-only) ─────────────────

// GET /api/designer-tasks/pending - List pending tasks
router.get('/pending', async (req, res) => {
  try {
    const tasks = await getPendingTasks();
    res.json({ success: true, tasks });
  } catch (err) {
    logError('designer.error-fetching-pending-designer-tasks', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/all - All tasks with filters
router.get('/all', async (req, res) => {
  try {
    const { designer_id, status, task_type, limit: lim = 50, offset = 0 } = req.query;
    let sql = `
      SELECT dt.*, d.name AS designer_name,
        (SELECT COUNT(*) FROM design_pieces dp WHERE dp.task_id = dt.id) AS piece_count,
        (SELECT COUNT(*) FROM design_pieces dp WHERE dp.task_id = dt.id AND dp.status IN ('delivered', 'done')) AS pieces_done,
        (SELECT COALESCE(SUM(dp.correction_count), 0) FROM design_pieces dp WHERE dp.task_id = dt.id) AS total_corrections
      FROM designer_tasks dt
      JOIN designers d ON d.id = dt.designer_id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (designer_id) {
      sql += ` AND dt.designer_id = $${paramIdx++}`;
      params.push(designer_id);
    }
    if (status) {
      sql += ` AND dt.status = $${paramIdx++}`;
      params.push(status);
    }
    if (task_type) {
      sql += ` AND dt.task_type = $${paramIdx++}`;
      params.push(task_type);
    }

    sql += ` ORDER BY dt.assigned_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(lim), parseInt(offset));

    const result = await query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) FROM designer_tasks dt WHERE 1=1';
    const countParams = [];
    let ci = 1;
    if (designer_id) { countSql += ` AND dt.designer_id = $${ci++}`; countParams.push(designer_id); }
    if (status) { countSql += ` AND dt.status = $${ci++}`; countParams.push(status); }
    if (task_type) { countSql += ` AND dt.task_type = $${ci++}`; countParams.push(task_type); }
    const countResult = await query(countSql, countParams);

    res.json({ success: true, tasks: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    logError('designer.error-fetching-all-designer-tasks', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/daily - Today's summary
router.get('/daily', async (req, res) => {
  try {
    const summary = await getDailySummary();
    res.json({ success: true, summary });
  } catch (err) {
    logError('designer.error-fetching-daily-designer-summary', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/weekly - This week's summary
router.get('/weekly', async (req, res) => {
  try {
    const summary = await getWeeklySummary();
    res.json({ success: true, summary });
  } catch (err) {
    logError('designer.error-fetching-weekly-designer-summary', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/stats - Aggregate stats for dashboard cards
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [totals, perDesigner] = await Promise.all([
      query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'done') AS completed,
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) AS pending,
          COUNT(*) FILTER (WHERE status = 'correction') AS in_correction,
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')
            AND assigned_at < NOW() - INTERVAL '2 days') AS overdue
        FROM designer_tasks
        WHERE assigned_at >= ($1::date - INTERVAL '30 days')
      `, [today]),
      query(`
        SELECT
          d.id, d.name,
          COUNT(dt.id) AS total_tasks,
          COUNT(dt.id) FILTER (WHERE dt.status = 'done') AS completed,
          COUNT(dt.id) FILTER (WHERE dt.status IN ('pending', 'in_progress')) AS active,
          COUNT(dt.id) FILTER (WHERE dt.status = 'correction') AS in_correction,
          ROUND(AVG(
            EXTRACT(EPOCH FROM (dt.completed_at - dt.assigned_at)) / 3600.0
          ) FILTER (WHERE dt.completed_at IS NOT NULL)::numeric, 1) AS avg_hours
        FROM designers d
        LEFT JOIN designer_tasks dt ON dt.designer_id = d.id
          AND dt.assigned_at >= ($1::date - INTERVAL '30 days')
        WHERE d.is_active = true
        GROUP BY d.id, d.name
        ORDER BY d.name
      `, [today])
    ]);

    res.json({
      success: true,
      totals: totals.rows[0],
      designers: perDesigner.rows
    });
  } catch (err) {
    logError('designer.error-fetching-designer-stats', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── WRITE ENDPOINTS ────────────────────────────────

// POST /api/designer-tasks/create - Create a task manually
router.post('/create', async (req, res) => {
  try {
    const { designerName, taskType, productType, destination, quantity, pieces, orderReference, description } = req.body;
    const task = await createTask({
      designerName,
      taskType,
      productType,
      destination,
      quantity,
      pieces: pieces || [],
      orderReference,
      description,
      source: 'dashboard'
    });
    res.json({ success: true, task });
  } catch (err) {
    logError('designer.error-creating-designer-task', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/:id/complete - Mark task done
router.post('/:id/complete', async (req, res) => {
  try {
    const task = await completeTask(parseInt(req.params.id));
    res.json({ success: true, task });
  } catch (err) {
    logError('designer.error-completing-designer-task', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/:id/correction - Log a correction
router.post('/:id/correction', async (req, res) => {
  try {
    const { pieceId, notes } = req.body;
    const result = await markCorrection(parseInt(req.params.id), pieceId || null, notes || null);
    res.json({ success: true, ...result });
  } catch (err) {
    logError('designer.error-marking-correction', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/report/daily - Trigger daily report now
router.post('/report/daily', async (req, res) => {
  try {
    const result = await triggerDailyReport();
    res.json({ success: true, ...result });
  } catch (err) {
    logError('designer.error-triggering-daily-designer-report', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/report/weekly - Trigger weekly report now
router.post('/report/weekly', async (req, res) => {
  try {
    const result = await triggerWeeklyReport();
    res.json({ success: true, ...result });
  } catch (err) {
    logError('designer.error-triggering-weekly-designer-report', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/follow-up - Send follow-ups now
router.post('/follow-up', async (req, res) => {
  try {
    await sendDailyFollowUp();
    res.json({ success: true, message: 'Follow-up messages sent' });
  } catch (err) {
    logError('designer.error-sending-designer-follow-ups', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DAILY LOG HISTORY (manager-only) ─────────────

// GET /api/designer-tasks/daily-logs/:designerId?days=30 - History for manager
router.get('/daily-logs/:designerId', async (req, res) => {
  try {
    const { designerId } = req.params;
    const days = parseInt(req.query.days) || 30;

    const [logs, averages] = await Promise.all([
      query(`
        SELECT * FROM designer_daily_logs
        WHERE designer_id = $1 AND log_date >= CURRENT_DATE - $2::int
        ORDER BY log_date DESC
      `, [designerId, days]),
      query(`
        SELECT
          ROUND(AVG(designs_completed)::numeric, 1) AS avg_designs,
          ROUND(AVG(armados_completed)::numeric, 1) AS avg_armados,
          ROUND(AVG(corrections_made)::numeric, 1) AS avg_corrections,
          COUNT(*) AS days_logged
        FROM designer_daily_logs
        WHERE designer_id = $1 AND log_date >= CURRENT_DATE - $2::int
      `, [designerId, days])
    ]);

    res.json({
      success: true,
      logs: logs.rows,
      averages: averages.rows[0]
    });
  } catch (err) {
    logError('designer.error-fetching-daily-logs-history', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
