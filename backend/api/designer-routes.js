import { Router } from 'express';
import { authMiddleware } from './admin-routes.js';
import { triggerDailyReport, triggerWeeklyReport, sendDailyFollowUp } from '../services/designer-scheduler.js';
import { getPendingTasks, getDailySummary, getWeeklySummary } from '../services/designer-task-tracker.js';

const router = Router();

// All routes require admin auth
router.use(authMiddleware);

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
