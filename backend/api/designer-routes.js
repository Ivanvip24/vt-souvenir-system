import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import { triggerDailyReport, triggerWeeklyReport, sendDailyFollowUp } from '../services/designer-scheduler.js';
import {
  getPendingTasks, getDailySummary, getWeeklySummary,
  createTask, completeTask, markCorrection
} from '../services/designer-task-tracker.js';
import { query } from '../shared/database.js';

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

router.use(flexAuth);

// ── READ ENDPOINTS ─────────────────────────────────

// GET /api/designer-tasks/designers - List all designers
router.get('/designers', async (req, res) => {
  try {
    const result = await query('SELECT * FROM designers WHERE is_active = true ORDER BY name');
    res.json({ success: true, designers: result.rows });
  } catch (err) {
    console.error('Error fetching designers:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/pending - List pending tasks
router.get('/pending', async (req, res) => {
  try {
    const tasks = await getPendingTasks();
    res.json({ success: true, tasks });
  } catch (err) {
    console.error('Error fetching pending designer tasks:', err.message);
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
    console.error('Error fetching all designer tasks:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/daily - Today's summary
router.get('/daily', async (req, res) => {
  try {
    const summary = await getDailySummary();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('Error fetching daily designer summary:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/designer-tasks/weekly - This week's summary
router.get('/weekly', async (req, res) => {
  try {
    const summary = await getWeeklySummary();
    res.json({ success: true, summary });
  } catch (err) {
    console.error('Error fetching weekly designer summary:', err.message);
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
    console.error('Error fetching designer stats:', err.message);
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
    console.error('Error creating designer task:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/:id/complete - Mark task done
router.post('/:id/complete', async (req, res) => {
  try {
    const task = await completeTask(parseInt(req.params.id));
    res.json({ success: true, task });
  } catch (err) {
    console.error('Error completing designer task:', err.message);
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
    console.error('Error marking correction:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/report/daily - Trigger daily report now
router.post('/report/daily', async (req, res) => {
  try {
    const result = await triggerDailyReport();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error triggering daily designer report:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/report/weekly - Trigger weekly report now
router.post('/report/weekly', async (req, res) => {
  try {
    const result = await triggerWeeklyReport();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error triggering weekly designer report:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/designer-tasks/follow-up - Send follow-ups now
router.post('/follow-up', async (req, res) => {
  try {
    await sendDailyFollowUp();
    res.json({ success: true, message: 'Follow-up messages sent' });
  } catch (err) {
    console.error('Error sending designer follow-ups:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
