/**
 * Salesperson & Commission Routes
 * CRUD for salespeople, commission summaries, monthly breakdowns,
 * and email config diagnostics.
 *
 * Extracted from server.js — Playbook S4
 */

import { Router } from 'express';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';

const router = Router();


/**
 * GET /api/salespeople
 * List all salespeople
 */
router.get('/salespeople', async (req, res) => {
  try {
    const { active_only } = req.query;

    let sql = `
      SELECT
        sp.*,
        COALESCE(stats.total_orders, 0) as total_orders,
        COALESCE(stats.total_sales, 0) as total_sales,
        COALESCE(stats.pending_orders, 0) as pending_orders
      FROM salespeople sp
      LEFT JOIN (
        SELECT
          COALESCE(salesperson_id, (SELECT id FROM salespeople WHERE LOWER(name) = LOWER(o.sales_rep) LIMIT 1)) as sp_id,
          COUNT(*) as total_orders,
          SUM(total_price) as total_sales,
          COUNT(CASE WHEN approval_status = 'pending_review' THEN 1 END) as pending_orders
        FROM orders o
        WHERE sales_rep IS NOT NULL OR salesperson_id IS NOT NULL
        GROUP BY sp_id
      ) stats ON sp.id = stats.sp_id
    `;

    if (active_only === 'true') {
      sql += ` WHERE sp.is_active = true`;
    }

    sql += ` ORDER BY sp.name`;

    const result = await query(sql);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logError('salesperson.error-fetching-salespeople', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * POST /api/salespeople
 * Create a new salesperson
 */
router.post('/salespeople', async (req, res) => {
  try {
    const { name, phone, email, commission_rate, notes } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const result = await query(`
      INSERT INTO salespeople (name, phone, email, commission_rate, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, phone || null, email || null, commission_rate || 6.00, notes || null]);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logError('salesperson.error-creating-salesperson', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'A salesperson with this name already exists' });
    }
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * PUT /api/salespeople/:id
 * Update a salesperson
 */
router.put('/salespeople/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, commission_rate, is_active, notes } = req.body;

    const result = await query(`
      UPDATE salespeople
      SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        commission_rate = COALESCE($5, commission_rate),
        is_active = COALESCE($6, is_active),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id, name, phone, email, commission_rate, is_active, notes]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Salesperson not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logError('salesperson.error-updating-salesperson', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * DELETE /api/salespeople/:id
 * Delete a salesperson (soft delete - set inactive)
 */
router.delete('/salespeople/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      UPDATE salespeople
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Salesperson not found' });
    }

    res.json({
      success: true,
      message: 'Salesperson deactivated'
    });
  } catch (error) {
    logError('salesperson.error-deleting-salesperson', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * GET /api/commissions
 * Get commission summary for all salespeople
 */
router.get('/commissions', async (req, res) => {
  try {
    const { start_date, end_date, salesperson } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND o.created_at >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND o.created_at <= $${params.length}`;
    }

    let salespersonFilter = '';
    if (salesperson) {
      params.push(salesperson);
      salespersonFilter = ` AND LOWER(o.sales_rep) = LOWER($${params.length})`;
    }

    const result = await query(`
      SELECT
        COALESCE(o.sales_rep, 'Sin vendedor') as salesperson_name,
        sp.id as salesperson_id,
        COALESCE(sp.commission_rate, 6.00) as commission_rate,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_sales,
        COALESCE(SUM(o.total_price * COALESCE(sp.commission_rate, 6.00) / 100), 0) as total_commission,
        COUNT(CASE WHEN o.approval_status = 'approved' THEN 1 END) as approved_orders,
        COALESCE(SUM(CASE WHEN o.approval_status = 'approved' THEN o.total_price END), 0) as approved_sales,
        COALESCE(SUM(CASE WHEN o.approval_status = 'approved' THEN o.total_price * COALESCE(sp.commission_rate, 6.00) / 100 END), 0) as approved_commission,
        COUNT(CASE WHEN o.approval_status = 'pending_review' THEN 1 END) as pending_orders,
        COALESCE(SUM(CASE WHEN o.approval_status = 'pending_review' THEN o.total_price END), 0) as pending_sales
      FROM orders o
      LEFT JOIN salespeople sp ON LOWER(o.sales_rep) = LOWER(sp.name)
      WHERE o.sales_rep IS NOT NULL AND o.sales_rep != ''
        AND o.archive_status = 'completo'
        ${dateFilter}
        ${salespersonFilter}
      GROUP BY o.sales_rep, sp.id, sp.commission_rate
      ORDER BY total_sales DESC
    `, params);

    // Calculate totals
    const totals = result.rows.reduce((acc, row) => ({
      total_orders: acc.total_orders + parseInt(row.total_orders),
      total_sales: acc.total_sales + parseFloat(row.total_sales),
      total_commission: acc.total_commission + parseFloat(row.total_commission),
      approved_orders: acc.approved_orders + parseInt(row.approved_orders),
      approved_sales: acc.approved_sales + parseFloat(row.approved_sales),
      approved_commission: acc.approved_commission + parseFloat(row.approved_commission)
    }), { total_orders: 0, total_sales: 0, total_commission: 0, approved_orders: 0, approved_sales: 0, approved_commission: 0 });

    res.json({
      success: true,
      data: {
        salespeople: result.rows,
        totals
      }
    });
  } catch (error) {
    logError('salesperson.error-fetching-commissions', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * GET /api/commissions/monthly
 * Get monthly commission breakdown
 */
router.get('/commissions/monthly', async (req, res) => {
  try {
    const { salesperson, months, start_date, end_date } = req.query;
    const params = [];
    let dateFilter = '';
    let salespersonFilter = '';

    // Use explicit date range if provided, otherwise fall back to months limit
    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND o.created_at >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND o.created_at <= $${params.length}`;
    }
    if (!start_date && !end_date) {
      const monthsLimit = parseInt(months) || 6;
      params.push(monthsLimit);
      dateFilter = ` AND o.created_at >= CURRENT_DATE - INTERVAL '1 month' * $${params.length}`;
    }

    if (salesperson) {
      params.push(salesperson);
      salespersonFilter = ` AND LOWER(o.sales_rep) = LOWER($${params.length})`;
    }

    const result = await query(`
      SELECT
        COALESCE(o.sales_rep, 'Sin vendedor') as salesperson_name,
        sp.id as salesperson_id,
        COALESCE(sp.commission_rate, 6.00) as commission_rate,
        TO_CHAR(o.created_at, 'YYYY-MM') as month,
        TO_CHAR(o.created_at, 'Mon YYYY') as month_display,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_price), 0) as sales,
        COALESCE(SUM(o.total_price * COALESCE(sp.commission_rate, 6.00) / 100), 0) as commission
      FROM orders o
      LEFT JOIN salespeople sp ON LOWER(o.sales_rep) = LOWER(sp.name)
      WHERE o.sales_rep IS NOT NULL AND o.sales_rep != ''
        AND o.archive_status = 'completo'
        ${dateFilter}
        ${salespersonFilter}
      GROUP BY o.sales_rep, sp.id, sp.commission_rate, TO_CHAR(o.created_at, 'YYYY-MM'), TO_CHAR(o.created_at, 'Mon YYYY')
      ORDER BY month DESC, sales DESC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logError('salesperson.error-fetching-monthly-commissions', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * GET /api/commissions/:salesperson/orders
 * Get orders for a specific salesperson
 */
router.get('/commissions/:salesperson/orders', async (req, res) => {
  try {
    const { salesperson } = req.params;
    const { start_date, end_date, status } = req.query;

    let filters = `WHERE LOWER(o.sales_rep) = LOWER($1)
        AND o.archive_status = 'completo'`;
    const params = [salesperson];

    if (start_date) {
      params.push(start_date);
      filters += ` AND o.created_at >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      filters += ` AND o.created_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        o.id,
        o.order_number,
        o.total_price,
        o.approval_status,
        o.status,
        o.created_at,
        c.name as client_name,
        sp.commission_rate,
        (o.total_price * COALESCE(sp.commission_rate, 6.00) / 100) as commission
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN salespeople sp ON LOWER(o.sales_rep) = LOWER(sp.name)
      ${filters}
      ORDER BY o.created_at DESC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logError('salesperson.error-fetching-salesperson-orders', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Check email environment variables (diagnostic)
router.get('/test/email-config', (req, res) => {
  const config = {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? `SET (${process.env.RESEND_API_KEY.length} chars)` : 'NOT SET',
    EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'NOT SET',
    EMAIL_USER: process.env.EMAIL_USER || 'NOT SET',
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? `SET (${process.env.EMAIL_PASSWORD.length} chars)` : 'NOT SET',
    COMPANY_NAME: process.env.COMPANY_NAME || 'NOT SET',
    COMPANY_EMAIL: process.env.COMPANY_EMAIL || 'NOT SET',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'NOT SET',
    ACTIVE_PROVIDER: process.env.RESEND_API_KEY ? 'resend' : (process.env.SENDGRID_API_KEY ? 'sendgrid' : 'smtp'),
  };

  log('info', 'salesperson.email-configuration-check');

  res.json({
    success: true,
    config: config,
    note: 'Recommended: Use Resend (RESEND_API_KEY). Free tier: 100 emails/day. Works on Render without SMTP port issues.'
  });
});


export default router;
