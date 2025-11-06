import express from 'express';
import { query } from '../shared/database.js';

const router = express.Router();

// Security: Webhook secret for Make.com authentication
const WEBHOOK_SECRET = process.env.MAKE_WEBHOOK_SECRET || 'change-this-in-production';

// Middleware to verify webhook authenticity
function verifyWebhookSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;

  if (secret !== WEBHOOK_SECRET) {
    console.warn('⚠️ Unauthorized webhook attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// ========================================
// WEBHOOK: Get Pending Orders (for reminders)
// ========================================
// Make.com can call this daily to check orders needing follow-up
router.get('/pending-orders', verifyWebhookSecret, async (req, res) => {
  try {
    const { days_until_event, status } = req.query;

    let queryStr = `
      SELECT
        o.id,
        o.order_number,
        o.client_name,
        o.client_phone,
        o.client_email,
        o.event_date,
        o.total_price,
        o.actual_deposit_amount,
        o.remaining_balance,
        o.status,
        o.created_at,
        DATE(o.event_date) - CURRENT_DATE as days_until_event
      FROM orders o
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      queryStr += ` AND o.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (days_until_event) {
      queryStr += ` AND DATE(o.event_date) - CURRENT_DATE <= $${paramCount}`;
      params.push(parseInt(days_until_event));
      paramCount++;
    }

    queryStr += ` AND o.event_date IS NOT NULL ORDER BY o.event_date ASC`;

    const result = await query(queryStr, params);

    console.log(`📤 Webhook: Returning ${result.rows.length} pending orders`);

    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });

  } catch (error) {
    console.error('❌ Webhook error (pending-orders):', error);
    res.status(500).json({ error: 'Failed to fetch pending orders' });
  }
});

// ========================================
// WEBHOOK: Get Order Details
// ========================================
// Make.com can fetch full order details by order number or ID
router.get('/order/:identifier', verifyWebhookSecret, async (req, res) => {
  try {
    const { identifier } = req.params;

    // Check if identifier is order number or ID
    const isId = !isNaN(identifier);
    const field = isId ? 'id' : 'order_number';

    // Validate field against whitelist to prevent SQL injection
    const allowedFields = ['id', 'order_number'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field' });
    }

    const result = await query(`
      SELECT
        o.*,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.address as client_address
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.${field} = $1
    `, [identifier]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const itemsResult = await query(`
      SELECT * FROM order_items WHERE order_id = $1
    `, [result.rows[0].id]);

    const order = {
      ...result.rows[0],
      items: itemsResult.rows
    };

    console.log(`📤 Webhook: Returning order ${identifier}`);

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('❌ Webhook error (order details):', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ========================================
// WEBHOOK: Get Low Inventory Materials
// ========================================
// Make.com can check inventory levels and alert suppliers
router.get('/low-inventory', verifyWebhookSecret, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        material_name,
        current_quantity,
        minimum_quantity,
        unit_of_measure,
        (minimum_quantity - current_quantity) as shortage_amount
      FROM inventory_materials
      WHERE current_quantity <= minimum_quantity
      ORDER BY (minimum_quantity - current_quantity) DESC
    `);

    console.log(`📤 Webhook: Returning ${result.rows.length} low inventory items`);

    res.json({
      success: true,
      count: result.rows.length,
      materials: result.rows
    });

  } catch (error) {
    console.error('❌ Webhook error (low-inventory):', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// ========================================
// WEBHOOK: Get Daily Analytics
// ========================================
// Make.com can fetch daily stats for Google Sheets
router.get('/analytics/daily', verifyWebhookSecret, async (req, res) => {
  try {
    const { date } = req.query; // Format: YYYY-MM-DD
    const targetDate = date || new Date().toISOString().split('T')[0];

    // Daily revenue
    const revenueResult = await query(`
      SELECT
        COUNT(*) as order_count,
        SUM(total_price) as total_revenue,
        SUM(total_production_cost) as total_cost,
        SUM(profit) as total_profit,
        AVG(profit_margin) as avg_margin
      FROM orders
      WHERE DATE(created_at) = $1
    `, [targetDate]);

    // Top products
    const productsResult = await query(`
      SELECT
        oi.product_name,
        SUM(oi.quantity) as units_sold,
        SUM(oi.line_total) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE DATE(o.created_at) = $1
      GROUP BY oi.product_name
      ORDER BY revenue DESC
      LIMIT 5
    `, [targetDate]);

    // Low margin orders
    const lowMarginResult = await query(`
      SELECT
        order_number,
        client_name,
        profit_margin,
        total_price
      FROM orders
      WHERE DATE(created_at) = $1
        AND profit_margin < 20
      ORDER BY profit_margin ASC
    `, [targetDate]);

    console.log(`📤 Webhook: Returning analytics for ${targetDate}`);

    res.json({
      success: true,
      date: targetDate,
      summary: revenueResult.rows[0],
      top_products: productsResult.rows,
      low_margin_orders: lowMarginResult.rows
    });

  } catch (error) {
    console.error('❌ Webhook error (analytics):', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ========================================
// WEBHOOK: Update Order Status
// ========================================
// Make.com can update order status (e.g., after WhatsApp confirmation)
router.post('/order/:orderId/status', verifyWebhookSecret, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'approved', 'in_production', 'ready', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        valid_statuses: validStatuses
      });
    }

    let queryStr = 'UPDATE orders SET status = $1';
    const params = [status, orderId];

    if (notes) {
      queryStr += ', client_notes = COALESCE(client_notes, \'\') || $3';
      params.push(`\n[${new Date().toISOString()}] ${notes}`);
    }

    queryStr += ' WHERE id = $2 RETURNING *';

    const result = await query(queryStr, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`✅ Webhook: Updated order ${orderId} status to ${status}`);

    res.json({
      success: true,
      order: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Webhook error (update status):', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ========================================
// WEBHOOK: Log External Event
// ========================================
// Make.com can log events like "WhatsApp sent", "Payment received via transfer"
router.post('/log-event', verifyWebhookSecret, async (req, res) => {
  try {
    const { event_type, order_id, description, metadata } = req.body;

    await query(`
      INSERT INTO webhook_events (event_type, order_id, description, metadata, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [event_type, order_id || null, description, JSON.stringify(metadata || {})]);

    console.log(`📝 Webhook: Logged event '${event_type}'`);

    res.json({ success: true });

  } catch (error) {
    // Table might not exist yet, that's OK
    console.warn('⚠️ Could not log webhook event (table may not exist):', error.message);
    res.json({ success: true, warning: 'Event logging not configured' });
  }
});

// ========================================
// WEBHOOK: Get Orders Needing Action
// ========================================
// Returns orders filtered by various criteria for automation
router.get('/orders-filter', verifyWebhookSecret, async (req, res) => {
  try {
    const {
      unpaid_balance,
      no_payment_proof,
      event_soon,
      needs_production
    } = req.query;

    let conditions = ['1=1'];
    const params = [];
    let paramCount = 1;

    if (unpaid_balance === 'true') {
      conditions.push('remaining_balance > 0');
    }

    if (no_payment_proof === 'true') {
      conditions.push('payment_proof_url IS NULL');
    }

    if (event_soon) {
      conditions.push(`DATE(event_date) - CURRENT_DATE <= $${paramCount}`);
      params.push(parseInt(event_soon));
      paramCount++;
    }

    if (needs_production) {
      conditions.push(`status IN ('approved', 'pending')`);
    }

    const result = await query(`
      SELECT
        id,
        order_number,
        client_name,
        client_phone,
        client_email,
        status,
        total_price,
        remaining_balance,
        event_date,
        payment_proof_url,
        created_at
      FROM orders
      WHERE ${conditions.join(' AND ')}
      ORDER BY event_date ASC, created_at DESC
      LIMIT 100
    `, params);

    console.log(`📤 Webhook: Filtered orders (${result.rows.length} results)`);

    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });

  } catch (error) {
    console.error('❌ Webhook error (orders-filter):', error);
    res.status(500).json({ error: 'Failed to filter orders' });
  }
});

// ========================================
// WEBHOOK: Test Endpoint
// ========================================
// Make.com can use this to test connectivity
router.get('/test', verifyWebhookSecret, (req, res) => {
  console.log('🧪 Webhook test called');
  res.json({
    success: true,
    message: 'Webhook endpoint is working!',
    timestamp: new Date().toISOString(),
    server: 'Souvenir Management System'
  });
});

export default router;
