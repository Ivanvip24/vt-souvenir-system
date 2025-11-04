import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { testConnection, query } from '../shared/database.js';
import * as notionAgent from '../agents/notion-agent/index.js';
import * as notionSync from '../agents/notion-agent/sync.js';
import * as analyticsAgent from '../agents/analytics-agent/index.js';
import { getDateRange } from '../shared/utils.js';
import clientRoutes from './client-routes.js';
import inventoryRoutes from './inventory-routes.js';
import adminRoutes from './admin-routes.js';
import priceRoutes from './price-routes.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================================
// HEALTH CHECK
// ========================================

app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();

  res.json({
    status: 'ok',
    service: 'Souvenir Management System',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// CLIENT-FACING ROUTES
// ========================================
app.use('/api/client', clientRoutes);

// ========================================
// ADMIN AUTHENTICATION ROUTES
// ========================================
app.use('/api/admin', adminRoutes);

// ========================================
// INVENTORY MANAGEMENT ROUTES
// ========================================
app.use('/api/inventory', inventoryRoutes);

// ========================================
// PRICE TRACKING & ANALYTICS ROUTES
// ========================================
app.use('/api/prices', priceRoutes);

// ========================================
// NOTION AGENT ENDPOINTS
// ========================================

// Create order in Notion and local database
app.post('/api/orders', async (req, res) => {
  try {
    const result = await notionSync.createOrderBothSystems(req.body);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get orders with filters - Query PostgreSQL directly
app.get('/api/orders', async (req, res) => {
  try {
    console.log('🔍 Querying orders from PostgreSQL...');

    // Build WHERE clause based on filters
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (req.query.status) {
      conditions.push(`o.status = $${paramIndex++}`);
      params.push(req.query.status);
    }

    if (req.query.department) {
      conditions.push(`o.department = $${paramIndex++}`);
      params.push(req.query.department);
    }

    if (req.query.client) {
      conditions.push(`c.name ILIKE $${paramIndex++}`);
      params.push(`%${req.query.client}%`);
    }

    if (req.query.from) {
      conditions.push(`o.order_date >= $${paramIndex++}`);
      params.push(req.query.from);
    }

    if (req.query.to) {
      conditions.push(`o.order_date <= $${paramIndex++}`);
      params.push(req.query.to);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Query orders with client info and items
    const result = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.event_type,
        o.event_date,
        o.client_notes,
        o.subtotal,
        o.total_price,
        o.total_production_cost,
        o.deposit_amount,
        o.deposit_paid,
        o.payment_method,
        o.approval_status,
        o.status,
        o.department,
        o.priority,
        o.shipping_label_generated,
        o.tracking_number,
        o.delivery_date,
        o.notes,
        o.internal_notes,
        o.notion_page_id,
        o.notion_page_url,
        o.created_at,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.address as client_address,
        c.city as client_city,
        c.state as client_state,
        json_agg(
          json_build_object(
            'id', oi.id,
            'productId', oi.product_id,
            'productName', oi.product_name,
            'quantity', oi.quantity,
            'unitPrice', oi.unit_price,
            'unitCost', oi.unit_cost,
            'lineTotal', oi.line_total,
            'lineCost', oi.line_cost,
            'lineProfit', oi.line_profit
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id, c.name, c.phone, c.email, c.address, c.city, c.state
      ORDER BY o.created_at DESC
    `, params);

    // Transform data to match frontend expectations
    const orders = result.rows.map(order => ({
      id: order.id.toString(),
      orderNumber: order.order_number,
      orderDate: order.order_date,
      eventDate: order.event_date,
      eventType: order.event_type,
      // Client info
      clientName: order.client_name || '',
      clientPhone: order.client_phone || '',
      clientEmail: order.client_email || '',
      clientAddress: order.client_address || '',
      clientCity: order.client_city || '',
      clientState: order.client_state || '',
      // Financial
      totalPrice: parseFloat(order.total_price) || 0,
      productionCost: parseFloat(order.total_production_cost) || 0,
      profit: parseFloat(order.total_price) - parseFloat(order.total_production_cost),
      profitMargin: order.total_price > 0
        ? ((parseFloat(order.total_price) - parseFloat(order.total_production_cost)) / parseFloat(order.total_price) * 100).toFixed(2)
        : 0,
      depositAmount: parseFloat(order.deposit_amount) || 0,
      depositPaid: order.deposit_paid || false,
      paymentMethod: order.payment_method || '',
      // Status
      status: order.status || 'new',
      approvalStatus: order.approval_status || 'pending_review',
      department: order.department || 'pending',
      priority: order.priority || 'normal',
      // Items
      items: order.items || [],
      // Notes
      notes: order.notes || order.client_notes || '',
      clientNotes: order.client_notes || '',
      internalNotes: order.internal_notes || '',
      // Shipping
      shippingLabelGenerated: order.shipping_label_generated || false,
      trackingNumber: order.tracking_number || '',
      deliveryDate: order.delivery_date,
      // Notion sync
      notionPageId: order.notion_page_id,
      notionPageUrl: order.notion_page_url,
      // Summary for compatibility
      summary: order.client_notes || ''
    }));

    console.log(`✅ Found ${orders.length} orders in PostgreSQL`);

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    console.error('Error querying orders:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single order
app.get('/api/orders/:pageId', async (req, res) => {
  try {
    const result = await notionAgent.getOrder(req.params.pageId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// Update order status
app.patch('/api/orders/:orderId/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const result = await notionSync.syncStatusToNotion(
      parseInt(req.params.orderId),
      status
    );

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sync order to Notion
app.post('/api/orders/:orderId/sync', async (req, res) => {
  try {
    const result = await notionSync.syncOrderToNotion(parseInt(req.params.orderId));

    res.json({
      success: true,
      message: 'Order synced to Notion successfully',
      data: result
    });
  } catch (error) {
    console.error('Error syncing order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk sync orders to Notion
app.post('/api/orders/sync/bulk', async (req, res) => {
  try {
    const limit = req.body.limit || 100;
    const result = await notionSync.syncAllOrdersToNotion(limit);

    res.json({
      success: true,
      message: 'Bulk sync completed',
      data: result
    });
  } catch (error) {
    console.error('Error in bulk sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Approve order
app.post('/api/orders/:orderId/approve', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    console.log(`✅ Approving order ${orderId}...`);

    // Update order status in database
    await query(
      `UPDATE orders
       SET approval_status = 'approved',
           status = 'in_production'
       WHERE id = $1`,
      [orderId]
    );

    // Sync to Notion if needed
    try {
      await notionSync.syncOrderToNotion(orderId);
    } catch (notionError) {
      console.error('Failed to sync approval to Notion:', notionError);
    }

    console.log(`✅ Order ${orderId} approved successfully`);

    res.json({
      success: true,
      message: 'Order approved successfully'
    });
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reject order
app.post('/api/orders/:orderId/reject', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { reason } = req.body;

    console.log(`❌ Rejecting order ${orderId}...`);

    // Update order status in database
    await query(
      `UPDATE orders
       SET approval_status = 'rejected',
           status = 'cancelled',
           internal_notes = COALESCE(internal_notes || E'\n\n', '') || 'Rechazado: ' || $2
       WHERE id = $1`,
      [orderId, reason || 'Sin razón especificada']
    );

    // Sync to Notion if needed
    try {
      await notionSync.syncOrderToNotion(orderId);
    } catch (notionError) {
      console.error('Failed to sync rejection to Notion:', notionError);
    }

    console.log(`❌ Order ${orderId} rejected successfully`);

    res.json({
      success: true,
      message: 'Order rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// ANALYTICS AGENT ENDPOINTS
// ========================================

// Get analytics summary
app.get('/api/analytics', async (req, res) => {
  try {
    const periodType = req.query.period || 'this_month';
    const summary = await analyticsAgent.getAnalytics(periodType);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get revenue for specific date range
app.get('/api/analytics/revenue', async (req, res) => {
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
    console.error('Error getting revenue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top products
app.get('/api/analytics/products/top', async (req, res) => {
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
    console.error('Error getting top products:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top clients
app.get('/api/analytics/clients/top', async (req, res) => {
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
    console.error('Error getting top clients:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate and send daily report
app.post('/api/reports/daily/send', async (req, res) => {
  try {
    const date = req.body.date ? new Date(req.body.date) : new Date();
    const result = await analyticsAgent.scheduler.triggerDailyReport(date);

    res.json({
      success: true,
      message: 'Daily report sent successfully',
      data: result
    });
  } catch (error) {
    console.error('Error sending daily report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate and send monthly report
app.post('/api/reports/monthly/send', async (req, res) => {
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
    console.error('Error sending monthly report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scheduled jobs info
app.get('/api/reports/schedule', (req, res) => {
  try {
    const jobs = analyticsAgent.scheduler.getScheduledJobs();

    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('Error getting scheduled jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test email configuration
app.post('/api/test/email', async (req, res) => {
  try {
    const result = await analyticsAgent.emailSender.testEmailConfig();

    res.json(result);
  } catch (error) {
    console.error('Error testing email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// FRONTEND ROUTES (Serve HTML pages)
// ========================================

// Serve static frontend files
const frontendPath = path.join(__dirname, '../../frontend');
app.use('/order', express.static(path.join(frontendPath, 'client-order-form')));
app.use('/admin', express.static(path.join(frontendPath, 'admin-dashboard')));

// Root redirect to order form
app.get('/', (req, res) => {
  res.redirect('/order');
});

// Admin login redirect (handle /admin/login without .html extension)
app.get('/admin/login', (req, res) => {
  res.redirect('/admin/login.html');
});

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ========================================
// SERVER STARTUP
// ========================================

async function startServer() {
  try {
    console.log('\n🚀 Starting Souvenir Management System...\n');

    // Test database connection
    console.log('📊 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('⚠️  Warning: Database connection failed. Some features may not work.');
    }

    // Initialize Analytics Agent (includes scheduler)
    await analyticsAgent.initialize();

    // Start server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📡 API URL: http://localhost:${PORT}`);
      console.log(`💻 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(60) + '\n');

      console.log('📋 Available Endpoints:');
      console.log('  GET  /health');
      console.log('  POST /api/orders');
      console.log('  GET  /api/orders');
      console.log('  GET  /api/orders/:pageId');
      console.log('  PATCH /api/orders/:orderId/status');
      console.log('  POST /api/orders/:orderId/sync');
      console.log('  GET  /api/analytics');
      console.log('  GET  /api/analytics/revenue');
      console.log('  GET  /api/analytics/products/top');
      console.log('  GET  /api/analytics/clients/top');
      console.log('  POST /api/reports/daily/send');
      console.log('  POST /api/reports/monthly/send');
      console.log('  GET  /api/reports/schedule');
      console.log('  POST /api/test/email');
      console.log('  📦 /api/inventory/* (Materials, Alerts, BOM, Forecasting)');
      console.log('  💰 /api/prices/* (Price Tracking, Trends, Margins, Insights)\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT signal, shutting down gracefully...');
  analyticsAgent.scheduler.stopAllJobs();
  process.exit(0);
});

// Start the server
startServer();

export default app;
