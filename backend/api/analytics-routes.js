/**
 * Analytics Routes
 * Order alerts, analytics summaries, dashboard, reports, and test email.
 *
 * Extracted from server.js — Playbook S4
 */

import { Router } from 'express';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';
import * as analyticsAgent from '../agents/analytics-agent/index.js';
import * as orderAlerts from '../agents/alerts/order-alerts.js';
import { getDateRange } from '../shared/utils.js';
import { sendReceiptEmail, sendEmail } from '../agents/analytics-agent/email-sender.js';
import { generateBrandedReceipt } from '../services/branded-receipt-generator.js';

const router = Router();

/**
 * GET /api/alerts
 * Get all order alerts categorized by urgency
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await orderAlerts.getOrderAlerts();

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    logError('analytics.alerts.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * GET /api/alerts/summary
 * Get a simple count summary of alerts
 */
router.get('/alerts/summary', async (req, res) => {
  try {
    const summary = await orderAlerts.getAlertsSummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logError('analytics.alerts.summary.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/alerts/send-digest
 * Manually trigger the daily digest email
 * Body: { email: "optional-override@email.com" }
 */
router.post('/alerts/send-digest', async (req, res) => {
  try {
    // Allow email override for testing
    const targetEmail = req.body.email || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        error: 'ADMIN_EMAIL not configured and no email provided'
      });
    }

    const digest = await orderAlerts.generateDailyDigestEmail();

    await sendEmail({
      to: targetEmail,
      subject: `📋 Resumen Diario: ${digest.summary.criticalCount} críticos, ${digest.summary.warningCount} advertencias`,
      html: digest.html
    });

    log('info', 'analytics.alerts.digest-sent', { to: targetEmail });

    res.json({
      success: true,
      message: `Daily digest sent to ${targetEmail}`,
      summary: digest.summary
    });
  } catch (error) {
    logError('analytics.alerts.digest.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// ANALYTICS AGENT ENDPOINTS
// ========================================

// Get analytics summary
router.get('/analytics', async (req, res) => {
  try {
    const periodType = req.query.period || 'this_month';
    const summary = await analyticsAgent.getAnalytics(periodType);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logError('analytics.summary.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get revenue for specific date range
router.get('/analytics/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const revenue = await analyticsAgent.getRevenue(
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: revenue
    });
  } catch (error) {
    logError('analytics.revenue.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get top products
router.get('/analytics/products/top', async (req, res) => {
  try {
    const periodType = req.query.period || 'this_month';
    const limit = parseInt(req.query.limit) || 10;

    const dateRange = getDateRange(periodType);
    const products = await analyticsAgent.getTopProducts(
      dateRange.start,
      dateRange.end,
      limit
    );

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    logError('analytics.products.top.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get top clients
router.get('/analytics/clients/top', async (req, res) => {
  try {
    const periodType = req.query.period || 'this_month';
    const limit = parseInt(req.query.limit) || 10;

    const dateRange = getDateRange(periodType);
    const clients = await analyticsAgent.getTopClients(
      dateRange.start,
      dateRange.end,
      limit
    );

    res.json({
      success: true,
      data: clients
    });
  } catch (error) {
    logError('analytics.clients.top.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// ANALYTICS DASHBOARD ENDPOINTS
// ========================================

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard data with custom date range
 */
router.get('/analytics/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Default to last 30 days
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 30);
    }

    // Get all analytics data in parallel
    const [
      revenueData,
      dailyRevenue,
      topProducts,
      topClients,
      ordersByStatus,
      productBreakdown,
      revenueByCity
    ] = await Promise.all([
      // Revenue summary
      query(`
        SELECT
          COUNT(*) as order_count,
          COALESCE(SUM(total_price), 0) as total_revenue,
          COALESCE(SUM(total_production_cost), 0) as total_cost,
          COALESCE(SUM(profit), 0) as total_profit,
          COALESCE(AVG(profit_margin), 0) as avg_profit_margin,
          COALESCE(AVG(total_price), 0) as avg_order_value
        FROM orders
        WHERE order_date BETWEEN $1 AND $2
          AND status != 'cancelled'
          AND archive_status != 'cancelado'
      `, [start, end]),

      // Daily revenue for chart
      query(`
        SELECT
          order_date::date as date,
          COUNT(*) as order_count,
          COALESCE(SUM(total_price), 0) as revenue,
          COALESCE(SUM(profit), 0) as profit
        FROM orders
        WHERE order_date BETWEEN $1 AND $2
          AND status != 'cancelled'
          AND archive_status != 'cancelado'
        GROUP BY order_date::date
        ORDER BY order_date::date ASC
      `, [start, end]),

      // Top products with quantity
      query(`
        SELECT
          COALESCE(oi.product_name, 'Producto') as product_name,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.line_total) as total_revenue,
          COUNT(DISTINCT oi.order_id) as order_count
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.order_date BETWEEN $1 AND $2
          AND o.status != 'cancelled'
          AND o.archive_status != 'cancelado'
        GROUP BY oi.product_name
        ORDER BY total_revenue DESC
        LIMIT 10
      `, [start, end]),

      // Top clients
      query(`
        SELECT
          c.name as client_name,
          c.city as client_city,
          COUNT(o.id) as order_count,
          SUM(o.total_price) as total_spent
        FROM clients c
        JOIN orders o ON c.id = o.client_id
        WHERE o.order_date BETWEEN $1 AND $2
          AND o.status != 'cancelled'
          AND o.archive_status != 'cancelado'
        GROUP BY c.id, c.name, c.city
        ORDER BY total_spent DESC
        LIMIT 10
      `, [start, end]),

      // Orders by status for pie chart
      query(`
        SELECT
          CASE
            WHEN approval_status = 'pending_review' THEN 'Pendientes'
            WHEN approval_status = 'approved' AND status = 'in_production' THEN 'En Producción'
            WHEN status = 'delivered' THEN 'Entregados'
            WHEN status = 'cancelled' OR archive_status = 'cancelado' THEN 'Cancelados'
            ELSE 'Otros'
          END as status_label,
          COUNT(*) as count,
          COALESCE(SUM(total_price), 0) as revenue
        FROM orders
        WHERE order_date BETWEEN $1 AND $2
        GROUP BY status_label
        ORDER BY count DESC
      `, [start, end]),

      // Product breakdown by category/type
      query(`
        SELECT
          CASE
            WHEN LOWER(oi.product_name) LIKE '%iman%' OR LOWER(oi.product_name) LIKE '%imán%' THEN 'Imanes'
            WHEN LOWER(oi.product_name) LIKE '%llavero%' THEN 'Llaveros'
            WHEN LOWER(oi.product_name) LIKE '%destapador%' THEN 'Destapadores'
            WHEN LOWER(oi.product_name) LIKE '%boton%' OR LOWER(oi.product_name) LIKE '%botón%' THEN 'Botones'
            WHEN LOWER(oi.product_name) LIKE '%pin%' THEN 'Pines'
            ELSE 'Otros'
          END as category,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.line_total) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.order_date BETWEEN $1 AND $2
          AND o.status != 'cancelled'
          AND o.archive_status != 'cancelado'
        GROUP BY category
        ORDER BY total_revenue DESC
      `, [start, end]),

      // Revenue by city
      query(`
        SELECT
          COALESCE(c.city, 'Sin Ciudad') as city,
          COUNT(o.id) as order_count,
          SUM(o.total_price) as total_revenue
        FROM orders o
        LEFT JOIN clients c ON o.client_id = c.id
        WHERE o.order_date BETWEEN $1 AND $2
          AND o.status != 'cancelled'
          AND o.archive_status != 'cancelado'
        GROUP BY c.city
        ORDER BY total_revenue DESC
        LIMIT 10
      `, [start, end])
    ]);

    // Calculate comparison with previous period
    const periodDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);

    const prevRevenueResult = await query(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COALESCE(SUM(profit), 0) as total_profit
      FROM orders
      WHERE order_date BETWEEN $1 AND $2
        AND status != 'cancelled'
        AND archive_status != 'cancelado'
    `, [prevStart, prevEnd]);

    const currentRevenue = parseFloat(revenueData.rows[0].total_revenue) || 0;
    const prevRevenue = parseFloat(prevRevenueResult.rows[0].total_revenue) || 0;
    const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100) : 0;

    const currentOrders = parseInt(revenueData.rows[0].order_count) || 0;
    const prevOrders = parseInt(prevRevenueResult.rows[0].order_count) || 0;
    const ordersChange = prevOrders > 0 ? ((currentOrders - prevOrders) / prevOrders * 100) : 0;

    res.json({
      success: true,
      data: {
        dateRange: { start, end },
        summary: {
          totalRevenue: currentRevenue,
          totalOrders: currentOrders,
          totalProfit: parseFloat(revenueData.rows[0].total_profit) || 0,
          avgOrderValue: parseFloat(revenueData.rows[0].avg_order_value) || 0,
          avgProfitMargin: parseFloat(revenueData.rows[0].avg_profit_margin) || 0,
          revenueChange: parseFloat(revenueChange.toFixed(1)),
          ordersChange: parseFloat(ordersChange.toFixed(1))
        },
        dailyRevenue: dailyRevenue.rows.map(r => ({
          date: r.date,
          revenue: parseFloat(r.revenue),
          profit: parseFloat(r.profit),
          orderCount: parseInt(r.order_count)
        })),
        topProducts: topProducts.rows.map(r => ({
          productName: r.product_name,
          quantity: parseInt(r.total_quantity),
          revenue: parseFloat(r.total_revenue),
          orderCount: parseInt(r.order_count)
        })),
        topClients: topClients.rows.map(r => ({
          clientName: r.client_name,
          city: r.client_city,
          orderCount: parseInt(r.order_count),
          totalSpent: parseFloat(r.total_spent)
        })),
        ordersByStatus: ordersByStatus.rows.map(r => ({
          status: r.status_label,
          count: parseInt(r.count),
          revenue: parseFloat(r.revenue)
        })),
        productBreakdown: productBreakdown.rows.map(r => ({
          category: r.category,
          quantity: parseInt(r.total_quantity),
          revenue: parseFloat(r.total_revenue)
        })),
        revenueByCity: revenueByCity.rows.map(r => ({
          city: r.city,
          orderCount: parseInt(r.order_count),
          revenue: parseFloat(r.total_revenue)
        }))
      }
    });
  } catch (error) {
    logError('analytics.dashboard.error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

/**
 * GET /api/analytics/products/:productName
 * Get detailed analytics for a specific product
 */
router.get('/analytics/products/:productName', async (req, res) => {
  try {
    const { productName } = req.params;
    const { startDate, endDate } = req.query;

    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 90);
    }

    // Get product sales over time
    const salesOverTime = await query(`
      SELECT
        o.order_date::date as date,
        SUM(oi.quantity) as quantity,
        SUM(oi.line_total) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_name ILIKE $1
        AND o.order_date BETWEEN $2 AND $3
        AND o.status != 'cancelled'
      GROUP BY o.order_date::date
      ORDER BY o.order_date::date ASC
    `, [`%${productName}%`, start, end]);

    // Get quantity breakdown (how many pieces per order typically)
    const quantityDistribution = await query(`
      SELECT
        CASE
          WHEN oi.quantity <= 50 THEN '1-50 pzas'
          WHEN oi.quantity <= 100 THEN '51-100 pzas'
          WHEN oi.quantity <= 200 THEN '101-200 pzas'
          WHEN oi.quantity <= 500 THEN '201-500 pzas'
          ELSE '500+ pzas'
        END as range,
        COUNT(*) as order_count,
        SUM(oi.quantity) as total_quantity
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_name ILIKE $1
        AND o.order_date BETWEEN $2 AND $3
        AND o.status != 'cancelled'
      GROUP BY range
      ORDER BY MIN(oi.quantity)
    `, [`%${productName}%`, start, end]);

    res.json({
      success: true,
      data: {
        productName,
        dateRange: { start, end },
        salesOverTime: salesOverTime.rows,
        quantityDistribution: quantityDistribution.rows
      }
    });
  } catch (error) {
    logError('analytics.products.detail.error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Generate and send daily report
router.post('/reports/daily/send', async (req, res) => {
  try {
    const date = req.body.date ? new Date(req.body.date) : new Date();
    const result = await analyticsAgent.scheduler.triggerDailyReport(date);

    res.json({
      success: true,
      message: 'Daily report sent successfully',
      data: result
    });
  } catch (error) {
    logError('analytics.reports.daily.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Generate and send monthly report
router.post('/reports/monthly/send', async (req, res) => {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year and month are required'
      });
    }

    const result = await analyticsAgent.scheduler.triggerMonthlyReport(year, month);

    res.json({
      success: true,
      message: 'Monthly report sent successfully',
      data: result
    });
  } catch (error) {
    logError('analytics.reports.monthly.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get scheduled jobs info
router.get('/reports/schedule', (req, res) => {
  try {
    const jobs = analyticsAgent.scheduler.getScheduledJobs();

    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    logError('analytics.reports.schedule.error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Test email configuration
router.post('/test/email', async (req, res) => {
  try {
    const to = req.body.to || process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'test@example.com';
    const result = await sendEmail({
      to,
      subject: 'AXKAN Test Email',
      html: '<div style="font-family:Arial;padding:20px;"><h2 style="color:#E72A88;">AXKAN Email Test</h2><p>If you see this, email is working correctly.</p></div>'
    });
    res.json({ success: true, to, ...result });
  } catch (error) {
    logError('analytics.test.email.error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Test receipt email with sample data + branded PDF attachment
router.post('/test/receipt-email', async (req, res) => {
  try {
    const to = req.body.to || process.env.ADMIN_EMAIL || 'test@example.com';

    // Generate a branded PDF receipt
    const pdfResult = await generateBrandedReceipt({
      clientName: 'Cliente de Prueba',
      projectName: 'Souvenirs Boda Cancún',
      items: [
        { product: 'Imanes MDF', size: 'Mediano', quantity: 200, unitPrice: 11 },
        { product: 'Llaveros', size: '', quantity: 100, unitPrice: 10 },
        { product: 'Destapadores', size: '', quantity: 100, unitPrice: 20 }
      ],
      advanceAmount: 2750,
      receiptType: 'advance',
      paymentMethod: 'Transferencia SPEI'
    });

    const result = await sendReceiptEmail(
      {
        orderNumber: 'AXK42',
        orderDate: new Date(),
        totalPrice: 5500,
        actualDepositAmount: 2750,
        remainingBalance: 2750,
        eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        items: [
          { quantity: 200, productName: 'Imanes MDF Mediano', lineTotal: 2200 },
          { quantity: 100, productName: 'Llaveros', lineTotal: 1000 },
          { quantity: 100, productName: 'Destapadores', lineTotal: 2000 }
        ]
      },
      { name: 'Cliente de Prueba', email: to },
      pdfResult.filepath
    );
    res.json({ success: true, to, ...result });
  } catch (error) {
    logError('analytics.test.receipt-email.error', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
