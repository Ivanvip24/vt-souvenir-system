import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
import bomRoutes from './bom-routes.js';
import webhookRoutes from './webhook-routes.js';
import uploadRoutes from './upload-routes.js';
import discountRoutes from './discount-routes.js';
import shippingRoutes from './shipping-routes.js';
import receiptRoutes from './receipt-routes.js';
import aiAssistantRoutes from './ai-assistant-routes.js';
import mercadolibreRoutes from './mercadolibre-routes.js';
import employeeRoutes from './employee-routes.js';
import taskRoutes from './task-routes.js';
import galleryRoutes from './gallery-routes.js';
import notesRoutes from './notes-routes.js';
import knowledgeRoutes from './knowledge-routes.js';
import * as knowledgeIndex from '../services/knowledge-index.js';
import * as knowledgeAI from '../services/knowledge-ai.js';
import { generateReceipt, getReceiptUrl } from '../services/pdf-generator.js';
import { onOrderStatusChange } from '../services/task-generator.js';
import { sendReceiptEmail, initializeEmailSender, sendEmail } from '../agents/analytics-agent/email-sender.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';
import { processReceipt } from '../services/receipt-ocr.js';
import { verifyPaymentReceipt, isConfigured as isClaudeConfigured } from '../services/payment-receipt-verifier.js';
import * as orderAlerts from '../agents/alerts/order-alerts.js';
import * as skydropxService from '../services/skydropx.js';
import * as pickupScheduler from '../services/pickup-scheduler.js';
import * as facebookMarketplace from '../services/facebook-marketplace.js';
import * as facebookScheduler from '../services/facebook-scheduler.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS with explicit Authorization header support
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ========================================
// STATIC FILES - Serve PDF Receipts & Payment Proofs
// ========================================
const receiptsPath = path.join(__dirname, '../receipts');
app.use('/receipts', express.static(receiptsPath));
console.log(`📁 Serving receipts from: ${receiptsPath}`);

const paymentReceiptsPath = path.join(__dirname, '../payment-receipts');
app.use('/payment-receipts', express.static(paymentReceiptsPath));
console.log(`📁 Serving payment receipts from: ${paymentReceiptsPath}`);

// Axkan brand assets (knowledge base images) - uses submodule
const axkanPath = process.env.AXKAN_REPO_PATH || path.join(__dirname, '../assets/axkan');
app.use('/axkan-assets', express.static(axkanPath));
console.log(`📁 Serving Axkan assets from: ${axkanPath}`);

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
// BILL OF MATERIALS ROUTES
// ========================================
app.use('/api/bom', bomRoutes);

// ========================================
// MAKE.COM WEBHOOK ROUTES
// ========================================
app.use('/api/webhooks', webhookRoutes);

// ========================================
// DISCOUNTS & SPECIAL CLIENTS ROUTES
// ========================================
app.use('/api/discounts', discountRoutes);

// ========================================
// SHIPPING / GUÍAS ROUTES
// ========================================
app.use('/api/shipping', shippingRoutes);

// ========================================
// FILE UPLOAD ROUTES (Cloudinary)
// ========================================
app.use('/api/client/upload', uploadRoutes);

// ========================================
// SUPPLIER RECEIPT ROUTES (Claude Vision)
// ========================================
app.use('/api/receipts', receiptRoutes);

// ========================================
// AI ASSISTANT ROUTES (Claude Chat)
// ========================================
app.use('/api/ai-assistant', aiAssistantRoutes);

// ========================================
// MERCADO LIBRE INTEGRATION ROUTES
// ========================================
app.use('/api/mercadolibre', mercadolibreRoutes);

// ========================================
// FACEBOOK MARKETPLACE ROUTES
// ========================================

// Get Facebook upload statistics
app.get('/api/facebook/stats', async (req, res) => {
  try {
    const stats = await facebookMarketplace.getUploadStats();
    const schedulerStatus = facebookScheduler.getSchedulerStatus();

    res.json({
      success: true,
      stats,
      scheduler: schedulerStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending uploads
app.get('/api/facebook/pending', async (req, res) => {
  try {
    const pending = await facebookMarketplace.getPendingUploads();
    res.json({ success: true, count: pending.length, data: pending });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Queue a design for Facebook upload
app.post('/api/facebook/queue', async (req, res) => {
  try {
    const { orderId, orderItemId, imageUrl, title } = req.body;

    if (!imageUrl || !title) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl and title are required'
      });
    }

    const result = await facebookMarketplace.queueDesignForUpload(
      orderId, orderItemId, imageUrl, title
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if an image is uploaded to Facebook
app.get('/api/facebook/status', async (req, res) => {
  try {
    const { imageUrl } = req.query;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl query parameter is required'
      });
    }

    const status = await facebookMarketplace.isImageUploaded(imageUrl);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Facebook status for an order
app.get('/api/facebook/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const status = await facebookMarketplace.getOrderFacebookStatus(orderId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending uploads data for local bot to process
app.get('/api/facebook/export', async (req, res) => {
  try {
    const pending = await facebookMarketplace.getPendingUploads();

    if (pending.length === 0) {
      return res.json({ success: true, count: 0, listings: [], message: 'No pending uploads' });
    }

    // Return data for local processing
    res.json({
      success: true,
      count: pending.length,
      listings: pending.map(l => ({
        id: l.id,
        title: l.listing_title,
        imageUrl: l.image_url,
        price: l.listing_price || '11'
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark listings as uploaded (called by local bot after success)
app.post('/api/facebook/mark-uploaded', async (req, res) => {
  try {
    const { listingIds } = req.body;

    if (!listingIds || !Array.isArray(listingIds)) {
      return res.status(400).json({ success: false, error: 'listingIds array required' });
    }

    await facebookMarketplace.markAsUploaded(listingIds);
    res.json({ success: true, marked: listingIds.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// EMPLOYEE DASHBOARD ROUTES
// ========================================
app.use('/api/employees', employeeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/knowledge', knowledgeRoutes);

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
        o.payment_proof_url,
        o.second_payment_proof_url,
        o.receipt_pdf_url,
        o.production_sheet_url,
        o.approval_status,
        o.status,
        o.department,
        o.priority,
        o.shipping_label_generated,
        o.tracking_number,
        o.delivery_date,
        o.production_deadline,
        o.estimated_delivery_date,
        o.shipping_days,
        o.notes,
        o.internal_notes,
        o.order_attachments,
        o.notion_page_id,
        o.notion_page_url,
        o.archive_status,
        o.sales_rep,
        o.created_at,
        o.shipping_cost,
        o.is_store_pickup,
        -- Shipping label data from shipping_labels table
        (SELECT sl.tracking_number FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_tracking_number,
        (SELECT sl.carrier FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_carrier,
        (SELECT sl.service FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_service,
        (SELECT sl.label_url FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_label_url,
        (SELECT sl.delivery_days FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivery_days,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as shipping_labels_count,
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
            'lineProfit', oi.line_profit,
            'notes', oi.notes,
            'attachments', oi.attachments
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
      createdAt: order.created_at, // Add creation timestamp
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
      paymentProofUrl: order.payment_proof_url || null,
      secondPaymentReceipt: order.second_payment_proof_url || null,
      receiptPdfUrl: order.receipt_pdf_url || null,
      productionSheetUrl: order.production_sheet_url || null,
      // Status
      status: order.status || 'new',
      approvalStatus: order.approval_status || 'pending_review',
      department: order.department || 'pending',
      priority: order.priority || 'normal',
      archiveStatus: order.archive_status || 'active',
      // Sales rep from referral link
      salesRep: order.sales_rep || null,
      // Items
      items: order.items || [],
      // Notes and attachments
      notes: order.notes || order.client_notes || '',
      clientNotes: order.client_notes || '',
      internalNotes: order.internal_notes || '',
      orderAttachments: order.order_attachments ? JSON.parse(order.order_attachments) : [],
      // Shipping - prefer shipping_labels table data, fallback to orders table
      shippingLabelGenerated: order.shipping_label_generated || parseInt(order.shipping_labels_count) > 0,
      trackingNumber: order.sl_tracking_number || order.tracking_number || '',
      carrier: order.sl_carrier || '',
      shippingService: order.sl_service || '',
      shippingLabelUrl: order.sl_label_url || '',
      estimatedDeliveryDays: order.sl_delivery_days || null,
      shippingLabelsCount: parseInt(order.shipping_labels_count) || 0,
      deliveryDate: order.delivery_date,
      // Delivery dates (admin only)
      productionDeadline: order.production_deadline,
      estimatedDeliveryDate: order.estimated_delivery_date,
      shippingDays: order.shipping_days || 5,
      // Notion sync
      notionPageId: order.notion_page_id,
      notionPageUrl: order.notion_page_url,
      // Shipping cost and store pickup
      shippingCost: parseFloat(order.shipping_cost) || 0,
      isStorePickup: order.is_store_pickup || false,
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

// Get orders for calendar view with production deadlines
app.get('/api/orders/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;

    // Default to current month if no dates provided
    const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = end || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

    console.log(`📅 Fetching calendar orders from ${startDate} to ${endDate}`);

    const result = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.event_date,
        o.total_price,
        o.status,
        o.production_deadline,
        o.estimated_delivery_date,
        c.name as client_name,
        json_agg(
          json_build_object(
            'quantity', oi.quantity,
            'productName', oi.product_name
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.production_deadline IS NOT NULL
        AND o.production_deadline >= $1
        AND o.production_deadline <= $2
        AND o.status IN ('approved', 'in_production', 'ready', 'shipped')
        AND (o.archive_status IS NULL OR o.archive_status != 'archived')
      GROUP BY o.id, c.name
      ORDER BY o.production_deadline ASC
    `, [startDate, endDate]);

    const orders = result.rows.map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      order_number: order.order_number,
      orderDate: order.order_date,
      eventDate: order.event_date,
      event_date: order.event_date,
      totalPrice: parseFloat(order.total_price) || 0,
      status: order.status,
      productionDeadline: order.production_deadline,
      production_deadline: order.production_deadline,
      estimatedDeliveryDate: order.estimated_delivery_date,
      clientName: order.client_name,
      client_name: order.client_name,
      items: order.items || []
    }));

    console.log(`📅 Found ${orders.length} orders for calendar`);

    res.json({
      success: true,
      data: orders
    });

  } catch (error) {
    console.error('❌ Calendar data error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get capacity info for a date range
app.get('/api/orders/capacity', async (req, res) => {
  try {
    const { start, end } = req.query;
    const dailyCapacity = 2500; // Configurable

    const startDate = start || new Date().toISOString().split('T')[0];
    const endDate = end || new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0];

    console.log(`📊 Calculating capacity from ${startDate} to ${endDate}`);

    // Get total pieces per day
    const result = await query(`
      SELECT
        o.production_deadline::date as deadline_date,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(oi.quantity), 0) as total_pieces
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.production_deadline IS NOT NULL
        AND o.production_deadline >= $1
        AND o.production_deadline <= $2
        AND o.status IN ('approved', 'in_production', 'ready', 'shipped')
        AND (o.archive_status IS NULL OR o.archive_status != 'archived')
      GROUP BY o.production_deadline::date
      ORDER BY deadline_date ASC
    `, [startDate, endDate]);

    const capacityByDay = {};
    result.rows.forEach(row => {
      const dateKey = row.deadline_date.toISOString().split('T')[0];
      const pieces = parseInt(row.total_pieces) || 0;
      capacityByDay[dateKey] = {
        pieces,
        orderCount: parseInt(row.order_count),
        capacityPercent: Math.round((pieces / dailyCapacity) * 100),
        available: Math.max(0, dailyCapacity - pieces)
      };
    });

    res.json({
      success: true,
      dailyCapacity,
      data: capacityByDay
    });

  } catch (error) {
    console.error('❌ Capacity calculation error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Find next available production date with capacity
app.get('/api/orders/next-available-date', async (req, res) => {
  try {
    const { pieces, startDate } = req.query;
    const piecesNeeded = parseInt(pieces) || 100;
    const dailyCapacity = 2500;

    let checkDate = startDate ? new Date(startDate) : new Date();
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      // Skip weekends
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0) {
        checkDate.setDate(checkDate.getDate() + 1);
        continue;
      }
      if (dayOfWeek === 6) {
        checkDate.setDate(checkDate.getDate() + 2);
        continue;
      }

      const dateKey = checkDate.toISOString().split('T')[0];

      // Check existing capacity for this day
      const result = await query(`
        SELECT COALESCE(SUM(oi.quantity), 0) as total_pieces
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.production_deadline::date = $1
          AND o.status IN ('approved', 'in_production', 'ready', 'shipped')
          AND (o.archive_status IS NULL OR o.archive_status != 'archived')
      `, [dateKey]);

      const usedCapacity = parseInt(result.rows[0]?.total_pieces) || 0;
      const availableCapacity = dailyCapacity - usedCapacity;

      if (availableCapacity >= piecesNeeded) {
        return res.json({
          success: true,
          date: dateKey,
          availableCapacity,
          usedCapacity,
          dailyCapacity
        });
      }

      checkDate.setDate(checkDate.getDate() + 1);
      attempts++;
    }

    // Return next business day if no capacity found
    res.json({
      success: true,
      date: checkDate.toISOString().split('T')[0],
      warning: 'No date with full capacity found within 60 days'
    });

  } catch (error) {
    console.error('❌ Next available date error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single order by ID
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    console.log(`🔍 Fetching order ${orderId} from PostgreSQL...`);

    // Query order with client info and items
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
        o.payment_proof_url,
        o.second_payment_proof_url,
        o.receipt_pdf_url,
        o.production_sheet_url,
        o.approval_status,
        o.status,
        o.department,
        o.priority,
        o.shipping_label_generated,
        o.tracking_number,
        o.delivery_date,
        o.production_deadline,
        o.estimated_delivery_date,
        o.shipping_days,
        o.notes,
        o.internal_notes,
        o.order_attachments,
        o.notion_page_id,
        o.notion_page_url,
        o.created_at,
        -- Shipping label data from shipping_labels table
        (SELECT sl.tracking_number FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_tracking_number,
        (SELECT sl.carrier FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_carrier,
        (SELECT sl.service FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_service,
        (SELECT sl.label_url FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_label_url,
        (SELECT sl.delivery_days FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivery_days,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as shipping_labels_count,
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
      WHERE o.id = $1
      GROUP BY o.id, c.name, c.phone, c.email, c.address, c.city, c.state
    `, [orderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = result.rows[0];

    // Transform data to match frontend expectations
    const orderData = {
      id: order.id.toString(),
      orderNumber: order.order_number,
      orderDate: order.order_date,
      eventDate: order.event_date,
      eventType: order.event_type,
      createdAt: order.created_at, // Add creation timestamp
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
      paymentProofUrl: order.payment_proof_url || null,
      secondPaymentReceipt: order.second_payment_proof_url || null,
      receiptPdfUrl: order.receipt_pdf_url || null,
      productionSheetUrl: order.production_sheet_url || null,
      // Status
      status: order.status || 'new',
      approvalStatus: order.approval_status || 'pending_review',
      department: order.department || 'pending',
      priority: order.priority || 'normal',
      archiveStatus: order.archive_status || 'active',
      // Sales rep from referral link
      salesRep: order.sales_rep || null,
      // Items
      items: order.items || [],
      // Notes and attachments
      notes: order.notes || order.client_notes || '',
      clientNotes: order.client_notes || '',
      internalNotes: order.internal_notes || '',
      orderAttachments: order.order_attachments ? JSON.parse(order.order_attachments) : [],
      // Shipping - prefer shipping_labels table data, fallback to orders table
      shippingLabelGenerated: order.shipping_label_generated || parseInt(order.shipping_labels_count) > 0,
      trackingNumber: order.sl_tracking_number || order.tracking_number || '',
      carrier: order.sl_carrier || '',
      shippingService: order.sl_service || '',
      shippingLabelUrl: order.sl_label_url || '',
      estimatedDeliveryDays: order.sl_delivery_days || null,
      shippingLabelsCount: parseInt(order.shipping_labels_count) || 0,
      deliveryDate: order.delivery_date,
      // Delivery dates (admin only)
      productionDeadline: order.production_deadline,
      estimatedDeliveryDate: order.estimated_delivery_date,
      shippingDays: order.shipping_days || 5,
      // Notion sync
      notionPageId: order.notion_page_id,
      notionPageUrl: order.notion_page_url,
      // Summary for compatibility
      summary: order.client_notes || ''
    };

    console.log(`✅ Found order ${orderId}`);

    res.json({
      success: true,
      data: orderData
    });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update order status
app.patch('/api/orders/:orderId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = parseInt(req.params.orderId);

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    // Get current status before updating
    const currentOrder = await query('SELECT status FROM orders WHERE id = $1', [orderId]);
    const oldStatus = currentOrder.rows.length > 0 ? currentOrder.rows[0].status : null;

    const result = await notionSync.syncStatusToNotion(orderId, status);

    // Generate tasks for the new status (if status actually changed)
    let taskResult = null;
    if (oldStatus && oldStatus !== status) {
      try {
        taskResult = await onOrderStatusChange(orderId, oldStatus, status);
        console.log(`📋 Task generation for order ${orderId}: ${taskResult.newTasks.length} new tasks created`);
      } catch (taskError) {
        console.error('Task generation failed (non-blocking):', taskError);
      }
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: result,
      tasks: taskResult
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
    const { actualDepositAmount } = req.body;

    console.log(`✅ Approving order ${orderId} with deposit: $${actualDepositAmount}...`);

    // Validate deposit amount
    if (!actualDepositAmount || actualDepositAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Actual deposit amount is required and must be greater than 0'
      });
    }

    // Fetch full order details with items and client info
    const orderResult = await query(
      `SELECT
        o.*,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email
       FROM orders o
       JOIN clients c ON o.client_id = c.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Validate deposit doesn't exceed total
    if (actualDepositAmount > order.total_price) {
      return res.status(400).json({
        success: false,
        error: 'Deposit amount cannot exceed total order price'
      });
    }

    // Fetch order items
    const itemsResult = await query(
      `SELECT
        oi.*,
        p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const items = itemsResult.rows.map(item => ({
      productName: item.product_name || item.product_name_override || 'Producto',
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
      lineTotal: parseFloat(item.line_total)
    }));

    // Calculate remaining balance
    const remainingBalance = order.total_price - actualDepositAmount;

    // Generate PDF receipt
    console.log('📄 Generating PDF receipt...');
    const pdfPath = await generateReceipt({
      orderNumber: order.order_number,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      clientEmail: order.client_email,
      orderDate: order.order_date,
      items: items,
      totalPrice: parseFloat(order.total_price),
      actualDepositAmount: parseFloat(actualDepositAmount),
      remainingBalance: parseFloat(remainingBalance),
      eventDate: order.event_date,
      shippingCost: parseFloat(order.shipping_cost) || 0,
      isStorePickup: order.is_store_pickup || false
    });

    const receiptUrl = getReceiptUrl(pdfPath);
    console.log(`✅ PDF generated: ${receiptUrl}`);

    // Update order status and payment info in database
    await query(
      `UPDATE orders
       SET approval_status = 'approved',
           status = 'in_production'
       WHERE id = $1`,
      [orderId]
    );

    // Send receipt email to client in background - don't block response
    setImmediate(async () => {
      try {
        console.log('📧 Attempting to send receipt email to client...');
        console.log(`   Client: ${order.client_name}`);
        console.log(`   Email: ${order.client_email}`);
        console.log(`   Order: ${order.order_number}`);
        console.log(`   PDF Path: ${pdfPath}`);

        await sendReceiptEmail(
          {
            orderNumber: order.order_number,
            orderDate: order.order_date,
            totalPrice: parseFloat(order.total_price),
            actualDepositAmount: parseFloat(actualDepositAmount),
            remainingBalance: parseFloat(remainingBalance),
            eventDate: order.event_date
          },
          {
            name: order.client_name,
            email: order.client_email
          },
          pdfPath
        );

        console.log('✅ Receipt email sent successfully to:', order.client_email);

      } catch (emailError) {
        console.error('❌ CRITICAL ERROR sending receipt email:');
        console.error('   Error message:', emailError.message);
        console.error('   Error stack:', emailError.stack);
        console.error('   Client email:', order.client_email);

        // Check if it's an authentication error
        if (emailError.message.includes('authentication') || emailError.message.includes('login')) {
          console.error('⚠️  EMAIL AUTHENTICATION FAILED - Check EMAIL_USER and EMAIL_PASSWORD on Render!');
        }

        // Check if transporter exists
        if (emailError.message.includes('transporter')) {
          console.error('⚠️  EMAIL TRANSPORTER NOT INITIALIZED - Check email service configuration!');
        }
      }
    });

    // Sync to Notion if needed
    try {
      await notionSync.syncOrderToNotion(orderId);
    } catch (notionError) {
      console.error('Failed to sync approval to Notion:', notionError);
    }

    // Create automatic tasks for the approved order (background)
    setImmediate(async () => {
      try {
        console.log(`📋 Creating automatic tasks for approved order ${order.order_number}...`);

        // Task 1: Diseños
        await query(
          `INSERT INTO tasks (title, description, department, task_type, priority, assigned_to, order_id, status)
           VALUES ($1, $2, 'design', 'order_task', 'normal', NULL, $3, 'pending')`,
          [
            `Diseños - ${order.order_number}`,
            `Crear diseños para el pedido ${order.order_number}.\nCliente: ${order.client_name}\nProductos: ${items.map(i => `${i.productName} (${i.quantity} pzas)`).join(', ')}`,
            orderId
          ]
        );
        console.log(`   ✅ Task created: Diseños - ${order.order_number}`);

        // Task 2: Armado
        await query(
          `INSERT INTO tasks (title, description, department, task_type, priority, assigned_to, order_id, status)
           VALUES ($1, $2, 'design', 'order_task', 'normal', NULL, $3, 'pending')`,
          [
            `Armado - ${order.order_number}`,
            `Armar productos para el pedido ${order.order_number}.\nCliente: ${order.client_name}\nProductos: ${items.map(i => `${i.productName} (${i.quantity} pzas)`).join(', ')}`,
            orderId
          ]
        );
        console.log(`   ✅ Task created: Armado - ${order.order_number}`);

        console.log(`📋 Automatic tasks created successfully for order ${order.order_number}`);
      } catch (taskError) {
        console.error('❌ Failed to create automatic tasks:', taskError.message);
      }
    });

    // NOTE: Shipping labels are NO LONGER auto-generated on approval
    // Instead, the client will:
    // 1. Select their preferred shipping method when uploading second payment
    // 2. Upload the second payment receipt
    // 3. The label is generated with their selected carrier/service

    console.log(`✅ Order ${orderId} approved successfully`);
    console.log(`📦 Shipping label will be generated when client selects shipping and uploads second payment`);

    res.json({
      success: true,
      message: 'Pedido aprobado. El cliente podrá seleccionar su método de envío al subir el segundo pago.',
      receiptUrl: receiptUrl,
      shipping: {
        generated: false,
        note: 'Label will be generated after client selects shipping and uploads second payment'
      }
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

// Upload first payment proof (admin upload)
app.post('/api/orders/:orderId/payment-proof', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { paymentProofUrl } = req.body;

    if (!paymentProofUrl) {
      return res.status(400).json({
        success: false,
        error: 'Payment proof URL is required'
      });
    }

    console.log(`💳 Uploading first payment proof for order ${orderId}: ${paymentProofUrl}`);

    // Update order with payment proof URL
    const result = await query(
      'UPDATE orders SET payment_proof_url = $1, deposit_paid = true WHERE id = $2 RETURNING id, order_number',
      [paymentProofUrl, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log(`✅ First payment proof uploaded for order ${result.rows[0].order_number}`);

    res.json({
      success: true,
      message: 'Payment proof uploaded successfully',
      orderNumber: result.rows[0].order_number
    });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload second payment receipt (for clients)
app.post('/api/orders/:orderId/second-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { paymentProof, paymentProofUrl } = req.body; // Base64 encoded image or Cloudinary URL

    console.log(`💰 Uploading second payment receipt for order ${orderId}...`);

    if (!paymentProof && !paymentProofUrl) {
      return res.status(400).json({
        success: false,
        error: 'Payment proof is required'
      });
    }

    // Verify order exists and has remaining balance
    const orderCheck = await query(
      'SELECT id, order_number, total_price, deposit_amount, approval_status FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderCheck.rows[0];
    const remainingBalance = parseFloat(order.total_price) - parseFloat(order.deposit_amount);

    if (order.approval_status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Order must be approved before uploading second payment'
      });
    }

    if (remainingBalance <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Order has no remaining balance'
      });
    }

    // Upload to Google Drive or save locally, OR use provided Cloudinary URL
    let imageUrl;
    let filename = null;

    if (paymentProofUrl) {
      // Use provided Cloudinary URL (already uploaded)
      imageUrl = paymentProofUrl;
      // Extract filename from Cloudinary URL or use a default
      filename = paymentProofUrl.split('/').pop().split('?')[0];
      console.log(`✅ Using Cloudinary URL: ${imageUrl}`);
    } else if (paymentProof) {
      // Legacy path: upload base64 to Google Drive or local storage
      filename = `second-payment-${order.order_number}-${Date.now()}.jpg`;

      if (isGoogleDriveConfigured()) {
        // Upload to Google Drive
        console.log(`📤 Uploading to Google Drive: ${filename}`);
        const uploadResult = await uploadToGoogleDrive({
          fileData: paymentProof,
          fileName: filename,
          mimeType: 'image/jpeg'
        });

        imageUrl = uploadResult.directImageUrl; // URL that can be used in <img> tags
        console.log(`✅ Uploaded to Google Drive: ${imageUrl}`);
      } else {
        // Fallback to local storage if Google Drive not configured
        console.log('⚠️  Google Drive not configured, saving locally');
        const paymentsDir = path.join(__dirname, '../payment-receipts');
        if (!fs.existsSync(paymentsDir)) {
          fs.mkdirSync(paymentsDir, { recursive: true });
        }

        const filepath = path.join(paymentsDir, filename);
        const base64Data = paymentProof.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

        imageUrl = `/payment-receipts/${filename}`;
        console.log(`✅ Payment proof saved locally: ${filepath}`);
      }
    }

    // Save second payment proof URL to database
    await query(
      'UPDATE orders SET second_payment_proof_url = $1 WHERE id = $2',
      [imageUrl, orderId]
    );

    console.log(`✅ Second payment receipt uploaded and saved to database for order ${orderId}`);

    // AI Verification for second payment
    let verificationResult = null;
    let autoConfirmed = false;
    const expectedAmount = remainingBalance;

    if (isClaudeConfigured()) {
      console.log(`🤖 Starting AI verification for second payment...`);
      console.log(`   Expected amount: $${expectedAmount.toFixed(2)}`);

      try {
        verificationResult = await verifyPaymentReceipt(
          imageUrl,
          expectedAmount,
          order.order_number
        );

        console.log(`📊 AI Verification Result: ${verificationResult.recommendation}`);

        // Build verification summary for notes
        const now = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        let verificationNote = `\n\n--- PAGO FINAL (${now}) ---\n`;
        verificationNote += `Verificación AI: ${verificationResult.recommendation}\n`;

        if (verificationResult.analysis) {
          const analysis = verificationResult.analysis;
          verificationNote += `Monto detectado: $${analysis.amount_detected?.toFixed(2) || 'N/A'}\n`;
          verificationNote += `Monto esperado: $${expectedAmount.toFixed(2)}\n`;
          verificationNote += `Coincide: ${analysis.amount_matches ? 'Sí' : 'No'}\n`;
          verificationNote += `Confianza: ${analysis.confidence_level || 'N/A'}\n`;
          if (analysis.folio_number) verificationNote += `Folio: ${analysis.folio_number}\n`;
          if (analysis.source_bank) verificationNote += `Banco origen: ${analysis.source_bank}\n`;
          if (analysis.date_detected) verificationNote += `Fecha: ${analysis.date_detected}\n`;
          if (analysis.suspicious_indicators && analysis.suspicious_indicators.length > 0) {
            verificationNote += `⚠️ Indicadores: ${analysis.suspicious_indicators.join(', ')}\n`;
          }
          verificationNote += `Notas: ${analysis.notes || 'Ninguna'}\n`;
        }

        // Update internal notes with verification summary
        await query(
          `UPDATE orders SET internal_notes = COALESCE(internal_notes, '') || $1 WHERE id = $2`,
          [verificationNote, orderId]
        );

        // Auto-confirm if AI recommends it
        if (verificationResult.recommendation === 'AUTO_APPROVE') {
          console.log(`✅ AI recommends AUTO_APPROVE for second payment - confirming automatically...`);

          // Update order status to delivered
          await query(`
            UPDATE orders
            SET status = 'delivered'
            WHERE id = $1
          `, [orderId]);

          autoConfirmed = true;
          console.log(`✅ Order ${orderId} second payment AUTO-CONFIRMED by Claude AI!`);

          // Send completion email to client in background
          setImmediate(async () => {
            try {
              // Get full order details for email
              const fullOrderResult = await query(`
                SELECT o.*, c.name as client_name, c.email as client_email
                FROM orders o
                JOIN clients c ON o.client_id = c.id
                WHERE o.id = $1
              `, [orderId]);

              if (fullOrderResult.rows.length > 0) {
                const fullOrder = fullOrderResult.rows[0];

                const emailBody = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; text-align: center;">
                      <h1 style="color: white; margin: 0;">¡Pago Confirmado!</h1>
                    </div>

                    <div style="padding: 30px; background: #f9fafb;">
                      <p style="font-size: 16px; color: #374151;">Hola <strong>${fullOrder.client_name}</strong>,</p>

                      <p style="font-size: 16px; color: #374151;">
                        ¡Excelentes noticias! Hemos confirmado tu pago final para el pedido <strong>${fullOrder.order_number}</strong>.
                      </p>

                      <div style="background: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; color: #065f46; font-weight: 600;">
                          ✅ Tu pedido está completo y listo para entrega
                        </p>
                      </div>

                      <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #059669; margin-top: 0;">Detalles del Pedido:</h3>
                        <p><strong>Número de Pedido:</strong> ${fullOrder.order_number}</p>
                        <p><strong>Total Pagado:</strong> $${parseFloat(fullOrder.total_price).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
                        <p><strong>Estado:</strong> ✅ Completo y Listo</p>
                      </div>

                      <p style="font-size: 16px; color: #374151;">
                        Nos pondremos en contacto contigo pronto para coordinar la entrega de tu pedido.
                      </p>

                      <p style="font-size: 16px; color: #374151;">
                        ¡Gracias por confiar en nosotros!
                      </p>

                      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; font-size: 14px; margin: 0;">
                          ${process.env.COMPANY_NAME || 'VT Anunciando - Souvenirs Personalizados'}
                        </p>
                      </div>
                    </div>
                  </div>
                `;

                await emailService.sendEmail({
                  to: fullOrder.client_email,
                  subject: `¡Pago Final Confirmado! - Pedido ${fullOrder.order_number}`,
                  html: emailBody
                });

                console.log(`📧 Auto-confirmation email sent to ${fullOrder.client_email}`);
              }
            } catch (emailError) {
              console.error('Failed to send auto-confirmation email:', emailError);
            }
          });
        }
      } catch (aiError) {
        console.error('AI verification error (non-fatal):', aiError);
        // Continue without AI verification - manual review will be needed
      }
    }

    res.json({
      success: true,
      message: autoConfirmed
        ? '¡Pago verificado y confirmado automáticamente!'
        : 'Comprobante subido exitosamente. Lo revisaremos pronto.',
      filename: filename,
      imageUrl: imageUrl,
      autoConfirmed: autoConfirmed,
      verification: verificationResult ? {
        recommendation: verificationResult.recommendation,
        amountDetected: verificationResult.analysis?.amount_detected,
        expectedAmount: expectedAmount,
        confidence: verificationResult.analysis?.confidence_level
      } : null
    });
  } catch (error) {
    console.error('Error uploading second payment receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Confirm second payment and complete order
app.post('/api/orders/:orderId/confirm-second-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    console.log(`✅ Confirming second payment for order ${orderId}...`);

    // Get order details for email
    const orderResult = await query(`
      SELECT o.*, c.name as client_name, c.email as client_email
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Update order status to completed
    await query(`
      UPDATE orders
      SET status = 'delivered'
      WHERE id = $1
    `, [orderId]);

    console.log(`✅ Order ${orderId} marked as completed`);

    // Send completion email to client
    try {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">¡Pago Confirmado!</h1>
          </div>

          <div style="padding: 30px; background: #f9fafb;">
            <p style="font-size: 16px; color: #374151;">Hola <strong>${order.client_name}</strong>,</p>

            <p style="font-size: 16px; color: #374151;">
              ¡Excelentes noticias! Hemos confirmado tu pago final para el pedido <strong>${order.order_number}</strong>.
            </p>

            <div style="background: #d1fae5; border-left: 4px solid #059669; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #065f46; font-weight: 600;">
                ✅ Tu pedido está completo y listo para entrega
              </p>
            </div>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Detalles del Pedido:</h3>
              <p><strong>Número de Pedido:</strong> ${order.order_number}</p>
              <p><strong>Total Pagado:</strong> $${parseFloat(order.total_price).toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
              <p><strong>Estado:</strong> Completo y Listo</p>
            </div>

            <p style="font-size: 16px; color: #374151;">
              Nos pondremos en contacto contigo pronto para coordinar la entrega de tu pedido.
            </p>

            <p style="font-size: 16px; color: #374151;">
              ¡Gracias por confiar en nosotros!
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                ${process.env.COMPANY_NAME || 'VT Anunciando - Souvenirs Personalizados'}
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 5px 0 0 0;">
                ${process.env.COMPANY_EMAIL || 'informacion@vtanunciando.com'}
              </p>
            </div>
          </div>
        </div>
      `;

      await emailService.sendEmail({
        to: order.client_email,
        subject: `¡Pago Confirmado! - Pedido ${order.order_number}`,
        html: emailBody
      });

      console.log(`📧 Completion email sent to ${order.client_email}`);
    } catch (emailError) {
      console.error('Failed to send completion email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Second payment confirmed and order completed'
    });

  } catch (error) {
    console.error('Error confirming second payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Archive order (mark as completed or cancelled)
app.post('/api/orders/:orderId/archive', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { archiveStatus } = req.body;

    if (!archiveStatus || !['completo', 'cancelado'].includes(archiveStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid archive status. Must be "completo" or "cancelado"'
      });
    }

    // Update archive status in database
    await query(`
      UPDATE orders
      SET archive_status = $1
      WHERE id = $2
    `, [archiveStatus, orderId]);

    console.log(`📦 Order ${orderId} archived as ${archiveStatus}`);

    res.json({
      success: true,
      message: `Order archived as ${archiveStatus}`
    });
  } catch (error) {
    console.error('Error archiving order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// PRODUCTION SHEET UPLOAD/DELETE
// ========================================

/**
 * POST /api/orders/:orderId/production-sheet
 * Upload/save production sheet URL for an order
 */
app.post('/api/orders/:orderId/production-sheet', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { productionSheetUrl } = req.body;

    if (!productionSheetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Production sheet URL is required'
      });
    }

    console.log(`📋 Saving production sheet for order ${orderId}: ${productionSheetUrl}`);

    // Update order with production sheet URL
    const result = await query(
      'UPDATE orders SET production_sheet_url = $1 WHERE id = $2 RETURNING id',
      [productionSheetUrl, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log(`✅ Production sheet saved for order ${orderId}`);

    res.json({
      success: true,
      message: 'Production sheet saved successfully',
      productionSheetUrl
    });
  } catch (error) {
    console.error('Error saving production sheet:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/orders/:orderId/production-sheet
 * Remove production sheet from an order
 */
app.delete('/api/orders/:orderId/production-sheet', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    console.log(`🗑️ Removing production sheet for order ${orderId}`);

    const result = await query(
      'UPDATE orders SET production_sheet_url = NULL WHERE id = $1 RETURNING id',
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log(`✅ Production sheet removed for order ${orderId}`);

    res.json({
      success: true,
      message: 'Production sheet removed successfully'
    });
  } catch (error) {
    console.error('Error removing production sheet:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// ORDER ITEM NOTES AND ATTACHMENTS
// ========================================

/**
 * PUT /api/orders/:orderId/items/:itemId
 * Update notes and attachments for a specific order item
 */
app.put('/api/orders/:orderId/items/:itemId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);
    const { notes, attachments } = req.body;

    console.log(`📝 Updating item ${itemId} for order ${orderId}:`, { notes, attachments });

    // Verify the item belongs to the order
    const itemCheck = await query(
      'SELECT id FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in this order'
      });
    }

    // Update the item
    const updateResult = await query(`
      UPDATE order_items
      SET notes = $1, attachments = $2
      WHERE id = $3
      RETURNING id, notes, attachments
    `, [notes || null, attachments ? JSON.stringify(attachments) : null, itemId]);

    console.log('✅ Item updated successfully');

    res.json({
      success: true,
      item: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating order item:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/orders/:orderId/items/:itemId/attachment
 * Add an attachment to an order item
 */
app.post('/api/orders/:orderId/items/:itemId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);
    const { url, filename, type } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`📎 Adding attachment to item ${itemId}:`, { url, filename, type });

    // Get current attachments
    const itemResult = await query(
      'SELECT attachments FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in this order'
      });
    }

    // Parse existing attachments or create empty array
    let attachments = [];
    if (itemResult.rows[0].attachments) {
      try {
        attachments = JSON.parse(itemResult.rows[0].attachments);
      } catch (e) {
        attachments = [];
      }
    }

    // Add new attachment
    attachments.push({
      url,
      filename: filename || 'attachment',
      type: type || 'image',
      addedAt: new Date().toISOString()
    });

    // Save updated attachments
    const updateResult = await query(`
      UPDATE order_items
      SET attachments = $1
      WHERE id = $2
      RETURNING id, attachments
    `, [JSON.stringify(attachments), itemId]);

    console.log('✅ Attachment added successfully');

    res.json({
      success: true,
      attachments: JSON.parse(updateResult.rows[0].attachments)
    });

  } catch (error) {
    console.error('Error adding attachment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/orders/:orderId/items/:itemId/attachment
 * Remove an attachment from an order item
 */
app.delete('/api/orders/:orderId/items/:itemId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🗑️ Removing attachment from item ${itemId}:`, url);

    // Get current attachments
    const itemResult = await query(
      'SELECT attachments FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in this order'
      });
    }

    // Parse existing attachments
    let attachments = [];
    if (itemResult.rows[0].attachments) {
      try {
        attachments = JSON.parse(itemResult.rows[0].attachments);
      } catch (e) {
        attachments = [];
      }
    }

    // Remove the attachment
    attachments = attachments.filter(a => a.url !== url);

    // Save updated attachments
    const updateResult = await query(`
      UPDATE order_items
      SET attachments = $1
      WHERE id = $2
      RETURNING id, attachments
    `, [attachments.length > 0 ? JSON.stringify(attachments) : null, itemId]);

    console.log('✅ Attachment removed successfully');

    res.json({
      success: true,
      attachments: updateResult.rows[0].attachments ? JSON.parse(updateResult.rows[0].attachments) : []
    });

  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// ORDER-LEVEL NOTES AND ATTACHMENTS
// ========================================

/**
 * PUT /api/orders/:orderId/notes
 * Update internal notes for an order
 */
app.put('/api/orders/:orderId/notes', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { internalNotes } = req.body;

    console.log(`📝 Updating internal notes for order ${orderId}`);

    const updateResult = await query(`
      UPDATE orders
      SET internal_notes = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, internal_notes
    `, [internalNotes || null, orderId]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log('✅ Order notes updated successfully');

    res.json({
      success: true,
      internalNotes: updateResult.rows[0].internal_notes
    });

  } catch (error) {
    console.error('Error updating order notes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/orders/:orderId/attachment
 * Add an attachment to an order
 */
app.post('/api/orders/:orderId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { url, filename, type } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`📎 Adding attachment to order ${orderId}:`, { url, filename, type });

    // Get current attachments
    const orderResult = await query(
      'SELECT order_attachments FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Parse existing attachments or create empty array
    let attachments = [];
    if (orderResult.rows[0].order_attachments) {
      try {
        attachments = JSON.parse(orderResult.rows[0].order_attachments);
      } catch (e) {
        attachments = [];
      }
    }

    // Add new attachment
    attachments.push({
      url,
      filename: filename || 'attachment',
      type: type || 'image',
      addedAt: new Date().toISOString()
    });

    // Save updated attachments
    const updateResult = await query(`
      UPDATE orders
      SET order_attachments = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, order_attachments
    `, [JSON.stringify(attachments), orderId]);

    console.log('✅ Attachment added successfully');

    res.json({
      success: true,
      attachments: JSON.parse(updateResult.rows[0].order_attachments)
    });

  } catch (error) {
    console.error('Error adding attachment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/orders/:orderId/attachment
 * Remove an attachment from an order
 */
app.delete('/api/orders/:orderId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log(`🗑️ Removing attachment from order ${orderId}:`, url);

    // Get current attachments
    const orderResult = await query(
      'SELECT order_attachments FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Parse existing attachments
    let attachments = [];
    if (orderResult.rows[0].order_attachments) {
      try {
        attachments = JSON.parse(orderResult.rows[0].order_attachments);
      } catch (e) {
        attachments = [];
      }
    }

    // Remove the attachment
    attachments = attachments.filter(a => a.url !== url);

    // Save updated attachments
    const updateResult = await query(`
      UPDATE orders
      SET order_attachments = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, order_attachments
    `, [attachments.length > 0 ? JSON.stringify(attachments) : null, orderId]);

    console.log('✅ Attachment removed successfully');

    res.json({
      success: true,
      attachments: updateResult.rows[0].order_attachments ? JSON.parse(updateResult.rows[0].order_attachments) : []
    });

  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// REGENERATE PDF RECEIPT ON-DEMAND
// ========================================
// This endpoint regenerates a PDF receipt for an order
// Useful when the original file is lost (e.g., after server redeploy on Render)
app.get('/api/orders/:orderId/receipt/download', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    console.log(`📄 Regenerating receipt for order ${orderId}...`);

    // Get order details with client and items
    const orderResult = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.total_price,
        o.deposit_amount,
        o.deposit_paid,
        o.shipping_cost,
        o.is_store_pickup,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsResult = await query(`
      SELECT
        product_name,
        quantity,
        unit_price,
        line_total
      FROM order_items
      WHERE order_id = $1
      ORDER BY id
    `, [orderId]);

    // Calculate actual deposit (what was paid) and remaining balance
    const totalPrice = parseFloat(order.total_price) || 0;
    const depositAmount = parseFloat(order.deposit_amount) || totalPrice * 0.5;
    const actualDepositAmount = order.deposit_paid ? depositAmount : 0;
    const remainingBalance = totalPrice - actualDepositAmount;

    // Prepare data for PDF generation
    const receiptData = {
      orderNumber: order.order_number,
      clientName: order.client_name || 'Cliente',
      clientPhone: order.client_phone || '',
      clientEmail: order.client_email || '',
      orderDate: order.order_date,
      items: itemsResult.rows.map(item => ({
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        lineTotal: parseFloat(item.line_total)
      })),
      totalPrice: totalPrice,
      actualDepositAmount: actualDepositAmount,
      remainingBalance: remainingBalance,
      shippingCost: parseFloat(order.shipping_cost) || 0,
      isStorePickup: order.is_store_pickup || false
    };

    // Generate PDF
    const pdfPath = await generateReceipt(receiptData);

    console.log(`✅ Receipt regenerated: ${pdfPath}`);

    // Send file as download
    res.download(pdfPath, `Recibo-${order.order_number}.pdf`, (err) => {
      if (err) {
        console.error('Error sending PDF:', err);
      }
      // Optionally delete the temp file after sending
      // fs.unlinkSync(pdfPath);
    });

  } catch (error) {
    console.error('Error regenerating receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process receipt with OCR and auto-approve if amount matches
app.post('/api/orders/:orderId/process-receipt', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    console.log(`\n🔍 Processing receipt for order ${orderId}...`);

    // Get order details including deposit receipt URL
    const orderResult = await query(`
      SELECT
        o.id,
        o.order_number,
        o.deposit_amount,
        o.payment_proof_url,
        o.approval_status,
        c.name as client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Validate that order has a receipt
    if (!order.payment_proof_url) {
      return res.status(400).json({
        success: false,
        error: 'No deposit receipt found for this order'
      });
    }

    // Validate that deposit amount exists
    if (!order.deposit_amount || order.deposit_amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Order does not have a valid deposit amount'
      });
    }

    // Process receipt with OCR
    const result = await processReceipt(
      order.payment_proof_url,
      parseFloat(order.deposit_amount)
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        stage: result.stage,
        error: result.error,
        extractedText: result.extractedText
      });
    }

    // If amount matches, auto-approve the order
    if (result.shouldAutoApprove && order.approval_status !== 'approved') {
      await query(`
        UPDATE orders
        SET approval_status = 'approved'
        WHERE id = $1
      `, [orderId]);

      console.log(`✅ Order ${orderId} auto-approved! Amount matches: ${result.extractedAmount}`);

      return res.json({
        success: true,
        autoApproved: true,
        message: 'Receipt processed successfully and order auto-approved',
        ocrResult: {
          extractedAmount: result.extractedAmount,
          expectedAmount: result.expectedAmount,
          validation: result.validation,
          confidence: result.confidence
        }
      });
    }

    // Amount doesn't match or order already approved
    return res.json({
      success: true,
      autoApproved: false,
      message: result.shouldAutoApprove
        ? 'Order was already approved'
        : 'Amount does not match - manual review required',
      ocrResult: {
        extractedAmount: result.extractedAmount,
        expectedAmount: result.expectedAmount,
        validation: result.validation,
        confidence: result.confidence
      }
    });

  } catch (error) {
    console.error('❌ Error processing receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// CLAUDE AI PAYMENT VERIFICATION (Smarter than OCR)
// POST /api/orders/:orderId/verify-payment
// Uses Claude Vision to analyze payment receipts
// ========================================
app.post('/api/orders/:orderId/verify-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    console.log(`\n🤖 Claude AI verifying payment for order ${orderId}...`);

    // Check if Claude is configured
    if (!isClaudeConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Claude AI no está configurado. Falta ANTHROPIC_API_KEY.',
        fallback: 'manual'
      });
    }

    // Get order details
    const orderResult = await query(`
      SELECT
        o.id,
        o.order_number,
        o.order_date,
        o.event_date,
        o.deposit_amount,
        o.total_price,
        o.payment_proof_url,
        o.approval_status,
        o.shipping_cost,
        o.is_store_pickup,
        c.name as client_name,
        c.email as client_email,
        c.phone as client_phone
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Orden no encontrada'
      });
    }

    const order = orderResult.rows[0];

    // Check if order has a receipt
    if (!order.payment_proof_url) {
      return res.status(400).json({
        success: false,
        error: 'No hay comprobante de pago para esta orden'
      });
    }

    // Check if already approved
    if (order.approval_status === 'approved') {
      return res.json({
        success: true,
        verified: true,
        autoApproved: false,
        message: 'La orden ya está aprobada'
      });
    }

    // Calculate expected deposit (use deposit_amount if set, otherwise 50% of total)
    const expectedAmount = order.deposit_amount
      ? parseFloat(order.deposit_amount)
      : parseFloat(order.total_price) * 0.5;

    console.log(`   Order: ${order.order_number}`);
    console.log(`   Client: ${order.client_name}`);
    console.log(`   Expected deposit: $${expectedAmount.toFixed(2)}`);
    console.log(`   Receipt URL: ${order.payment_proof_url}`);

    // Verify with Claude Vision
    const verificationResult = await verifyPaymentReceipt(
      order.payment_proof_url,
      expectedAmount,
      order.order_number
    );

    if (!verificationResult.success) {
      return res.status(500).json({
        success: false,
        error: verificationResult.error || 'Error al verificar el comprobante',
        recommendation: verificationResult.recommendation
      });
    }

    // If Claude recommends auto-approve, do it
    if (verificationResult.recommendation === 'AUTO_APPROVE' && order.approval_status !== 'approved') {
      // Update deposit amount with the detected amount if available
      const detectedAmount = verificationResult.analysis.amount_detected || expectedAmount;

      // Get order items for receipt
      const itemsResult = await query(`
        SELECT
          oi.*,
          p.name as product_name
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [orderId]);

      const items = itemsResult.rows.map(item => ({
        productName: item.product_name || item.product_name_override || 'Producto',
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        lineTotal: parseFloat(item.line_total)
      }));

      const remainingBalance = parseFloat(order.total_price) - detectedAmount;

      // Generate PDF receipt
      console.log('📄 Generating PDF receipt for auto-approved order...');
      const pdfPath = await generateReceipt({
        orderNumber: order.order_number,
        clientName: order.client_name,
        clientEmail: order.client_email,
        clientPhone: order.client_phone,
        orderDate: order.order_date,
        items: items,
        totalPrice: parseFloat(order.total_price),
        actualDepositAmount: detectedAmount,
        remainingBalance: remainingBalance,
        eventDate: order.event_date,
        shippingCost: parseFloat(order.shipping_cost) || 0,
        isStorePickup: order.is_store_pickup || false
      });

      const receiptUrl = getReceiptUrl(pdfPath);

      // Update order status
      await query(`
        UPDATE orders
        SET approval_status = 'approved',
            status = 'in_production',
            deposit_amount = $1,
            deposit_paid = true,
            receipt_pdf_url = $2
        WHERE id = $3
      `, [detectedAmount, receiptUrl, orderId]);

      console.log(`✅ Order ${orderId} AUTO-APPROVED by Claude AI!`);
      console.log(`   Detected amount: $${detectedAmount}`);
      console.log(`   Receipt URL: ${receiptUrl}`);

      // Send receipt email to client in background
      setImmediate(async () => {
        try {
          await sendReceiptEmail(
            {
              orderNumber: order.order_number,
              orderDate: order.order_date,
              totalPrice: parseFloat(order.total_price),
              actualDepositAmount: detectedAmount,
              remainingBalance: remainingBalance,
              eventDate: order.event_date
            },
            {
              name: order.client_name,
              email: order.client_email
            },
            pdfPath
          );
          console.log('✅ Receipt email sent to:', order.client_email);
        } catch (emailError) {
          console.error('❌ Failed to send receipt email:', emailError.message);
        }
      });

      // Sync to Notion
      try {
        await notionSync.syncOrderToNotion(orderId);
      } catch (notionError) {
        console.error('Failed to sync to Notion:', notionError);
      }

      // Create automatic tasks for the auto-approved order (background)
      setImmediate(async () => {
        try {
          console.log(`📋 Creating automatic tasks for AI auto-approved order ${order.order_number}...`);

          // Task 1: Diseños
          await query(
            `INSERT INTO tasks (title, description, department, task_type, priority, assigned_to, order_id, status)
             VALUES ($1, $2, 'design', 'order_task', 'normal', NULL, $3, 'pending')`,
            [
              `Diseños - ${order.order_number}`,
              `Crear diseños para el pedido ${order.order_number}.\nCliente: ${order.client_name}\nProductos: ${items.map(i => `${i.productName} (${i.quantity} pzas)`).join(', ')}`,
              orderId
            ]
          );

          // Task 2: Armado
          await query(
            `INSERT INTO tasks (title, description, department, task_type, priority, assigned_to, order_id, status)
             VALUES ($1, $2, 'design', 'order_task', 'normal', NULL, $3, 'pending')`,
            [
              `Armado - ${order.order_number}`,
              `Armar productos para el pedido ${order.order_number}.\nCliente: ${order.client_name}\nProductos: ${items.map(i => `${i.productName} (${i.quantity} pzas)`).join(', ')}`,
              orderId
            ]
          );

          console.log(`📋 Automatic tasks created for AI auto-approved order ${order.order_number}`);
        } catch (taskError) {
          console.error('❌ Failed to create automatic tasks:', taskError.message);
        }
      });

      return res.json({
        success: true,
        verified: true,
        autoApproved: true,
        message: '✅ Comprobante verificado y orden aprobada automáticamente por IA',
        analysis: verificationResult.analysis,
        receiptUrl: receiptUrl,
        detectedAmount: detectedAmount
      });
    }

    // If not auto-approved, return the analysis for manual review
    return res.json({
      success: true,
      verified: verificationResult.verified,
      autoApproved: false,
      message: verificationResult.recommendation_reason,
      recommendation: verificationResult.recommendation,
      analysis: verificationResult.analysis
    });

  } catch (error) {
    console.error('❌ Error in Claude AI verification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// ORDER ALERTS ENDPOINTS
// ========================================

/**
 * GET /api/alerts
 * Get all order alerts categorized by urgency
 */
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await orderAlerts.getOrderAlerts();

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Error getting order alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/summary
 * Get a simple count summary of alerts
 */
app.get('/api/alerts/summary', async (req, res) => {
  try {
    const summary = await orderAlerts.getAlertsSummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting alerts summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/alerts/send-digest
 * Manually trigger the daily digest email
 * Body: { email: "optional-override@email.com" }
 */
app.post('/api/alerts/send-digest', async (req, res) => {
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

    console.log(`✅ Daily digest sent to ${targetEmail}`);

    res.json({
      success: true,
      message: `Daily digest sent to ${targetEmail}`,
      summary: digest.summary
    });
  } catch (error) {
    console.error('Error sending daily digest:', error);
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

// ========================================
// ANALYTICS DASHBOARD ENDPOINTS
// ========================================

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard data with custom date range
 */
app.get('/api/analytics/dashboard', async (req, res) => {
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
    console.error('Error getting dashboard analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/products/:productName
 * Get detailed analytics for a specific product
 */
app.get('/api/analytics/products/:productName', async (req, res) => {
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
    console.error('Error getting product analytics:', error);
    res.status(500).json({ success: false, error: error.message });
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

// Check email environment variables (diagnostic)
app.get('/api/test/email-config', (req, res) => {
  const config = {
    EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'NOT SET',
    EMAIL_USER: process.env.EMAIL_USER || 'NOT SET',
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? `SET (${process.env.EMAIL_PASSWORD.length} chars)` : 'NOT SET',
    COMPANY_NAME: process.env.COMPANY_NAME || 'NOT SET',
    COMPANY_EMAIL: process.env.COMPANY_EMAIL || 'NOT SET',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'NOT SET',
  };

  console.log('📋 Email Configuration Check:', config);

  res.json({
    success: true,
    config: config,
    note: 'Gmail App Password should be 16 characters (4 groups of 4). Regular Gmail password will NOT work.'
  });
});

// ========================================
// CLIENTS DATABASE (Admin - Shipping/Envíos)
// ========================================

/**
 * GET /api/clients
 * Get all clients with address information for shipping database
 */
app.get('/api/clients', async (req, res) => {
  try {
    const { search, city, state, hasAddress, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Search filter (name, phone, email, address)
    if (search) {
      conditions.push(`(
        c.name ILIKE $${paramIndex} OR
        c.phone ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.address ILIKE $${paramIndex} OR
        c.city ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // City filter
    if (city) {
      conditions.push(`c.city = $${paramIndex++}`);
      params.push(city);
    }

    // State filter
    if (state) {
      conditions.push(`c.state = $${paramIndex++}`);
      params.push(state);
    }

    // Has address filter
    if (hasAddress === 'true') {
      conditions.push(`(c.address IS NOT NULL AND c.address != '')`);
    } else if (hasAddress === 'false') {
      conditions.push(`(c.address IS NULL OR c.address = '')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(`SELECT COUNT(*) as total FROM clients c ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated clients
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await query(`
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.address,
        c.street,
        c.street_number,
        c.colonia,
        c.city,
        c.state,
        c.postal_code,
        c.reference_notes,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT o.id) as order_count,
        MAX(o.order_date) as last_order_date
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.name ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, parseInt(limit), offset]);

    // Get unique cities and states for filters
    const citiesResult = await query(`
      SELECT DISTINCT city FROM clients WHERE city IS NOT NULL AND city != '' ORDER BY city
    `);
    const statesResult = await query(`
      SELECT DISTINCT state FROM clients WHERE state IS NOT NULL AND state != '' ORDER BY state
    `);

    // Get stats
    const statsResult = await query(`
      SELECT
        COUNT(*) as total_clients,
        COUNT(CASE WHEN address IS NOT NULL AND address != '' THEN 1 END) as with_address,
        COUNT(DISTINCT city) as unique_cities
      FROM clients
    `);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        cities: citiesResult.rows.map(r => r.city),
        states: statesResult.rows.map(r => r.state)
      },
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/clients/:id
 * Get single client by ID
 */
app.get('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        c.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'orderNumber', o.order_number,
            'orderDate', o.order_date,
            'totalPrice', o.total_price,
            'status', o.status
          ) ORDER BY o.order_date DESC
        ) FILTER (WHERE o.id IS NOT NULL) as orders
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/clients
 * Create a new client
 */
app.post('/api/clients', async (req, res) => {
  try {
    const { name, phone, email, address, city, state, postal_code } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const result = await query(`
      INSERT INTO clients (name, phone, email, address, city, state, postal_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, phone || null, email || null, address || null, city || null, state || null, postal_code || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/clients/:id
 * Update a client
 */
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, street, street_number, colonia, city, state, postal_code, reference_notes } = req.body;

    const result = await query(`
      UPDATE clients
      SET name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          email = COALESCE($3, email),
          street = COALESCE($4, street),
          street_number = COALESCE($5, street_number),
          colonia = COALESCE($6, colonia),
          city = COALESCE($7, city),
          state = COALESCE($8, state),
          postal_code = COALESCE($9, postal_code),
          reference_notes = COALESCE($10, reference_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [name, phone, email, street, street_number, colonia, city, state, postal_code, reference_notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/clients/:id
 * Delete a client (sets client_id to NULL on orders if any exist)
 */
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // First, unlink any orders from this client (set client_id to NULL)
    await query('UPDATE orders SET client_id = NULL WHERE client_id = $1', [id]);

    // Then delete the client
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================
// FRONTEND ROUTES (Redirect to Frontend Service)
// ========================================

// Frontend service URL (static site on Render)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vt-souvenir-frontend.onrender.com';

// Redirect admin routes to frontend service
app.get('/admin', (req, res) => {
  res.redirect(`${FRONTEND_URL}/admin-dashboard/`);
});
app.get('/admin/*', (req, res) => {
  const path = req.params[0] || '';
  res.redirect(`${FRONTEND_URL}/admin-dashboard/${path}`);
});

// Root redirect to admin dashboard
app.get('/', (req, res) => {
  res.redirect(`${FRONTEND_URL}/admin-dashboard/`);
});

// ========================================
// ERROR HANDLER MIDDLEWARE
// ========================================

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

    // Initialize Email Service
    console.log('📧 Initializing email service...');
    const emailInitialized = initializeEmailSender();
    if (emailInitialized) {
      console.log('✅ Email service initialized successfully');
    } else {
      console.error('⚠️  Warning: Email service initialization failed. Emails will not be sent.');
    }

    // Initialize Analytics Agent (includes scheduler)
    await analyticsAgent.initialize();

    // Initialize Pickup Scheduler (daily pickup requests)
    pickupScheduler.initializePickupScheduler();

    // Initialize Facebook Marketplace Scheduler (daily at 9 AM)
    await facebookScheduler.initFacebookScheduler();

    // Ensure is_store_pickup column exists (for store pickup feature)
    try {
      await query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS is_store_pickup BOOLEAN DEFAULT FALSE
      `);
      console.log('✅ Store pickup column ready');
    } catch (err) {
      console.warn('⚠️  Store pickup column migration:', err.message);
    }

    // Build Knowledge Base Index
    console.log('📚 Building knowledge base index...');
    try {
      await knowledgeIndex.buildIndex();
      console.log('✅ Knowledge base indexed successfully');
    } catch (kbError) {
      console.warn('⚠️  Warning: Knowledge base indexing failed:', kbError.message);
    }

    // Run startup migrations
    console.log('🔄 Running startup migrations...');
    try {
      // Allow NULL order_id in shipping_labels (for client-only labels)
      await query(`
        ALTER TABLE shipping_labels
        ALTER COLUMN order_id DROP NOT NULL
      `);
      console.log('   ✅ shipping_labels.order_id is now nullable');
    } catch (migrationError) {
      // Ignore if already nullable or table doesn't exist
      if (!migrationError.message.includes('already')) {
        console.log('   ℹ️  Migration skipped:', migrationError.message.split('\n')[0]);
      }
    }

    // Load AI Knowledge Content
    console.log('🤖 Loading AI knowledge content...');
    try {
      await knowledgeAI.loadBrandContent();
      console.log('✅ AI knowledge content loaded successfully');
    } catch (aiError) {
      console.warn('⚠️  Warning: AI knowledge loading failed:', aiError.message);
    }

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
      console.log('  💰 /api/prices/* (Price Tracking, Trends, Margins, Insights)');
      console.log('  🔧 /api/bom/* (Bill of Materials, Components, Cost Calculations)\n');
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
