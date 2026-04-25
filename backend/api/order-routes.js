/**
 * Order Routes
 * All order CRUD, calendar reminders, item notes/attachments,
 * item modification, and order-level notes/attachments.
 *
 * Extracted from server.js — Playbook S4
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../shared/database.js';
import * as notionSync from '../agents/notion-agent/sync.js';
import { generateReceipt, getReceiptUrl } from '../services/pdf-generator.js';
import { sendReceiptEmail, sendEmail } from '../agents/analytics-agent/email-sender.js';
import { onOrderStatusChange } from '../services/task-generator.js';
import { uploadToGoogleDrive, isGoogleDriveConfigured } from '../utils/google-drive.js';
import { verifyPaymentReceipt, isConfigured as isClaudeConfigured } from '../services/payment-receipt-verifier.js';
import pushService from '../services/push-notification.js';
import { generateReferenceSheet } from '../utils/reference-sheet-generator.js';
import { processReceipt } from '../services/receipt-ocr.js';
import { log, logError } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const reminderRouter = Router();

// ========================================
// NOTION AGENT ENDPOINTS
// ========================================

// Create order in Notion and local database
router.post('/', async (req, res) => {
  try {
    const result = await notionSync.createOrderBothSystems(req.body);

    // Push notification (fire-and-forget)
    pushService.notifyNewOrder(
      result.orderNumber || req.body.orderNumber,
      req.body.clientName,
      req.body.totalPrice
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: result
    });
  } catch (error) {
    logError('order.error-creating-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Quick-entry: create order (DB only, no Notion)
router.post('/quick', async (req, res) => {
  try {
    const result = await notionSync.createOrderBothSystems(req.body, { skipNotion: true });

    // Set deposit_amount, approval_status, sales_rep if provided
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (req.body.depositAmount) {
      updates.push(`deposit_amount = $${paramIdx++}`);
      params.push(req.body.depositAmount);
    }
    if (req.body.status) {
      updates.push(`approval_status = $${paramIdx++}`);
      params.push(req.body.status);
    }
    if (req.body.salesRep) {
      updates.push(`sales_rep = $${paramIdx++}`);
      params.push(req.body.salesRep);
    }

    if (updates.length > 0) {
      params.push(result.orderId);
      await query(
        `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );
    }

    // Fetch the created order number for the response
    const orderRow = await query('SELECT order_number FROM orders WHERE id = $1', [result.orderId]);

    res.status(201).json({
      success: true,
      data: {
        orderId: result.orderId,
        orderNumber: orderRow.rows[0]?.order_number || result.orderNumber
      }
    });
  } catch (error) {
    logError('order.error-creating-quick-order', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Get orders with filters - Query PostgreSQL directly
router.get('/', async (req, res) => {
  try {
    log('info', 'order.querying-orders-from-postgresql');

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
        o.destination,
        -- Shipping label data from shipping_labels table
        (SELECT sl.tracking_number FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_tracking_number,
        (SELECT sl.carrier FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_carrier,
        (SELECT sl.service FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_service,
        (SELECT sl.label_url FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_label_url,
        (SELECT sl.delivery_days FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivery_days,
        (SELECT sl.status FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_shipping_status,
        (SELECT sl.shipped_at FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_shipped_at,
        (SELECT sl.delivered_at FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivered_at,
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
      shippingStatus: order.sl_shipping_status || null,
      shippedAt: order.sl_shipped_at || null,
      deliveredAt: order.sl_delivered_at || null,
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
      // Destination
      destination: order.destination || '',
      // Summary for compatibility
      summary: order.client_notes || ''
    }));

    log('info', 'order.found-orders-in-postgresql');

    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    logError('order.error-querying-orders', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get orders for calendar view with production deadlines
router.get('/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;

    // Default to current month if no dates provided
    const startDate = start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = end || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

    log('info', 'order.fetching-calendar-orders-from-to');

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

    log('info', 'order.found-orders-for-calendar');

    res.json({
      success: true,
      data: orders
    });

  } catch (error) {
    logError('order.calendar-data-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// =====================================================
// CALENDAR REMINDERS API
// =====================================================

// Helper: extract YYYY-MM-DD from a date value (handles Date objects, ISO strings, etc.)
function toDateString(val) {
  if (!val) return null;
  const str = typeof val === 'string' ? val : val.toISOString();
  return str.split('T')[0];
}

// Helper: compute reminder occurrences in a date range
function computeOccurrences(reminder, startDate, endDate) {
  const occurrences = [];
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  const reminderStartStr = toDateString(reminder.start_date);
  const reminderEndStr = reminder.end_date ? toDateString(reminder.end_date) : null;
  const reminderStart = new Date(reminderStartStr + 'T12:00:00');
  const reminderEnd = reminderEndStr ? new Date(reminderEndStr + 'T12:00:00') : null;

  if (reminder.recurrence_type === 'once') {
    if (reminderStart >= start && reminderStart <= end) {
      occurrences.push(reminderStartStr);
    }
    return occurrences;
  }

  let intervalDays;
  if (reminder.recurrence_type === 'weekly') intervalDays = 7;
  else if (reminder.recurrence_type === 'biweekly') intervalDays = 14;
  else if (reminder.recurrence_type === 'monthly') intervalDays = null; // handled separately
  else return occurrences;

  if (intervalDays) {
    // For weekly/biweekly: find first occurrence >= start of range
    const daysDiff = Math.floor((start - reminderStart) / (1000 * 60 * 60 * 24));
    let firstOffset = 0;
    if (daysDiff > 0) {
      firstOffset = Math.ceil(daysDiff / intervalDays) * intervalDays;
    }

    let current = new Date(reminderStart);
    current.setDate(current.getDate() + firstOffset);

    while (current <= end) {
      if (current >= start && (!reminderEnd || current <= reminderEnd)) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        occurrences.push(`${y}-${m}-${d}`);
      }
      current.setDate(current.getDate() + intervalDays);
    }
  } else {
    // Monthly: same day each month
    const dayOfMonth = reminderStart.getDate();
    let current = new Date(start.getFullYear(), start.getMonth(), dayOfMonth, 12);
    if (current < start) current.setMonth(current.getMonth() + 1);

    while (current <= end) {
      if (current >= reminderStart && (!reminderEnd || current <= reminderEnd)) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        occurrences.push(`${y}-${m}-${d}`);
      }
      current.setMonth(current.getMonth() + 1);
    }
  }

  return occurrences;
}

// Get reminders for a date range (computes recurring occurrences)
reminderRouter.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date().toISOString().split('T')[0];
    const endDate = end || new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0];

    // Get all active reminders that could have occurrences in range
    const result = await query(`
      SELECT r.*,
        COALESCE(
          json_agg(json_build_object('date', rc.occurrence_date, 'notes', rc.notes))
          FILTER (WHERE rc.id IS NOT NULL), '[]'
        ) as completions
      FROM calendar_reminders r
      LEFT JOIN reminder_completions rc ON r.id = rc.reminder_id
        AND rc.occurrence_date >= $1 AND rc.occurrence_date <= $2
      WHERE r.is_active = true
        AND r.start_date <= $2
        AND (r.end_date IS NULL OR r.end_date >= $1)
      GROUP BY r.id
      ORDER BY r.start_date ASC
    `, [startDate, endDate]);

    // Compute occurrences for each reminder
    const reminders = [];
    for (const row of result.rows) {
      const occurrences = computeOccurrences(row, startDate, endDate);
      const completedDates = (row.completions || [])
        .filter(c => c.date)
        .map(c => c.date.split ? c.date.split('T')[0] : c.date);

      for (const date of occurrences) {
        reminders.push({
          id: row.id,
          title: row.title,
          description: row.description,
          category: row.category,
          amount: parseFloat(row.amount) || 0,
          color: row.color,
          icon: row.icon,
          recurrenceType: row.recurrence_type,
          date: date,
          completed: completedDates.includes(date)
        });
      }
    }

    res.json({ success: true, data: reminders });
  } catch (error) {
    logError('order.reminders-fetch-error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Create a new reminder
reminderRouter.post('/', async (req, res) => {
  try {
    const { title, description, category, amount, color, icon, recurrenceType, startDate, endDate } = req.body;

    const result = await query(`
      INSERT INTO calendar_reminders (title, description, category, amount, color, icon, recurrence_type, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      title, description || null, category || 'general',
      amount || null, color || '#e72a88', icon || '🔔',
      recurrenceType || 'once', startDate, endDate || null
    ]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('order.reminder-create-error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Mark a reminder occurrence as completed
reminderRouter.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, notes } = req.body;

    const result = await query(`
      INSERT INTO reminder_completions (reminder_id, occurrence_date, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (reminder_id, occurrence_date) DO UPDATE SET notes = $3, completed_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [id, date, notes || null]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('order.reminder-complete-error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Uncomplete a reminder occurrence
reminderRouter.delete('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    await query(`
      DELETE FROM reminder_completions WHERE reminder_id = $1 AND occurrence_date = $2
    `, [id, date]);

    res.json({ success: true });
  } catch (error) {
    logError('order.reminder-uncomplete-error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Delete a reminder
reminderRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM calendar_reminders WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    logError('order.reminder-delete-error', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// Get capacity info for a date range
router.get('/capacity', async (req, res) => {
  try {
    const { start, end } = req.query;
    const dailyCapacity = 2500; // Configurable

    const startDate = start || new Date().toISOString().split('T')[0];
    const endDate = end || new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0];

    log('info', 'order.calculating-capacity-from-to');

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
    logError('order.capacity-calculation-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Find next available production date with capacity
router.get('/next-available-date', async (req, res) => {
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
    logError('order.next-available-date-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Get single order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    log('info', 'order.fetching-order-from-postgresql');

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
        o.destination,
        o.created_at,
        -- Shipping label data from shipping_labels table
        (SELECT sl.tracking_number FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_tracking_number,
        (SELECT sl.carrier FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_carrier,
        (SELECT sl.service FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_service,
        (SELECT sl.label_url FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_label_url,
        (SELECT sl.delivery_days FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivery_days,
        (SELECT sl.status FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_shipping_status,
        (SELECT sl.shipped_at FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_shipped_at,
        (SELECT sl.delivered_at FROM shipping_labels sl WHERE sl.order_id = o.id ORDER BY sl.created_at DESC LIMIT 1) as sl_delivered_at,
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
      shippingStatus: order.sl_shipping_status || null,
      shippedAt: order.sl_shipped_at || null,
      deliveredAt: order.sl_delivered_at || null,
      shippingLabelsCount: parseInt(order.shipping_labels_count) || 0,
      deliveryDate: order.delivery_date,
      // Delivery dates (admin only)
      productionDeadline: order.production_deadline,
      estimatedDeliveryDate: order.estimated_delivery_date,
      shippingDays: order.shipping_days || 5,
      // Notion sync
      notionPageId: order.notion_page_id,
      notionPageUrl: order.notion_page_url,
      // Destination
      destination: order.destination || '',
      // Summary for compatibility
      summary: order.client_notes || ''
    };

    log('info', 'order.found-order');

    res.json({
      success: true,
      data: orderData
    });
  } catch (error) {
    logError('order.error-getting-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Update shipping cost for an order
router.patch('/:orderId/shipping-cost', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { shippingCost } = req.body;
    const cost = parseFloat(shippingCost) || 0;

    // Get current subtotal to recalculate total
    const orderResult = await query('SELECT subtotal FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    const subtotal = parseFloat(orderResult.rows[0].subtotal) || 0;
    const newTotal = subtotal + cost;

    await query(
      'UPDATE orders SET shipping_cost = $1, total_price = $2 WHERE id = $3',
      [cost, newTotal, orderId]
    );

    log('info', 'order.shipping-cost-updated-for-order-new-total');
    res.json({ success: true, shippingCost: cost, totalPrice: newTotal });
  } catch (error) {
    logError('order.error-updating-shipping-cost', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update order status
router.patch('/:orderId/status', async (req, res) => {
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
    const currentOrder = await query('SELECT status, order_number FROM orders WHERE id = $1', [orderId]);
    const oldStatus = currentOrder.rows.length > 0 ? currentOrder.rows[0].status : null;
    const orderNumber = currentOrder.rows.length > 0 ? currentOrder.rows[0].order_number : null;

    const result = await notionSync.syncStatusToNotion(orderId, status);

    // Generate tasks for the new status (if status actually changed)
    let taskResult = null;
    if (oldStatus && oldStatus !== status) {
      try {
        taskResult = await onOrderStatusChange(orderId, oldStatus, status);
        log('info', 'order.task-generation-for-order-new-tasks-created');
      } catch (taskError) {
        logError('order.task-generation.error', taskError);
      }

      // Push notification (fire-and-forget)
      pushService.notifyStatusChange(orderNumber || `#${orderId}`, oldStatus, status);
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: result,
      tasks: taskResult
    });
  } catch (error) {
    logError('order.error-updating-status', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Sync order to Notion
router.post('/:orderId/sync', async (req, res) => {
  try {
    const result = await notionSync.syncOrderToNotion(parseInt(req.params.orderId));

    res.json({
      success: true,
      message: 'Order synced to Notion successfully',
      data: result
    });
  } catch (error) {
    logError('order.error-syncing-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Bulk sync orders to Notion
router.post('/sync/bulk', async (req, res) => {
  try {
    const limit = req.body.limit || 100;
    const result = await notionSync.syncAllOrdersToNotion(limit);

    res.json({
      success: true,
      message: 'Bulk sync completed',
      data: result
    });
  } catch (error) {
    logError('order.error-in-bulk-sync', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Cobrar saldo — send WhatsApp message to client asking for remaining payment
router.post('/:orderId/cobrar-saldo', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const orderResult = await query(
      `SELECT o.order_number, o.total_price, o.deposit_amount, c.phone, c.name
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    const order = orderResult.rows[0];
    const pendingAmount = parseFloat(order.total_price) - parseFloat(order.deposit_amount || 0);
    const clientPhone = (order.phone || '').replace(/\D/g, '');

    if (!clientPhone) {
      return res.status(400).json({ success: false, error: 'Cliente sin teléfono' });
    }

    // Format phone for WhatsApp (add 521 prefix if 10 digits)
    const waPhone = clientPhone.length === 10 ? '52' + clientPhone : clientPhone;

    // Send WhatsApp template message (works outside 24h window)
    const { sendTemplate } = await import('../services/whatsapp-templates.js');
    const result = await sendTemplate('axkan_order_followup', waPhone, {
      client_name: order.name || 'Cliente',
      order_number: order.order_number
    });

    log('info', 'order.cobro-enviado-a');
    res.json({ success: true, message: 'Mensaje de cobro enviado' });
  } catch (err) {
    logError('order.error-cobrando-saldo', err);
    res.status(500).json({ success: false, error: 'Error enviando mensaje' });
  }
});

// Approve order
router.post('/:orderId/approve', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { actualDepositAmount } = req.body;

    log('info', 'order.approving-order-with-deposit');

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
    log('info', 'order.generating-pdf-receipt');
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
    log('info', 'order.pdf-generated');

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
        log('info', 'order.attempting-to-send-receipt-email-to-client');
        log('info', 'order.client');
        log('info', 'order.email');
        log('info', 'order.order');
        log('info', 'order.pdf-path');

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

        log('info', 'order.receipt-email-sent-successfully-to');

      } catch (emailError) {
        log('error', 'order.critical-error-sending-receipt-email');
        log('error', 'order.debug');
        log('error', 'order.debug');
        log('error', 'order.debug');

        // Check if it's an authentication error
        if (emailError.message.includes('authentication') || emailError.message.includes('login')) {
          log('error', 'order.email-authentication-failed-check-emailuser-and-em');
        }

        // Check if transporter exists
        if (emailError.message.includes('transporter')) {
          log('error', 'order.email-transporter-not-initialized-check-email-serv');
        }
      }
    });

    // Sync to Notion if needed
    try {
      await notionSync.syncOrderToNotion(orderId);
    } catch (notionError) {
      log('error', 'order.debug');
    }

    // Create automatic tasks for the approved order (background)
    setImmediate(async () => {
      try {
        log('info', 'order.creating-automatic-tasks-for-approved-order');

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
        log('info', 'order.task-created-diseos');

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
        log('info', 'order.task-created-armado');

        log('info', 'order.automatic-tasks-created-successfully-for-order');
      } catch (taskError) {
        log('error', 'order.debug');
      }
    });

    // NOTE: Shipping labels are NO LONGER auto-generated on approval
    // Instead, the client will:
    // 1. Select their preferred shipping method when uploading second payment
    // 2. Upload the second payment receipt
    // 3. The label is generated with their selected carrier/service

    log('info', 'order.order-approved-successfully');
    log('info', 'order.shipping-label-will-be-generated-when-client-selec');

    // Push notification (fire-and-forget)
    pushService.notifyOrderApproved(order.order_number, order.client_name);

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
    logError('order.error-approving-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Reject order
router.post('/:orderId/reject', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { reason } = req.body;

    log('info', 'order.rejecting-order');

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
      log('error', 'order.debug');
    }

    log('info', 'order.order-rejected-successfully');

    res.json({
      success: true,
      message: 'Order rejected successfully'
    });
  } catch (error) {
    logError('order.error-rejecting-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Upload first payment proof (admin upload)
router.post('/:orderId/payment-proof', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { paymentProofUrl } = req.body;

    if (!paymentProofUrl) {
      return res.status(400).json({
        success: false,
        error: 'Payment proof URL is required'
      });
    }

    log('info', 'order.uploading-first-payment-proof-for-order');

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

    log('info', 'order.first-payment-proof-uploaded-for-order');

    res.json({
      success: true,
      message: 'Payment proof uploaded successfully',
      orderNumber: result.rows[0].order_number
    });
  } catch (error) {
    logError('order.error-uploading-payment-proof', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Upload second payment receipt (for clients)
router.post('/:orderId/second-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { paymentProof, paymentProofUrl } = req.body; // Base64 encoded image or Cloudinary URL

    log('info', 'order.uploading-second-payment-receipt-for-order');

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
      log('info', 'order.using-cloudinary-url');
    } else if (paymentProof) {
      // Legacy path: upload base64 to Google Drive or local storage
      filename = `second-payment-${order.order_number}-${Date.now()}.jpg`;

      if (isGoogleDriveConfigured()) {
        // Upload to Google Drive
        log('info', 'order.uploading-to-google-drive');
        const uploadResult = await uploadToGoogleDrive({
          fileData: paymentProof,
          fileName: filename,
          mimeType: 'image/jpeg'
        });

        imageUrl = uploadResult.directImageUrl; // URL that can be used in <img> tags
        log('info', 'order.uploaded-to-google-drive');
      } else {
        // Fallback to local storage if Google Drive not configured
        log('info', 'order.google-drive-not-configured-saving-locally');
        const paymentsDir = path.join(__dirname, '../payment-verification-receipts');
        if (!fs.existsSync(paymentsDir)) {
          fs.mkdirSync(paymentsDir, { recursive: true });
        }

        const filepath = path.join(paymentsDir, filename);
        const base64Data = paymentProof.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));

        imageUrl = `/payment-receipts/${filename}`;
        log('info', 'order.payment-proof-saved-locally');
      }
    }

    // Save second payment proof URL to database
    await query(
      'UPDATE orders SET second_payment_proof_url = $1 WHERE id = $2',
      [imageUrl, orderId]
    );

    log('info', 'order.second-payment-receipt-uploaded-and-saved-to-datab');

    // AI Verification for second payment
    let verificationResult = null;
    let autoConfirmed = false;
    const expectedAmount = remainingBalance;

    if (isClaudeConfigured()) {
      log('info', 'order.starting-ai-verification-for-second-payment');
      log('info', 'order.expected-amount');

      try {
        verificationResult = await verifyPaymentReceipt(
          imageUrl,
          expectedAmount,
          order.order_number
        );

        log('info', 'order.ai-verification-result');

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
          log('info', 'order.ai-recommends-autoapprove-for-second-payment-confi');

          // Update order status to delivered
          await query(`
            UPDATE orders
            SET status = 'delivered'
            WHERE id = $1
          `, [orderId]);

          autoConfirmed = true;
          log('info', 'order.order-second-payment-auto-confirmed-by-claude-ai');

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

                log('info', 'order.auto-confirmation-email-sent-to');
              }
            } catch (emailError) {
              log('error', 'order.debug');
            }
          });
        }
      } catch (aiError) {
        logError('order.ai-verification.error', aiError);
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
    logError('order.error-uploading-second-payment-receipt', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Confirm second payment and complete order
router.post('/:orderId/confirm-second-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.confirming-second-payment-for-order');

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

    log('info', 'order.order-marked-as-completed');

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

      log('info', 'order.completion-email-sent-to');
    } catch (emailError) {
      log('error', 'order.debug');
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Second payment confirmed and order completed'
    });

  } catch (error) {
    logError('order.error-confirming-second-payment', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Archive order (mark as completed or cancelled)
router.post('/:orderId/archive', async (req, res) => {
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

    log('info', 'order.order-archived-as');

    res.json({
      success: true,
      message: `Order archived as ${archiveStatus}`
    });
  } catch (error) {
    logError('order.error-archiving-order', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
router.put('/:orderId/items/:itemId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);
    const { notes, attachments } = req.body;

    log('info', 'order.debug');

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

    log('info', 'order.item-updated-successfully');

    res.json({
      success: true,
      item: updateResult.rows[0]
    });

  } catch (error) {
    logError('order.error-updating-order-item', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/orders/:orderId/items/:itemId/attachment
 * Add an attachment to an order item
 */
router.post('/:orderId/items/:itemId/attachment', async (req, res) => {
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

    log('info', 'order.debug');

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

    log('info', 'order.attachment-added-successfully');

    res.json({
      success: true,
      attachments: JSON.parse(updateResult.rows[0].attachments)
    });

  } catch (error) {
    logError('order.error-adding-attachment', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * DELETE /api/orders/:orderId/items/:itemId/attachment
 * Remove an attachment from an order item
 */
router.delete('/:orderId/items/:itemId/attachment', async (req, res) => {
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

    log('info', 'order.debug');

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

    log('info', 'order.attachment-removed-successfully');

    res.json({
      success: true,
      attachments: updateResult.rows[0].attachments ? JSON.parse(updateResult.rows[0].attachments) : []
    });

  } catch (error) {
    logError('order.error-removing-attachment', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// ORDER ITEM MODIFICATION (Edit/Add Products)
// ========================================

/**
 * PUT /api/orders/:orderId/items/:itemId/modify
 * Modify an existing order item's quantity
 */
router.put('/:orderId/items/:itemId/modify', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);
    const { newQuantity, reason, oldQuantity, productName, unitPrice, newUnitPrice, newSize } = req.body;

    // Use new price if provided, otherwise keep old price
    const finalUnitPrice = newUnitPrice !== undefined ? newUnitPrice : unitPrice;
    const priceChanged = newUnitPrice !== undefined && newUnitPrice !== unitPrice;

    log('info', 'order.modifying-item-in-order');

    // Verify the item belongs to the order
    const itemCheck = await query(
      'SELECT id, quantity FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in this order'
      });
    }

    // Get the order and client info for email
    const orderResult = await query(`
      SELECT o.*, o.order_number, c.email, c.name as client_name, o.internal_notes
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
    const oldLineTotal = oldQuantity * unitPrice;
    const newLineTotal = newQuantity * finalUnitPrice;
    const priceDiff = newLineTotal - oldLineTotal;

    // Determine new product name if size changed (for magnets)
    let finalProductName = productName;
    if (newSize) {
      // Map size to display name
      const sizeNames = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' };
      const sizeName = sizeNames[newSize] || '';

      // Update product name to reflect new size
      // Remove any existing size suffix and add new one
      const baseName = productName
        .replace(/\s*(chico|mediano|grande|pequeño|small|medium|large)/gi, '')
        .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content like (Mediano)
        .trim();

      finalProductName = `${baseName} ${sizeName}`.trim();
    }

    // Update the item quantity, price, and product name
    await query(`
      UPDATE order_items
      SET quantity = $1, unit_price = $2, product_name = $3
      WHERE id = $4
    `, [newQuantity, finalUnitPrice, finalProductName, itemId]);

    // Recalculate order total
    const totalsResult = await query(`
      SELECT COALESCE(SUM(quantity * unit_price), 0) as new_total
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);

    const newOrderTotal = parseFloat(totalsResult.rows[0].new_total);

    // Add shipping if exists
    const shippingResult = await query('SELECT shipping_cost FROM orders WHERE id = $1', [orderId]);
    const shippingCost = parseFloat(shippingResult.rows[0]?.shipping_cost || 0);
    const finalTotal = newOrderTotal + shippingCost;

    // Update order total
    await query(`
      UPDATE orders
      SET total_price = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [finalTotal, orderId]);

    // Create change log entry
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const sizeDisplayNames = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' };
    const sizeInfo = newSize ? `Tamaño: ${sizeDisplayNames[newSize] || newSize}\n` : '';
    const priceInfo = priceChanged ? `Precio unitario: $${unitPrice} → $${finalUnitPrice}\n` : '';
    const productInfo = newSize ? `Producto: ${productName} → ${finalProductName}\n` : `Producto: ${productName}\n`;
    const changeLog = `\n📝 MODIFICACION (${timestamp})\n` +
      productInfo +
      sizeInfo +
      `Cantidad: ${oldQuantity} → ${newQuantity} pzas\n` +
      priceInfo +
      `Diferencia: ${priceDiff >= 0 ? '+' : ''}$${priceDiff.toFixed(2)}\n` +
      `Razon: ${reason}\n` +
      `Nuevo total: $${finalTotal.toFixed(2)}`;

    const newNotes = (order.internal_notes || '') + changeLog;

    // Update internal notes
    await query(`
      UPDATE orders
      SET internal_notes = $1
      WHERE id = $2
    `, [newNotes, orderId]);

    // Send email notification to client
    if (order.email) {
      try {
        // Build size change info for email
        const sizeEmailInfo = newSize ? `<p style="margin: 5px 0;"><strong>Tamaño:</strong> ${sizeDisplayNames[newSize] || newSize}</p>` : '';
        const priceEmailInfo = priceChanged ? `<p style="margin: 5px 0;"><strong>Precio unitario:</strong> $${unitPrice.toFixed(2)} → $${finalUnitPrice.toFixed(2)}</p>` : '';
        const productEmailInfo = newSize
          ? `<p style="margin: 5px 0;"><strong>Producto:</strong> ${productName} → ${finalProductName}</p>`
          : `<p style="margin: 5px 0;"><strong>Producto:</strong> ${productName}</p>`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">📦 Actualizacion de tu Pedido</h2>
            <p>Hola <strong>${order.client_name}</strong>,</p>
            <p>Te informamos que se ha realizado una modificacion a tu pedido <strong>${order.order_number}</strong>:</p>

            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              ${productEmailInfo}
              ${sizeEmailInfo}
              <p style="margin: 5px 0;"><strong>Cantidad anterior:</strong> ${oldQuantity} piezas</p>
              <p style="margin: 5px 0;"><strong>Nueva cantidad:</strong> ${newQuantity} piezas</p>
              ${priceEmailInfo}
              <p style="margin: 5px 0;"><strong>Diferencia en precio:</strong> ${priceDiff >= 0 ? '+' : ''}$${priceDiff.toFixed(2)}</p>
            </div>

            <p style="font-size: 18px; color: #059669;"><strong>Nuevo total del pedido: $${finalTotal.toFixed(2)}</strong></p>

            <p style="color: #6b7280; font-size: 14px;">Motivo: ${reason}</p>

            <p>Si tienes alguna duda, contactanos por WhatsApp: <strong>55-3825-3251</strong></p>

            <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
              Gracias por tu preferencia,<br>
              <strong>AXKAN Souvenirs</strong>
            </p>
          </div>
        `;

        await sendEmail({
          to: order.email,
          subject: `Actualizacion de tu pedido ${order.order_number} - AXKAN`,
          html: emailHtml
        });
        log('info', 'order.modification-email-sent-to');
      } catch (emailError) {
        log('error', 'order.debug');
      }
    }

    log('info', 'order.item-modified-successfully');

    res.json({
      success: true,
      message: 'Item modified successfully',
      newTotal: finalTotal
    });

  } catch (error) {
    logError('order.error-modifying-order-item', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/orders/:orderId/items/add
 * Add a new product to an existing order
 */
router.post('/:orderId/items/add', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { productId, productName, quantity, unitPrice, reason } = req.body;

    log('info', 'order.adding-new-item-to-order-x');

    // Get the order and client info
    const orderResult = await query(`
      SELECT o.*, o.order_number, c.email, c.name as client_name, o.internal_notes
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
    const lineTotal = quantity * unitPrice;

    // Get the product's production cost
    const productResult = await query(`
      SELECT production_cost FROM products WHERE id = $1
    `, [productId]);
    const unitCost = productResult.rows.length > 0
      ? parseFloat(productResult.rows[0].production_cost)
      : 0;

    // Insert the new order item
    const insertResult = await query(`
      INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, unit_cost)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [orderId, productId, productName, quantity, unitPrice, unitCost]);

    const newItemId = insertResult.rows[0].id;

    // Recalculate order total
    const totalsResult = await query(`
      SELECT COALESCE(SUM(quantity * unit_price), 0) as new_total
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);

    const newOrderTotal = parseFloat(totalsResult.rows[0].new_total);

    // Add shipping if exists
    const shippingResult = await query('SELECT shipping_cost FROM orders WHERE id = $1', [orderId]);
    const shippingCost = parseFloat(shippingResult.rows[0]?.shipping_cost || 0);
    const finalTotal = newOrderTotal + shippingCost;

    // Update order total
    await query(`
      UPDATE orders
      SET total_price = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [finalTotal, orderId]);

    // Create change log entry
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const changeLog = `\n➕ PRODUCTO AGREGADO (${timestamp})\n` +
      `Producto: ${productName}\n` +
      `Cantidad: ${quantity} pzas\n` +
      `Precio: $${unitPrice.toFixed(2)}/pza\n` +
      `Subtotal: $${lineTotal.toFixed(2)}\n` +
      `Razon: ${reason}\n` +
      `Nuevo total: $${finalTotal.toFixed(2)}`;

    const newNotes = (order.internal_notes || '') + changeLog;

    // Update internal notes
    await query(`
      UPDATE orders
      SET internal_notes = $1
      WHERE id = $2
    `, [newNotes, orderId]);

    // Send email notification to client
    if (order.email) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">📦 Producto Agregado a tu Pedido</h2>
            <p>Hola <strong>${order.client_name}</strong>,</p>
            <p>Te informamos que se ha agregado un nuevo producto a tu pedido <strong>${order.order_number}</strong>:</p>

            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Producto:</strong> ${productName}</p>
              <p style="margin: 5px 0;"><strong>Cantidad:</strong> ${quantity} piezas</p>
              <p style="margin: 5px 0;"><strong>Precio unitario:</strong> $${unitPrice.toFixed(2)}</p>
              <p style="margin: 5px 0;"><strong>Subtotal:</strong> $${lineTotal.toFixed(2)}</p>
            </div>

            <p style="font-size: 18px; color: #059669;"><strong>Nuevo total del pedido: $${finalTotal.toFixed(2)}</strong></p>

            <p style="color: #6b7280; font-size: 14px;">Motivo: ${reason}</p>

            <p>Si tienes alguna duda, contactanos por WhatsApp: <strong>55-3825-3251</strong></p>

            <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
              Gracias por tu preferencia,<br>
              <strong>AXKAN Souvenirs</strong>
            </p>
          </div>
        `;

        await sendEmail({
          to: order.email,
          subject: `Producto agregado a tu pedido ${order.order_number} - AXKAN`,
          html: emailHtml
        });
        log('info', 'order.new-product-email-sent-to');
      } catch (emailError) {
        log('error', 'order.debug');
      }
    }

    log('info', 'order.new-item-added-successfully');

    res.json({
      success: true,
      message: 'Item added successfully',
      itemId: newItemId,
      newTotal: finalTotal
    });

  } catch (error) {
    logError('order.error-adding-order-item', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * DELETE /api/orders/:orderId/items/:itemId
 * Remove a product from an existing order
 */
router.delete('/:orderId/items/:itemId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId = parseInt(req.params.itemId);

    // Get the item details before deleting
    const itemResult = await query(`
      SELECT oi.*, o.order_number, o.internal_notes, o.shipping_cost
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = $1 AND oi.order_id = $2
    `, [itemId, orderId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const item = itemResult.rows[0];
    log('info', 'order.removing-item-from-order');

    // Delete the item
    await query('DELETE FROM order_items WHERE id = $1', [itemId]);

    // Recalculate order total
    const totalsResult = await query(`
      SELECT COALESCE(SUM(quantity * unit_price), 0) as new_total
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);

    const newOrderTotal = parseFloat(totalsResult.rows[0].new_total);
    const shippingCost = parseFloat(item.shipping_cost || 0);
    const finalTotal = newOrderTotal + shippingCost;

    // Update order total
    await query(`
      UPDATE orders
      SET total_price = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [finalTotal, orderId]);

    // Add change log
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const changeLog = `\n🗑️ PRODUCTO ELIMINADO (${timestamp})\n` +
      `Producto: ${item.product_name}\n` +
      `Cantidad: ${item.quantity} pzas\n` +
      `Precio: $${parseFloat(item.unit_price).toFixed(2)}/pza\n` +
      `Subtotal removido: $${(item.quantity * parseFloat(item.unit_price)).toFixed(2)}\n` +
      `Nuevo total: $${finalTotal.toFixed(2)}`;

    const newNotes = (item.internal_notes || '') + changeLog;
    await query('UPDATE orders SET internal_notes = $1 WHERE id = $2', [newNotes, orderId]);

    log('info', 'order.item-removed-successfully');

    res.json({
      success: true,
      message: 'Item removed successfully',
      newTotal: finalTotal
    });

  } catch (error) {
    logError('order.error-removing-order-item', error);
    res.status(500).json({ success: false, error: (error.message || 'Error desconocido') });
  }
});

// ========================================
// ORDER-LEVEL NOTES AND ATTACHMENTS
// ========================================

/**
 * PUT /api/orders/:orderId/notes
 * Update internal notes for an order
 */
router.put('/:orderId/notes', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { internalNotes } = req.body;

    log('info', 'order.updating-internal-notes-for-order');

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

    log('info', 'order.order-notes-updated-successfully');

    res.json({
      success: true,
      internalNotes: updateResult.rows[0].internal_notes
    });

  } catch (error) {
    logError('order.error-updating-order-notes', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/orders/:orderId/attachment
 * Add an attachment to an order
 */
router.post('/:orderId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { url, filename, type } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    log('info', 'order.debug');

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

    log('info', 'order.attachment-added-successfully');

    res.json({
      success: true,
      attachments: JSON.parse(updateResult.rows[0].order_attachments)
    });

  } catch (error) {
    logError('order.error-adding-attachment', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * DELETE /api/orders/:orderId/attachment
 * Remove an attachment from an order
 */
router.delete('/:orderId/attachment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    log('info', 'order.debug');

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

    log('info', 'order.attachment-removed-successfully');

    res.json({
      success: true,
      attachments: updateResult.rows[0].order_attachments ? JSON.parse(updateResult.rows[0].order_attachments) : []
    });

  } catch (error) {
    logError('order.error-removing-attachment', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
router.post('/:orderId/production-sheet', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const { productionSheetUrl } = req.body;

    if (!productionSheetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Production sheet URL is required'
      });
    }

    log('info', 'order.saving-production-sheet-for-order');

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

    log('info', 'order.production-sheet-saved-for-order');

    res.json({
      success: true,
      message: 'Production sheet saved successfully',
      productionSheetUrl
    });
  } catch (error) {
    logError('order.error-saving-production-sheet', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * DELETE /api/orders/:orderId/production-sheet
 * Remove production sheet from an order
 */
router.delete('/:orderId/production-sheet', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.removing-production-sheet-for-order');

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

    log('info', 'order.production-sheet-removed-for-order');

    res.json({
      success: true,
      message: 'Production sheet removed successfully'
    });
  } catch (error) {
    logError('order.error-removing-production-sheet', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// REFERENCE SHEET GENERATION
// ========================================

/**
 * POST /api/orders/reference-sheet/generate
 * Generate a custom reference sheet PDF with user-provided data (AXKAN ORDEN DE COMPRA)
 * Optionally saves to an order if orderId is provided
 */
router.post('/reference-sheet/generate', async (req, res) => {
  try {
    const { orderName, instructions, numDesigns, designs, orderId } = req.body;

    log('info', 'order.generating-custom-reference-sheet-with-designs');

    // Build order data for PDF generator
    const orderData = {
      orderNumber: orderName,
      clientName: orderName,
      clientNotes: instructions,
      items: designs.map((d, i) => ({
        productName: d.type || `Design ${i + 1}`,
        quantity: d.quantity || 0
      })),
      // Pass designs with base64 images
      customDesigns: designs.map((d, i) => ({
        type: d.type || '',
        quantity: d.quantity || 0,
        imageData: d.imageData || null
      }))
    };

    // Generate PDF
    const pdfBuffer = await generateReferenceSheet(orderData);

    // If orderId is provided, save the PDF to the order
    if (orderId) {
      const base64Pdf = pdfBuffer.toString('base64');
      const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

      await query(
        'UPDATE orders SET production_sheet_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [dataUrl, parseInt(orderId)]
      );

      log('info', 'order.reference-sheet-saved-to-order');
    }

    // Set response headers
    const safeName = orderName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    log('info', 'order.custom-reference-sheet-generated-bytes');

    res.send(pdfBuffer);

  } catch (error) {
    logError('order.error-generating-custom-reference-sheet', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/orders/:orderId/reference-sheet
 * Generate a reference sheet PDF for production tracking
 */
router.post('/:orderId/reference-sheet', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.generating-reference-sheet-for-order');

    // Get full order data including items and attachments
    const orderResult = await query(`
      SELECT
        o.id,
        o.order_number,
        o.status,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        o.event_type,
        o.event_date,
        o.client_notes,
        o.internal_notes,
        o.total_price,
        o.order_attachments,
        o.destination
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
        oi.id,
        oi.product_name,
        oi.quantity,
        oi.unit_price,
        oi.notes,
        oi.attachments
      FROM order_items oi
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `, [orderId]);

    // Build order data for PDF generation
    const orderData = {
      orderNumber: order.order_number,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      clientEmail: order.client_email,
      eventType: order.event_type,
      eventDate: order.event_date,
      clientNotes: order.client_notes || order.internal_notes,
      orderAttachments: order.order_attachments,
      items: itemsResult.rows.map(item => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        notes: item.notes,
        attachments: item.attachments
      }))
    };

    // Generate PDF
    const pdfBuffer = await generateReferenceSheet(orderData);

    // Set response headers for PDF download
    const filename = `Referencia_${order.order_number}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    log('info', 'order.reference-sheet-generated-for-order-bytes');

    res.send(pdfBuffer);

  } catch (error) {
    logError('order.error-generating-reference-sheet', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

/**
 * POST /api/orders/:orderId/reference-sheet/save
 * Generate and save reference sheet as an attachment to the order
 */
router.post('/:orderId/reference-sheet/save', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.generating-and-saving-reference-sheet-for-order');

    // Get full order data
    const orderResult = await query(`
      SELECT
        o.id,
        o.order_number,
        o.status,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        o.event_type,
        o.event_date,
        o.client_notes,
        o.internal_notes,
        o.total_price,
        o.order_attachments,
        o.destination
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
        oi.id,
        oi.product_name,
        oi.quantity,
        oi.unit_price,
        oi.notes,
        oi.attachments
      FROM order_items oi
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `, [orderId]);

    // Build order data
    const orderData = {
      orderNumber: order.order_number,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      clientEmail: order.client_email,
      eventType: order.event_type,
      eventDate: order.event_date,
      clientNotes: order.client_notes || order.internal_notes,
      orderAttachments: order.order_attachments,
      items: itemsResult.rows.map(item => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        notes: item.notes,
        attachments: item.attachments
      }))
    };

    // Generate PDF
    const pdfBuffer = await generateReferenceSheet(orderData);

    // Convert to base64 data URL for storage
    const base64Pdf = pdfBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

    // Save to order's production_sheet_url field
    await query(
      'UPDATE orders SET production_sheet_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [dataUrl, orderId]
    );

    log('info', 'order.reference-sheet-saved-for-order');

    res.json({
      success: true,
      message: 'Reference sheet generated and saved',
      filename: `Referencia_${order.order_number}.pdf`,
      size: pdfBuffer.length
    });

  } catch (error) {
    logError('order.error-generatingsaving-reference-sheet', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});



// ========================================
// REGENERATE PDF RECEIPT ON-DEMAND
// ========================================
// This endpoint regenerates a PDF receipt for an order
// Useful when the original file is lost (e.g., after server redeploy on Render)
router.get('/:orderId/receipt/download', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID'
      });
    }

    log('info', 'order.regenerating-receipt-for-order');

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

    log('info', 'order.receipt-regenerated');

    // Send file as download
    res.download(pdfPath, `Recibo-${order.order_number}.pdf`, (err) => {
      if (err) {
        logError('order.error-sending-pdf', err);
      }
      // Optionally delete the temp file after sending
      // fs.unlinkSync(pdfPath);
    });

  } catch (error) {
    logError('order.error-regenerating-receipt', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// Process receipt with OCR and auto-approve if amount matches
router.post('/:orderId/process-receipt', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.n-processing-receipt-for-order');

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

      log('info', 'order.order-auto-approved-amount-matches');

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
    logError('order.error-processing-receipt', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// CLAUDE AI PAYMENT VERIFICATION (Smarter than OCR)
// POST /api/orders/:orderId/verify-payment
// Uses Claude Vision to analyze payment receipts
// ========================================
router.post('/:orderId/verify-payment', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);

    log('info', 'order.n-claude-ai-verifying-payment-for-order');

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

    log('info', 'order.order');
    log('info', 'order.client');
    log('info', 'order.expected-deposit');
    log('info', 'order.receipt-url');

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
      log('info', 'order.generating-pdf-receipt-for-auto-approved-order');
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

      log('info', 'order.order-auto-approved-by-claude-ai');
      log('info', 'order.detected-amount');
      log('info', 'order.receipt-url');

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
          log('info', 'order.receipt-email-sent-to');
        } catch (emailError) {
          log('error', 'order.debug');
        }
      });

      // Sync to Notion
      try {
        await notionSync.syncOrderToNotion(orderId);
      } catch (notionError) {
        log('error', 'order.debug');
      }

      // Create automatic tasks for the auto-approved order (background)
      setImmediate(async () => {
        try {
          log('info', 'order.creating-automatic-tasks-for-ai-auto-approved-orde');

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

          log('info', 'order.automatic-tasks-created-for-ai-auto-approved-order');
        } catch (taskError) {
          log('error', 'order.debug');
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
    logError('order.error-in-claude-ai-verification', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

export default router;
export { reminderRouter };
