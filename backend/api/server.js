import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { testConnection } from '../shared/database.js';
import * as notionAgent from '../agents/notion-agent/index.js';
import * as notionSync from '../agents/notion-agent/sync.js';
import * as analyticsAgent from '../agents/analytics-agent/index.js';
import { getDateRange } from '../shared/utils.js';
import clientRoutes from './client-routes.js';
import inventoryRoutes from './inventory-routes.js';

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
// INVENTORY MANAGEMENT ROUTES
// ========================================
app.use('/api/inventory', inventoryRoutes);

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

// Get orders with filters
app.get('/api/orders', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      department: req.query.department,
      clientName: req.query.client,
      dateFrom: req.query.from,
      dateTo: req.query.to
    };

    const result = await notionAgent.queryOrders(filters);

    res.json({
      success: true,
      data: result
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
      console.log('  📦 /api/inventory/* (Materials, Alerts, BOM, Forecasting)\n');
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
