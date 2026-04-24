/**
 * Shipping / Guías Routes
 * Handles shipping label generation and management
 */

import express from 'express';
import { query } from '../shared/database.js';
import * as skydropx from '../services/skydropx.js';
import * as pickupScheduler from '../services/pickup-scheduler.js';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { log, logError } from '../shared/logger.js';

const router = express.Router();

// ========================================
// PIECES PER BOX CONFIGURATION
// How many pieces of each product type fit in one shipping box
// ========================================
const PIECES_PER_BOX = {
  'iman': 250,
  'imanes': 250,
  'magnet': 250,
  'llavero': 400,
  'llaveros': 400,
  'keychain': 400,
  'destapador': 200,
  'destapadores': 200,
  'bottle opener': 200,
  'abridor': 200,
  'portallaves': 40,
  'porta llaves': 40,
  'key holder': 40,
  'default': 100 // Default if product type not recognized
};

/**
 * Get pieces per box for a product based on its name
 */
function getPiecesPerBox(productName) {
  if (!productName) return PIECES_PER_BOX.default;

  const name = productName.toLowerCase().trim();

  for (const [keyword, pieces] of Object.entries(PIECES_PER_BOX)) {
    if (keyword !== 'default' && name.includes(keyword)) {
      return pieces;
    }
  }

  return PIECES_PER_BOX.default;
}

/**
 * Calculate total boxes needed for order items
 * Returns { totalBoxes, breakdown: [{ product, quantity, piecesPerBox, boxes }] }
 */
function calculateBoxesForOrder(orderItems) {
  let totalBoxes = 0;
  const breakdown = [];

  for (const item of orderItems) {
    const piecesPerBox = getPiecesPerBox(item.product_name);
    const boxes = Math.ceil(item.quantity / piecesPerBox);
    totalBoxes += boxes;

    breakdown.push({
      product: item.product_name,
      quantity: item.quantity,
      piecesPerBox,
      boxes
    });
  }

  return { totalBoxes: Math.max(1, totalBoxes), breakdown };
}

// ========================================
// ORIGIN ADDRESS MANAGEMENT
// ========================================

/**
 * GET /shipping/origin-address
 * Returns the current origin address used for all shipping labels
 */
router.get('/origin-address', async (req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'origin_address'`
    );

    if (result.rows.length === 0) {
      // Return default from skydropx service
      return res.json({
        success: true,
        address: skydropx.ORIGIN_ADDRESS
      });
    }

    res.json({
      success: true,
      address: result.rows[0].value
    });
  } catch (error) {
    logError('shipping.error-fetching-origin-address', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * PUT /shipping/origin-address
 * Updates the origin address used for all shipping labels
 */
router.put('/origin-address', async (req, res) => {
  try {
    const { name, company, street, number, neighborhood, city, state, zip, phone, email, reference } = req.body;

    // Validate required fields
    if (!street || !zip || !city || !state) {
      return res.status(400).json({
        success: false,
        error: 'Campos requeridos: street, zip, city, state'
      });
    }

    const addressData = {
      name: name || 'VT Anunciando',
      company: company || 'VT Anunciando',
      street: street,
      number: number || '',
      neighborhood: neighborhood || '',
      city: city,
      state: state,
      zip: zip,
      phone: phone || '',
      email: email || '',
      reference: reference || ''
    };

    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('origin_address', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(addressData)]
    );

    // Update the in-memory ORIGIN_ADDRESS in skydropx service
    skydropx.updateOriginAddress(addressData);

    log('info', 'shipping.origin-address-updated');

    res.json({
      success: true,
      message: 'Dirección de origen actualizada',
      address: addressData
    });
  } catch (error) {
    logError('shipping.error-updating-origin-address', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ========================================
// GENERATE SHIPPING LABEL FOR ORDER
// POST /api/shipping/orders/:orderId/generate
// Auto-calculates boxes based on order items and pieces per box
// ========================================
router.post('/orders/:orderId/generate', async (req, res) => {
  const { orderId } = req.params;
  const { labelsCount: manualLabelsCount, autoCalculate = true } = req.body;

  try {
    // Get order with client info
    const orderResult = await query(`
      SELECT
        o.id, o.order_number, o.client_id, o.total_price, o.status, o.approval_status,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as existing_labels
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = orderResult.rows[0];

    // Get order items to calculate boxes
    const itemsResult = await query(`
      SELECT product_name, quantity
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);

    // Calculate boxes based on items
    const { totalBoxes, breakdown } = calculateBoxesForOrder(itemsResult.rows);

    // Use manual count if provided, otherwise use calculated
    const labelsCount = manualLabelsCount || (autoCalculate ? totalBoxes : 1);

    log('info', 'shipping.debug');
    log('info', 'shipping.generating-labels');


    // Check if order is approved (labels are generated on approval)
    if (order.approval_status !== 'approved') {
      return res.status(400).json({
        error: 'El pedido debe estar aprobado antes de generar guías'
      });
    }

    // Check if labels already generated
    if (parseInt(order.existing_labels) > 0) {
      return res.status(400).json({
        error: 'Las guías ya fueron generadas para esta orden'
      });
    }

    // Validate client has shipping address
    const postal = order.postal || order.postal_code;
    if (!postal || !order.city || !order.state) {
      return res.status(400).json({
        error: 'El cliente no tiene dirección de envío completa'
      });
    }

    // Build destination address
    const destAddress = {
      name: order.client_name,
      phone: order.client_phone,
      email: order.client_email,
      street: order.street,
      street_number: order.street_number,
      colonia: order.colonia,
      city: order.city,
      state: order.state,
      postal: postal,
      reference_notes: order.reference_notes
    };

    log('info', 'shipping.creating-multigua-with-packages-for-order');

    // Get quote for shipping (with multiple packages for multiguía)
    const quote = await skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, labelsCount);

    if (!quote.rates || quote.rates.length === 0) {
      return res.status(400).json({
        error: 'No hay tarifas de envío disponibles para esta dirección'
      });
    }

    // Auto-select best (cheapest) rate
    const selectedRate = skydropx.selectBestRate(quote.rates);

    // Create ONE shipment with multiple packages (MULTIGUÍA)
    const shipment = await skydropx.createShipment(
      quote.quotation_id,
      selectedRate.rate_id,
      selectedRate,
      destAddress,
      skydropx.DEFAULT_PACKAGE,
      labelsCount  // Number of packages in this multiguía
    );

    log('info', 'shipping.multigua-created-with-packages');

    // Save each package as a record in the database
    const generatedLabels = [];
    const packagesData = shipment.packages || [];

    for (let i = 0; i < labelsCount; i++) {
      const pkg = packagesData[i] || {};

      const insertResult = await query(`
        INSERT INTO shipping_labels (
          order_id, client_id, shipment_id, quotation_id, rate_id,
          tracking_number, tracking_url, label_url,
          carrier, service, delivery_days, shipping_cost,
          package_number, status, label_generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        orderId,
        order.client_id,
        shipment.shipment_id,
        quote.quotation_id,
        selectedRate.rate_id,
        pkg.tracking_number || shipment.master_tracking_number,
        pkg.tracking_url || shipment.tracking_url,
        pkg.label_url || shipment.label_url,
        shipment.carrier,
        shipment.service,
        shipment.delivery_days,
        shipment.shipping_cost / labelsCount, // Divide cost among packages
        i + 1,
        pkg.label_url || shipment.label_url ? 'label_generated' : 'processing'
      ]);

      generatedLabels.push(insertResult.rows[0]);
    }

    // Auto-request pickup for this multiguía
    if (shipment.shipment_id && shipment.carrier) {
      setImmediate(async () => {
        try {
          const pickupResult = await skydropx.requestPickupIfNeeded(
            shipment.shipment_id,
            shipment.carrier
          );
          log('info', 'shipping.pickup-for-multigua');
        } catch (pickupError) {
          logError('shipping.pickup.error', pickupError);
        }
      });
    }

    // Update order
    await query(`
      UPDATE orders
      SET
        shipping_labels_count = $1,
        all_labels_generated = true,
        shipping_ready = true
      WHERE id = $2
    `, [labelsCount, orderId]);

    res.json({
      success: true,
      message: `${labelsCount} guía(s) generada(s) exitosamente`,
      labelsGenerated: labelsCount,
      calculatedBoxes: totalBoxes,
      breakdown,
      labels: generatedLabels.map(label => ({
        id: label.id,
        tracking_number: label.tracking_number,
        tracking_url: label.tracking_url,
        label_url: label.label_url,
        carrier: label.carrier,
        service: label.service,
        delivery_days: label.delivery_days
      }))
    });

  } catch (error) {
    logError('shipping.error-generating-shipping-label', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// CALCULATE BOXES FOR ORDER (preview without generating)
// GET /api/shipping/orders/:orderId/calculate-boxes
// ========================================
router.get('/orders/:orderId/calculate-boxes', async (req, res) => {
  const { orderId } = req.params;

  try {
    // Get order info
    const orderResult = await query(`
      SELECT o.id, o.order_number, c.name as client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Get order items
    const itemsResult = await query(`
      SELECT product_name, quantity
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);

    if (itemsResult.rows.length === 0) {
      return res.json({
        success: true,
        order: orderResult.rows[0],
        totalBoxes: 1,
        breakdown: [],
        message: 'No hay items en el pedido, se generará 1 guía por defecto'
      });
    }

    // Calculate boxes
    const { totalBoxes, breakdown } = calculateBoxesForOrder(itemsResult.rows);

    res.json({
      success: true,
      order: orderResult.rows[0],
      totalBoxes,
      breakdown,
      piecesPerBoxConfig: PIECES_PER_BOX
    });

  } catch (error) {
    logError('shipping.error-calculating-boxes', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// GET SHIPPING LABELS FOR ORDER
// GET /api/shipping/orders/:orderId/labels
// ========================================
router.get('/orders/:orderId/labels', async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await query(`
      SELECT
        sl.*,
        o.order_number,
        c.name as client_name
      FROM shipping_labels sl
      JOIN orders o ON sl.order_id = o.id
      JOIN clients c ON sl.client_id = c.id
      WHERE sl.order_id = $1
      ORDER BY sl.package_number
    `, [orderId]);

    res.json({
      success: true,
      labels: result.rows
    });

  } catch (error) {
    logError('shipping.error-getting-shipping-labels', error);
    res.status(500).json({ error: 'Error obteniendo guías' });
  }
});

// ========================================
// LIST ALL SHIPPING LABELS (Admin)
// GET /api/shipping/labels
// ========================================
router.get('/labels', async (req, res) => {
  const {
    page = 1,
    limit = 50,
    status,
    carrier,
    search,
    startDate,
    endDate
  } = req.query;

  const offset = (page - 1) * limit;

  try {
    let whereConditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`sl.status = $${paramIndex++}`);
      params.push(status);
    }

    if (carrier) {
      whereConditions.push(`sl.carrier ILIKE $${paramIndex++}`);
      params.push(`%${carrier}%`);
    }

    if (search) {
      whereConditions.push(`(
        sl.tracking_number ILIKE $${paramIndex} OR
        o.order_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        sl.t1_client_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`sl.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      whereConditions.push(`sl.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count (LEFT JOINs to include T1 labels without client/order)
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM shipping_labels sl
      LEFT JOIN orders o ON sl.order_id = o.id
      LEFT JOIN clients c ON sl.client_id = c.id
      WHERE ${whereClause}
    `, params);

    // Get paginated results (LEFT JOINs to include T1 labels without client/order)
    const result = await query(`
      SELECT
        sl.*,
        COALESCE(o.order_number, 'Sin pedido') as order_number,
        o.total_price as order_total,
        COALESCE(c.name, sl.t1_client_name) as client_name,
        c.phone as client_phone,
        c.city as client_city,
        c.state as client_state
      FROM shipping_labels sl
      LEFT JOIN orders o ON sl.order_id = o.id
      LEFT JOIN clients c ON sl.client_id = c.id
      WHERE ${whereClause}
      ORDER BY sl.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, limit, offset]);

    // Get stats
    const statsResult = await query(`
      SELECT
        COUNT(*) as total_labels,
        COUNT(CASE WHEN status = 'label_generated' THEN 1 END) as generated,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN (is_printed IS NULL OR is_printed = false) AND label_url IS NOT NULL AND status = 'label_generated' THEN 1 END) as unprinted,
        COUNT(DISTINCT carrier) as carriers_used
      FROM shipping_labels
    `);

    res.json({
      success: true,
      labels: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      },
      stats: statsResult.rows[0]
    });

  } catch (error) {
    logError('shipping.error-listing-shipping-labels', error);
    res.status(500).json({ error: 'Error obteniendo guías' });
  }
});

// ========================================
// SHIPPING ANALYTICS
// GET /api/shipping/analytics
// ========================================
router.get('/analytics', async (req, res) => {
  try {
    const { startDate, endDate, carrier } = req.query;

    let whereClause = 'WHERE sl.shipping_cost > 0';
    const params = [];

    if (startDate) {
      params.push(startDate);
      whereClause += ` AND sl.created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereClause += ` AND sl.created_at <= $${params.length}::date + 1`;
    }
    if (carrier) {
      params.push(carrier);
      whereClause += ` AND sl.carrier ILIKE $${params.length}`;
    }

    const shipmentsResult = await query(`
      SELECT
        sl.id,
        sl.order_id,
        sl.shipping_cost,
        sl.carrier,
        sl.service,
        sl.delivery_days,
        sl.tracking_number,
        sl.package_number,
        sl.status,
        sl.created_at,
        sl.shipment_id,
        COALESCE(o.order_number, 'Sin pedido') as order_number,
        COALESCE(c.name, 'Desconocido') as client_name,
        c.city as dest_city,
        c.state as dest_state,
        c.postal as dest_postal,
        COUNT(*) OVER (PARTITION BY sl.shipment_id) as boxes_in_shipment,
        SUM(sl.shipping_cost) OVER (PARTITION BY sl.shipment_id) as shipment_total_cost
      FROM shipping_labels sl
      LEFT JOIN orders o ON sl.order_id = o.id
      LEFT JOIN clients c ON sl.client_id = c.id
      ${whereClause}
      ORDER BY sl.created_at DESC
    `, params);

    // Dedupe to one row per shipment (show totals, not per-box)
    const seen = new Set();
    const shipments = [];
    for (const row of shipmentsResult.rows) {
      const key = row.shipment_id || row.id;
      if (seen.has(key)) continue;
      seen.add(key);
      shipments.push({
        id: row.id,
        orderNumber: row.order_number,
        clientName: row.client_name,
        destination: [row.dest_city, row.dest_state].filter(Boolean).join(', '),
        postalCode: row.dest_postal,
        carrier: row.carrier,
        service: row.service,
        deliveryDays: row.delivery_days,
        boxes: parseInt(row.boxes_in_shipment),
        totalCost: parseFloat(row.shipment_total_cost),
        costPerBox: parseFloat(row.shipping_cost),
        trackingNumber: row.tracking_number,
        status: row.status,
        date: row.created_at
      });
    }

    // Summary
    const totalShipments = shipments.length;
    const avgCost = totalShipments > 0 ? shipments.reduce((s, r) => s + r.totalCost, 0) / totalShipments : 0;
    const avgCostPerBox = totalShipments > 0 ? shipments.reduce((s, r) => s + r.costPerBox, 0) / totalShipments : 0;
    const avgDays = totalShipments > 0 ? shipments.reduce((s, r) => s + (r.deliveryDays || 0), 0) / totalShipments : 0;
    const totalBoxes = shipments.reduce((s, r) => s + r.boxes, 0);

    // Carrier breakdown
    const carrierStats = {};
    shipments.forEach(s => {
      if (!carrierStats[s.carrier]) {
        carrierStats[s.carrier] = { count: 0, totalCost: 0, totalDays: 0 };
      }
      carrierStats[s.carrier].count++;
      carrierStats[s.carrier].totalCost += s.totalCost;
      carrierStats[s.carrier].totalDays += (s.deliveryDays || 0);
    });

    const carriers = Object.entries(carrierStats).map(([name, stats]) => ({
      name,
      count: stats.count,
      avgCost: stats.totalCost / stats.count,
      avgDays: stats.totalDays / stats.count
    })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      shipments,
      summary: {
        totalShipments,
        totalBoxes,
        avgCost: Math.round(avgCost * 100) / 100,
        avgCostPerBox: Math.round(avgCostPerBox * 100) / 100,
        avgDays: Math.round(avgDays * 10) / 10
      },
      carriers
    });

  } catch (error) {
    logError('shipping.error-getting-shipping-analytics', error);
    res.status(500).json({ error: 'Error obteniendo analíticas de envío' });
  }
});

// ========================================
// GET SINGLE SHIPPING LABEL
// GET /api/shipping/labels/:labelId
// ========================================
router.get('/labels/:labelId', async (req, res) => {
  const { labelId } = req.params;

  try {
    const result = await query(`
      SELECT
        sl.*,
        COALESCE(o.order_number, 'Sin pedido') as order_number,
        o.total_price as order_total,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.street, c.street_number, c.colonia,
        c.city, c.state, c.postal
      FROM shipping_labels sl
      LEFT JOIN orders o ON sl.order_id = o.id
      JOIN clients c ON sl.client_id = c.id
      WHERE sl.id = $1
    `, [labelId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    res.json({
      success: true,
      label: result.rows[0]
    });

  } catch (error) {
    logError('shipping.error-getting-shipping-label', error);
    res.status(500).json({ error: 'Error obteniendo guía' });
  }
});

// ========================================
// UPDATE SHIPPING LABEL STATUS
// PATCH /api/shipping/labels/:labelId/status
// ========================================
router.patch('/labels/:labelId/status', async (req, res) => {
  const { labelId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'processing', 'label_generated', 'shipped', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const updateFields = ['status = $1'];
    const params = [status, labelId];

    // Add timestamp based on status
    if (status === 'shipped') {
      updateFields.push('shipped_at = CURRENT_TIMESTAMP');
    } else if (status === 'delivered') {
      updateFields.push('delivered_at = CURRENT_TIMESTAMP');
    }

    const result = await query(`
      UPDATE shipping_labels
      SET ${updateFields.join(', ')}
      WHERE id = $2
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    res.json({
      success: true,
      label: result.rows[0]
    });

  } catch (error) {
    logError('shipping.error-updating-shipping-label', error);
    res.status(500).json({ error: 'Error actualizando guía' });
  }
});

// ========================================
// REFRESH TRACKING INFO FROM SKYDROPX
// POST /api/shipping/labels/:labelId/refresh
// ========================================
router.post('/labels/:labelId/refresh', async (req, res) => {
  const { labelId } = req.params;

  try {
    // Get label
    const labelResult = await query(
      'SELECT * FROM shipping_labels WHERE id = $1',
      [labelId]
    );

    if (labelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Guía no encontrada' });
    }

    const label = labelResult.rows[0];

    if (!label.shipment_id) {
      return res.status(400).json({ error: 'La guía no tiene ID de envío' });
    }

    // Fetch updated info from Skydropx
    const shipmentInfo = await skydropx.getShipment(label.shipment_id);

    // Update database
    await query(`
      UPDATE shipping_labels
      SET
        tracking_number = COALESCE($1, tracking_number),
        tracking_url = COALESCE($2, tracking_url),
        label_url = COALESCE($3, label_url),
        status = CASE WHEN $3 IS NOT NULL THEN 'label_generated' ELSE status END
      WHERE id = $4
    `, [
      shipmentInfo.tracking_number,
      shipmentInfo.tracking_url,
      shipmentInfo.label_url,
      labelId
    ]);

    // Get updated label
    const updatedResult = await query(
      'SELECT * FROM shipping_labels WHERE id = $1',
      [labelId]
    );

    res.json({
      success: true,
      label: updatedResult.rows[0]
    });

  } catch (error) {
    logError('shipping.error-refreshing-shipping-label', error);
    res.status(500).json({ error: 'Error actualizando información de guía' });
  }
});

// ========================================
// GET SHIPPING QUOTES FOR CLIENT SELECTION
// GET /api/shipping/orders/:orderId/quotes
// Returns cheapest options for client to choose
// ========================================
router.get('/orders/:orderId/quotes', async (req, res) => {
  const { orderId } = req.params;
  const { maxOptions = 5, maxPrice = 500 } = req.query; // Limit expensive options

  try {
    // Get order with client info
    const orderResult = await query(`
      SELECT
        o.id, o.order_number, o.client_id, o.approval_status,
        o.selected_carrier, o.selected_service, o.selected_rate_id,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as existing_labels
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = orderResult.rows[0];

    // Check if labels already generated
    if (parseInt(order.existing_labels) > 0) {
      return res.status(400).json({
        error: 'Las guías ya fueron generadas para esta orden',
        alreadyGenerated: true
      });
    }

    // Check for addressId param - use specific address from client_addresses table
    const addressId = req.query.addressId;
    let addressRow = null;

    if (addressId) {
      const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [addressId]);
      if (addrResult.rows.length > 0) addressRow = addrResult.rows[0];
    } else if (order.shipping_address_id) {
      const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [order.shipping_address_id]);
      if (addrResult.rows.length > 0) addressRow = addrResult.rows[0];
    }

    // Use address record if found, fallback to client table fields
    const addr = addressRow || order;
    const postal = addr.postal || order.postal || order.postal_code;

    // Validate client has shipping address
    const missing = [];
    if (!postal) missing.push('código postal');
    if (!(addr.city || order.city)) missing.push('ciudad');
    if (!(addr.state || order.state)) missing.push('estado');
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Falta en tu dirección: ' + missing.join(', ') + '. Actualiza tu dirección para cotizar envío.',
        missingFields: missing
      });
    }

    // Build destination address
    const destAddress = {
      name: order.client_name,
      phone: order.client_phone,
      email: order.client_email,
      street: addr.street || order.street,
      street_number: addr.street_number || order.street_number,
      colonia: addr.colonia || order.colonia,
      city: addr.city || order.city,
      state: addr.state || order.state,
      zip: postal,
      reference_notes: addr.reference_notes || order.reference_notes
    };

    // Calculate boxes needed for this order
    const itemsResult = await query(
      `SELECT product_name, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const { totalBoxes, breakdown } = calculateBoxesForOrder(itemsResult.rows);
    const packagesCount = Math.max(1, totalBoxes);

    log('info', 'shipping.box-calculation', { totalBoxes, packagesCount });

    // Get quote from Skydropx with correct package count
    const quote = await skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, packagesCount);

    if (!quote.rates || quote.rates.length === 0) {
      const postal = destAddress.zip;
      const diagMessages = {
        'FUERA_DE_AREA': `CP ${postal} está fuera del área de cobertura de las paqueterías.`,
        'CP_NO_RECONOCIDO': `El código postal ${postal} no es reconocido. Verifica que sea correcto.`,
        'DIRECCION_INVALIDA': `La dirección no pudo ser validada. Revisa calle, colonia y CP.`,
        'SIN_COBERTURA': `No hay cobertura de paquetería para esta zona.`
      };
      return res.status(400).json({
        error: diagMessages[quote.diagnosis] || 'No hay tarifas de envío disponibles. Verifica el código postal.',
        diagnosis: quote.diagnosis || 'UNKNOWN'
      });
    }

    // Allowed carriers - only show premium/reliable carriers
    const ALLOWED_CARRIERS = ['Estafeta', 'FedEx', 'Paquetexpress'];
    const MAX_PRICE_THRESHOLD = 200; // Only show options under $200
    const MAX_OPTIONS_TO_SHOW = 3;   // Show max 3 options

    // Filter to allowed carriers and sort by price (cheapest first)
    let allowedRates = quote.rates
      .filter(rate => {
        const isAllowedCarrier = ALLOWED_CARRIERS.some(
          allowed => rate.carrier.toLowerCase().includes(allowed.toLowerCase())
        );
        return isAllowedCarrier;
      })
      .sort((a, b) => a.total_price - b.total_price);

    // Filter to options under $200
    let filteredRates = allowedRates.filter(rate => rate.total_price < MAX_PRICE_THRESHOLD);

    // If ALL options are $200 or more, only show the cheapest one
    if (filteredRates.length === 0 && allowedRates.length > 0) {
      filteredRates = [allowedRates[0]]; // Only the cheapest
      log('info', 'shipping.all-rates-showing-only-cheapest');
    }

    // Limit to 3 cheapest options max
    filteredRates = filteredRates.slice(0, MAX_OPTIONS_TO_SHOW);

    // Format for client display - NO PRICES SHOWN TO CLIENT
    const formattedRates = filteredRates.map((rate, index) => ({
      rate_id: rate.rate_id,
      carrier: rate.carrier,
      carrier_code: rate.carrier_code,
      service: rate.service,
      service_code: rate.service_code,
      // Price stored internally but not displayed to client
      price: rate.total_price,
      days: rate.days,
      daysText: rate.days === 1 ? '1 día' : `${rate.days} días`,
      isCheapest: index === 0,
      isFastest: rate.days === Math.min(...filteredRates.map(r => r.days))
    }));

    // Check if client already selected a rate
    const previousSelection = order.selected_rate_id ? {
      rate_id: order.selected_rate_id,
      carrier: order.selected_carrier,
      service: order.selected_service
    } : null;

    res.json({
      success: true,
      quotation_id: quote.quotation_id,
      rates: formattedRates,
      packagesCount: packagesCount,
      previousSelection,
      destination: {
        city: order.city,
        state: order.state,
        postal: postal
      }
    });

  } catch (error) {
    logError('shipping.error-getting-shipping-quotes', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// SAVE CLIENT'S SELECTED SHIPPING RATE
// POST /api/shipping/orders/:orderId/select-rate
// ========================================
router.post('/orders/:orderId/select-rate', async (req, res) => {
  const { orderId } = req.params;
  const { quotation_id, rate_id, carrier, service, price, days, addressId } = req.body;

  if (!quotation_id || !rate_id) {
    return res.status(400).json({ error: 'Faltan datos de la tarifa seleccionada' });
  }

  try {
    // Verify order exists and is approved
    const orderResult = await query(`
      SELECT id, approval_status,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = orders.id) as existing_labels
      FROM orders WHERE id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = orderResult.rows[0];

    if (parseInt(order.existing_labels) > 0) {
      return res.status(400).json({ error: 'Las guías ya fueron generadas' });
    }

    // Save selected rate (and shipping_address_id if provided)
    await query(`
      UPDATE orders SET
        selected_quotation_id = $1,
        selected_rate_id = $2,
        selected_carrier = $3,
        selected_service = $4,
        selected_shipping_price = $5,
        selected_delivery_days = $6,
        shipping_rate_selected_at = CURRENT_TIMESTAMP,
        shipping_address_id = COALESCE($8, shipping_address_id)
      WHERE id = $7
    `, [quotation_id, rate_id, carrier, service, price, days, orderId, addressId || null]);

    // Get client info for label generation
    const fullOrder = await query(`
      SELECT
        o.id, o.order_number, o.client_id,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    const orderData = fullOrder.rows[0];

    // Look up address from client_addresses if addressId provided
    let addrRow = null;
    if (addressId) {
      const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [addressId]);
      if (addrResult.rows.length > 0) addrRow = addrResult.rows[0];
    }

    const addr = addrRow || orderData;
    const postal = addr.postal || orderData.postal || orderData.postal_code;

    const destAddress = {
      name: orderData.client_name,
      phone: orderData.client_phone,
      email: orderData.client_email,
      street: addr.street || orderData.street,
      street_number: addr.street_number || orderData.street_number,
      colonia: addr.colonia || orderData.colonia,
      city: addr.city || orderData.city,
      state: addr.state || orderData.state,
      zip: postal,
      reference_notes: addr.reference_notes || orderData.reference_notes
    };

    // Calculate boxes to match the quotation (quote was made with this count)
    const itemsResult = await query(
      `SELECT product_name, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const { totalBoxes, breakdown } = calculateBoxesForOrder(itemsResult.rows);
    const labelsCount = Math.max(1, totalBoxes);

    log('info', 'shipping.client-confirmed-shipping-for-order');
    log('info', 'shipping.box-calculation', { totalBoxes, labelsCount });
    log('info', 'shipping.generating-multigua');

    const selectedRate = {
      rate_id: rate_id,
      carrier: carrier,
      service: service,
      total_price: price,
      days: days
    };

    const shipment = await skydropx.createShipment(
      quotation_id,
      rate_id,
      selectedRate,
      destAddress,
      skydropx.DEFAULT_PACKAGE,
      labelsCount
    );

    // Save ALL packages to database
    const packagesData = shipment.packages || [];
    const savedLabels = [];

    for (let i = 0; i < labelsCount; i++) {
      const pkg = packagesData[i] || {};
      const insertResult = await query(`
        INSERT INTO shipping_labels (
          order_id, client_id, shipment_id, quotation_id, rate_id,
          tracking_number, tracking_url, label_url,
          carrier, service, delivery_days, shipping_cost,
          package_number, status, label_generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        orderId,
        orderData.client_id,
        shipment.shipment_id,
        quotation_id,
        rate_id,
        pkg.tracking_number || shipment.tracking_number,
        pkg.tracking_url || shipment.tracking_url,
        pkg.label_url || shipment.label_url,
        shipment.carrier,
        shipment.service,
        shipment.delivery_days,
        shipment.shipping_cost / labelsCount,
        i + 1,
        (pkg.label_url || shipment.label_url) ? 'label_generated' : 'processing'
      ]);
      savedLabels.push(insertResult.rows[0]);
    }

    // Update order shipping status
    await query(`
      UPDATE orders SET
        shipping_label_generated = true,
        shipping_labels_count = $1,
        status = 'shipping'
      WHERE id = $2
    `, [labelsCount, orderId]);

    log('info', 'shipping.labels-generated-for-order');

    // Auto-request pickup (non-blocking)
    if (shipment.shipment_id && shipment.carrier) {
      setImmediate(async () => {
        try {
          const pickupResult = await skydropx.requestPickupIfNeeded(
            shipment.shipment_id,
            shipment.carrier
          );
          log('info', 'shipping.pickup-for-label');
        } catch (pickupError) {
          logError('shipping.pickup.error', pickupError);
        }
      });
    }

    res.json({
      success: true,
      message: labelsCount + ' guía(s) generada(s) exitosamente',
      labelsCount: labelsCount,
      label: {
        tracking_number: shipment.tracking_number || shipment.master_tracking_number,
        tracking_url: shipment.tracking_url,
        label_url: shipment.label_url,
        carrier: shipment.carrier,
        service: shipment.service,
        delivery_days: shipment.delivery_days
      },
      breakdown: breakdown
    });

  } catch (error) {
    logError('shipping.error-generating-shipping-label', error);
    res.status(500).json({ error: 'Error generando guía de envío: ' + (error.message || 'Error interno') });
  }
});

// ========================================
// GENERATE LABEL WITH CLIENT'S SELECTED RATE
// POST /api/shipping/orders/:orderId/generate-selected
// ========================================
router.post('/orders/:orderId/generate-selected', async (req, res) => {
  const { orderId } = req.params;

  try {
    // Get order with selected rate and client info
    const orderResult = await query(`
      SELECT
        o.id, o.order_number, o.client_id, o.approval_status,
        o.selected_quotation_id, o.selected_rate_id, o.selected_carrier,
        o.selected_service, o.selected_shipping_price, o.selected_delivery_days,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as existing_labels
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = orderResult.rows[0];

    // Validations
    if (order.approval_status !== 'approved') {
      return res.status(400).json({ error: 'El pedido debe estar aprobado' });
    }

    if (parseInt(order.existing_labels) > 0) {
      return res.status(400).json({ error: 'Las guías ya fueron generadas' });
    }

    if (!order.selected_rate_id) {
      return res.status(400).json({ error: 'No se ha seleccionado un método de envío' });
    }

    const postal = order.postal || order.postal_code;

    // Build destination address
    const destAddress = {
      name: order.client_name,
      phone: order.client_phone,
      email: order.client_email,
      street: order.street,
      street_number: order.street_number,
      colonia: order.colonia,
      city: order.city,
      state: order.state,
      zip: postal,
      reference_notes: order.reference_notes
    };

    log('info', 'shipping.generating-label-with-client-selected-rate-for-ord');
    log('info', 'shipping.selected');

    // Create shipment with client's selected rate
    const selectedRate = {
      rate_id: order.selected_rate_id,
      carrier: order.selected_carrier,
      service: order.selected_service,
      total_price: order.selected_shipping_price,
      days: order.selected_delivery_days
    };

    const shipment = await skydropx.createShipment(
      order.selected_quotation_id,
      order.selected_rate_id,
      selectedRate,
      destAddress
    );

    // Save to database
    const insertResult = await query(`
      INSERT INTO shipping_labels (
        order_id, client_id, shipment_id, quotation_id, rate_id,
        tracking_number, tracking_url, label_url,
        carrier, service, delivery_days, shipping_cost,
        package_number, status, label_generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      orderId,
      order.client_id,
      shipment.shipment_id,
      order.selected_quotation_id,
      order.selected_rate_id,
      shipment.tracking_number,
      shipment.tracking_url,
      shipment.label_url,
      shipment.carrier,
      shipment.service,
      shipment.delivery_days,
      shipment.shipping_cost,
      1,
      shipment.label_url ? 'label_generated' : 'processing'
    ]);

    log('info', 'shipping.label-generated-for-order');

    // Auto-request pickup for this carrier (if not already scheduled)
    if (shipment.shipment_id && shipment.carrier) {
      setImmediate(async () => {
        try {
          const pickupResult = await skydropx.requestPickupIfNeeded(
            shipment.shipment_id,
            shipment.carrier
          );
          log('info', 'shipping.pickup-for-label');
        } catch (pickupError) {
          logError('shipping.pickup.error', pickupError);
        }
      });
    }

    res.json({
      success: true,
      message: 'Guía generada exitosamente',
      label: {
        id: insertResult.rows[0].id,
        tracking_number: shipment.tracking_number,
        tracking_url: shipment.tracking_url,
        label_url: shipment.label_url,
        carrier: shipment.carrier,
        service: shipment.service,
        delivery_days: shipment.delivery_days
      }
    });

  } catch (error) {
    logError('shipping.error-generating-label-with-selected-rate', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// CHECK IF ORDER CAN GENERATE SHIPPING
// GET /api/shipping/orders/:orderId/can-generate
// ========================================
router.get('/orders/:orderId/can-generate', async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await query(`
      SELECT
        o.id, o.order_number, o.approval_status,
        c.postal, c.postal_code, c.city, c.state,
        (SELECT COUNT(*) FROM shipping_labels sl WHERE sl.order_id = o.id) as existing_labels
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = result.rows[0];
    const postal = order.postal || order.postal_code;
    const hasAddress = !!(postal && order.city && order.state);
    const labelsExist = parseInt(order.existing_labels) > 0;

    res.json({
      success: true,
      canGenerate: order.approval_status === 'approved' && !labelsExist && hasAddress,
      reasons: {
        orderApproved: order.approval_status === 'approved',
        labelsNotGenerated: !labelsExist,
        hasValidAddress: hasAddress
      }
    });

  } catch (error) {
    logError('shipping.error-checking-shipping-eligibility', error);
    res.status(500).json({ error: 'Error verificando elegibilidad' });
  }
});

// ========================================
// REFRESH TRACKING NUMBER FOR A LABEL
// POST /api/shipping/labels/:labelId/refresh-tracking
// ========================================
router.post('/labels/:labelId/refresh-tracking', async (req, res) => {
  const { labelId } = req.params;

  try {
    // Get the label with shipment_id
    const labelResult = await query(`
      SELECT id, order_id, shipment_id, tracking_number, carrier
      FROM shipping_labels
      WHERE id = $1
    `, [labelId]);

    if (labelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada' });
    }

    const label = labelResult.rows[0];

    // If already has tracking number, return it
    if (label.tracking_number) {
      return res.json({
        success: true,
        tracking_number: label.tracking_number,
        message: 'Número de rastreo ya disponible'
      });
    }

    if (!label.shipment_id) {
      return res.status(400).json({ error: 'No hay ID de envío para consultar' });
    }

    // Fetch from Skydropx
    log('info', 'shipping.refreshing-tracking-for-label-shipment');
    const shipmentDetails = await skydropx.getShipment(label.shipment_id);

    if (shipmentDetails.tracking_number) {
      // Update the database
      await query(`
        UPDATE shipping_labels
        SET tracking_number = $1, tracking_url = $2, label_url = $3
        WHERE id = $4
      `, [
        shipmentDetails.tracking_number,
        shipmentDetails.tracking_url,
        shipmentDetails.label_url,
        labelId
      ]);

      log('info', 'shipping.updated-tracking-number-for-label');

      return res.json({
        success: true,
        tracking_number: shipmentDetails.tracking_number,
        tracking_url: shipmentDetails.tracking_url,
        label_url: shipmentDetails.label_url,
        message: 'Número de rastreo actualizado'
      });
    }

    res.json({
      success: false,
      message: 'Número de rastreo aún no disponible. Intente nuevamente en unos minutos.'
    });

  } catch (error) {
    logError('shipping.error-refreshing-tracking', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// REFRESH ALL PENDING TRACKING NUMBERS
// POST /api/shipping/refresh-pending-tracking
// ========================================
router.post('/refresh-pending-tracking', async (req, res) => {
  try {
    // Get all labels that are stuck processing OR missing tracking/label data
    const labelsResult = await query(`
      SELECT id, order_id, shipment_id, carrier, status, tracking_number, label_url
      FROM shipping_labels
      WHERE shipment_id IS NOT NULL
        AND (status = 'processing' OR tracking_number IS NULL OR label_url IS NULL)
        AND status NOT IN ('cancelled')
      ORDER BY label_generated_at DESC
      LIMIT 30
    `);

    if (labelsResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No hay etiquetas pendientes de número de rastreo',
        updated: 0
      });
    }

    log('info', 'shipping.refreshing-tracking-for-pending-labels');

    let updated = 0;
    const results = [];

    for (const label of labelsResult.rows) {
      try {
        const shipmentDetails = await skydropx.getShipment(label.shipment_id);

        if (shipmentDetails.tracking_number || shipmentDetails.label_url) {
          // Determine new status based on what data we got
          const newStatus = shipmentDetails.label_url ? 'label_generated' : label.status;

          await query(`
            UPDATE shipping_labels
            SET tracking_number = COALESCE($1, tracking_number),
                tracking_url = COALESCE($2, tracking_url),
                label_url = COALESCE($3, label_url),
                status = $4
            WHERE id = $5
          `, [
            shipmentDetails.tracking_number || null,
            shipmentDetails.tracking_url || null,
            shipmentDetails.label_url || null,
            newStatus,
            label.id
          ]);

          updated++;
          results.push({
            labelId: label.id,
            orderId: label.order_id,
            tracking_number: shipmentDetails.tracking_number,
            label_url: shipmentDetails.label_url,
            status: 'updated'
          });
        } else {
          results.push({
            labelId: label.id,
            orderId: label.order_id,
            status: 'still_pending'
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (labelError) {
        results.push({
          labelId: label.id,
          orderId: label.order_id,
          status: 'error',
          error: labelError.message
        });
      }
    }

    log('info', 'shipping.updated-of-labels');

    res.json({
      success: true,
      message: `Actualizados ${updated} de ${labelsResult.rows.length} etiquetas`,
      updated,
      total: labelsResult.rows.length,
      results
    });

  } catch (error) {
    logError('shipping.error-refreshing-pending-tracking', error);
    res.status(500).json({ error: 'Error actualizando rastreos pendientes' });
  }
});

// ========================================
// PICKUP ENDPOINTS
// ========================================

// ========================================
// GET PICKUP SCHEDULER STATUS
// GET /api/shipping/pickups/status
// ========================================
router.get('/pickups/status', async (req, res) => {
  try {
    const status = await pickupScheduler.getSchedulerStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logError('shipping.error-getting-pickup-status', error);
    res.status(500).json({ error: 'Error obteniendo estado de recolecciones' });
  }
});

// ========================================
// REQUEST PICKUP MANUALLY
// POST /api/shipping/pickups/request
// ========================================
router.post('/pickups/request', async (req, res) => {
  const { pickupDate, timeFrom, timeTo, triggerAll } = req.body;

  try {
    log('info', 'shipping.manual-pickup-request-triggered-from-api');

    // If triggerAll is true, request pickups for all pending labels grouped by carrier
    if (triggerAll) {
      // First, get pending labels and verify with Skydropx
      log('info', 'shipping.verifying-shipment-statuses-with-skydropx');
      const verifiedLabels = await skydropx.getPendingShipmentsForPickup({ verifyWithSkydropx: true });

      if (verifiedLabels.length === 0) {
        return res.json({
          success: true,
          message: 'No hay guías activas pendientes de recolección',
          results: []
        });
      }

      // Group by carrier
      const byCarrier = {};
      for (const label of verifiedLabels) {
        if (!byCarrier[label.carrier]) {
          byCarrier[label.carrier] = [];
        }
        byCarrier[label.carrier].push(label);
      }

      const results = [];
      for (const [carrier, labels] of Object.entries(byCarrier)) {
        try {
          const shipmentIds = labels.map(l => l.shipment_id);
          const pickupResult = await skydropx.requestPickupIfNeeded(
            shipmentIds[0],
            carrier
          );

          if (pickupResult.success) {
            // Link remaining shipments to this pickup
            if (shipmentIds.length > 1 && !pickupResult.alreadyScheduled) {
              for (let i = 1; i < shipmentIds.length; i++) {
                await query(`
                  UPDATE shipping_labels
                  SET pickup_id = $1, pickup_status = 'requested', pickup_date = $2
                  WHERE shipment_id = $3
                `, [pickupResult.pickup_id, pickupResult.pickup_date, shipmentIds[i]]);
              }
            }
          } else {
            // Skydropx failed - create local pickup and update labels
            const localPickupId = `local-${carrier.toLowerCase()}-${Date.now()}`;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
            const localPickupDate = tomorrow.toISOString().split('T')[0];

            await query(`
              INSERT INTO pickups (pickup_id, carrier, pickup_date, pickup_time_from, pickup_time_to,
                                  shipment_ids, shipment_count, status, response_data, requested_at)
              VALUES ($1, $2, $3, '09:00', '18:00', $4, $5, 'scheduled', $6, NOW())
              ON CONFLICT (pickup_id) DO NOTHING
            `, [localPickupId, carrier, localPickupDate, shipmentIds, shipmentIds.length,
                JSON.stringify({ carrier, local: true, skydropxError: pickupResult.error })]);

            for (const sid of shipmentIds) {
              await query(`
                UPDATE shipping_labels
                SET pickup_id = $1, pickup_status = 'requested', pickup_date = $2, pickup_requested_at = NOW()
                WHERE shipment_id = $3
              `, [localPickupId, localPickupDate, sid]);
            }

            pickupResult.pickup_id = localPickupId;
            pickupResult.pickup_date = localPickupDate;
            pickupResult.success = true;
            pickupResult.local = true;
          }

          results.push({
            carrier: carrier,
            success: pickupResult.success,
            pickup_id: pickupResult.pickup_id,
            pickup_date: pickupResult.pickup_date,
            shipment_count: shipmentIds.length,
            message: pickupResult.message || (pickupResult.local ? 'Programado localmente' : null),
            local: pickupResult.local || false,
            error: pickupResult.error
          });
        } catch (error) {
          results.push({
            carrier: carrier,
            success: false,
            error: 'Error interno del servidor',
            shipment_count: labels.length
          });
        }
      }

      return res.json({
        success: true,
        message: `Procesadas ${results.length} paqueterías`,
        results
      });
    }

    // Single pickup request (original behavior)
    const result = await pickupScheduler.triggerManualPickup({
      pickupDate,
      timeFrom,
      timeTo
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Recolección solicitada para ${result.pickup_date}`,
        pickup_id: result.pickup_id,
        pickup_date: result.pickup_date,
        shipment_count: result.shipment_count,
        shipments: result.shipments
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || result.message,
        shipment_count: result.shipment_count
      });
    }

  } catch (error) {
    logError('shipping.error-requesting-pickup', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// REQUEST PICKUP FOR SPECIFIC CARRIER
// POST /api/shipping/pickups/request/carrier
// ========================================
router.post('/pickups/request/carrier', async (req, res) => {
  const { carrier, pickupDate, timeFrom, timeTo, shipmentIds } = req.body;

  if (!carrier) {
    return res.status(400).json({ success: false, error: 'Carrier is required' });
  }

  try {
    log('info', 'shipping.carrier-specific-pickup-request-for');
    log('info', 'shipping.date-time');
    log('info', 'shipping.shipment-ids-provided');

    // Get pending labels for this carrier if no shipmentIds provided
    let labelsToPickup = [];

    if (shipmentIds && shipmentIds.length > 0) {
      // Use provided shipment IDs
      labelsToPickup = shipmentIds;
    } else {
      // Get pending labels for this carrier
      const pendingLabels = await skydropx.getPendingShipmentsForPickup({ verifyWithSkydropx: true });
      labelsToPickup = pendingLabels
        .filter(l => l.carrier && l.carrier.toLowerCase() === carrier.toLowerCase())
        .map(l => l.shipment_id);
    }

    log('info', 'shipping.labels-to-pickup');

    const hasLabels = labelsToPickup.length > 0;

    // Try to request pickup from Skydropx (with or without labels)
    let pickupResult;
    let skydropxSuccess = false;
    let localPickupId = null;

    try {
      pickupResult = await skydropx.requestPickup(labelsToPickup, {
        pickupDate: pickupDate,
        timeFrom: timeFrom || '09:00',
        timeTo: timeTo || '18:00',
        allowEmptyPickup: true
      });
      skydropxSuccess = pickupResult.success;
    } catch (skydropxError) {
      log('info', 'shipping.skydropx-pickup-request-failed');
      // If Skydropx fails (especially for empty pickups), save locally
      pickupResult = { success: false, error: skydropxError.message };
    }

    // If Skydropx didn't work (or we have no labels), save pickup locally
    if (!skydropxSuccess) {
      log('info', 'shipping.saving-pickup-request-locally');
      localPickupId = `local-${carrier.toLowerCase()}-${Date.now()}`;

      await query(`
        INSERT INTO pickups (pickup_id, carrier, pickup_date, pickup_time_from, pickup_time_to,
                            shipment_ids, shipment_count, status, response_data, requested_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, NOW())
      `, [
        localPickupId,
        carrier,
        pickupDate,
        timeFrom || '09:00',
        timeTo || '18:00',
        labelsToPickup,
        labelsToPickup.length,
        JSON.stringify({ carrier, local: true, note: 'Pickup scheduled without Skydropx confirmation', skydropxError: pickupResult.error || null })
      ]);

      // Update shipping labels so they stop showing as "pending"
      if (labelsToPickup.length > 0) {
        for (const shipmentId of labelsToPickup) {
          await query(`
            UPDATE shipping_labels
            SET pickup_id = $1,
                pickup_status = 'requested',
                pickup_date = $2,
                pickup_time_from = $3,
                pickup_time_to = $4,
                pickup_requested_at = NOW()
            WHERE shipment_id = $5
          `, [localPickupId, pickupDate, timeFrom || '09:00', timeTo || '18:00', shipmentId]);
        }
      }

      return res.json({
        success: true,
        message: hasLabels
          ? `Recolección de ${carrier} programada localmente (${labelsToPickup.length} guías)`
          : `Recolección de ${carrier} programada. Añade guías antes del ${pickupDate}.`,
        pickup_id: localPickupId,
        pickup_date: pickupDate,
        carrier: carrier,
        shipment_count: labelsToPickup.length,
        time_window: `${timeFrom || '09:00'} - ${timeTo || '18:00'}`,
        local: true,
        skydropx_error: pickupResult.error || null,
        note: hasLabels ? null : 'Recuerda generar guías antes de la fecha de recolección'
      });
    }

    if (pickupResult.success) {
      // Update all labels with pickup info
      if (labelsToPickup.length > 0) {
        for (const shipmentId of labelsToPickup) {
          await query(`
            UPDATE shipping_labels
            SET pickup_id = $1,
                pickup_status = 'requested',
                pickup_date = $2,
                pickup_time_from = $3,
                pickup_time_to = $4,
                pickup_requested_at = NOW()
            WHERE shipment_id = $5
          `, [pickupResult.pickup_id, pickupDate, timeFrom, timeTo, shipmentId]);
        }
      }

      // Save pickup record (with confirmation_number if returned by Skydropx)
      const confirmationNumber = pickupResult.confirmation_number || null;
      await query(`
        INSERT INTO pickups (pickup_id, carrier, pickup_date, pickup_time_from, pickup_time_to,
                            shipment_ids, shipment_count, status, confirmation_code, response_data, requested_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $9, NOW())
        ON CONFLICT (pickup_id) DO UPDATE SET
          carrier = COALESCE(pickups.carrier, EXCLUDED.carrier),
          shipment_ids = ARRAY(SELECT DISTINCT unnest(pickups.shipment_ids || EXCLUDED.shipment_ids)),
          shipment_count = pickups.shipment_count + EXCLUDED.shipment_count,
          confirmation_code = COALESCE(EXCLUDED.confirmation_code, pickups.confirmation_code),
          response_data = EXCLUDED.response_data
      `, [
        pickupResult.pickup_id,
        carrier,
        pickupDate,
        timeFrom || '09:00',
        timeTo || '18:00',
        labelsToPickup,
        labelsToPickup.length,
        confirmationNumber,
        JSON.stringify(pickupResult)
      ]);

      res.json({
        success: true,
        message: `Recolección de ${carrier} solicitada exitosamente`,
        pickup_id: pickupResult.pickup_id,
        confirmation_number: confirmationNumber,
        pickup_date: pickupDate,
        carrier: carrier,
        shipment_count: labelsToPickup.length,
        time_window: `${timeFrom || '09:00'} - ${timeTo || '18:00'}`
      });
    } else {
      res.status(400).json({
        success: false,
        error: pickupResult.error || 'Error al solicitar recolección',
        details: pickupResult
      });
    }

  } catch (error) {
    logError('shipping.error-requesting-carrier-pickup', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ========================================
// GET PENDING SHIPMENTS FOR PICKUP
// GET /api/shipping/pickups/pending
// ========================================
router.get('/pickups/pending', async (req, res) => {
  try {
    const pending = await skydropx.getPendingShipmentsForPickup();

    res.json({
      success: true,
      count: pending.length,
      pending: pending.map(s => ({
        id: s.id,
        order_id: s.order_id,
        order_number: s.order_number,
        client_name: s.client_name,
        shipment_id: s.shipment_id,
        tracking_number: s.tracking_number,
        carrier: s.carrier,
        service: s.service,
        created_at: s.created_at
      }))
    });

  } catch (error) {
    logError('shipping.error-getting-pending-pickups', error);
    res.status(500).json({ error: 'Error obteniendo envíos pendientes' });
  }
});

// ========================================
// GET PICKUP HISTORY
// GET /api/shipping/pickups/history
// ========================================
router.get('/pickups/history', async (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await query(`
      SELECT *
      FROM pickups
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await query('SELECT COUNT(*) FROM pickups');

    res.json({
      success: true,
      pickups: result.rows.map(p => ({
        id: p.id,
        pickup_id: p.pickup_id,
        pickup_date: p.pickup_date,
        pickup_time_from: p.pickup_time_from,
        pickup_time_to: p.pickup_time_to,
        shipment_count: p.shipment_count,
        shipment_ids: p.shipment_ids,
        carrier: p.carrier,
        status: p.status,
        confirmation_code: p.confirmation_code || null,
        created_at: p.created_at,
        requested_at: p.requested_at,
        response_data: p.response_data
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });

  } catch (error) {
    logError('shipping.error-getting-pickup-history', error);
    res.status(500).json({ error: 'Error obteniendo historial de recolecciones' });
  }
});

// ========================================
// DEBUG: Test Skydropx pickup creation
// GET /api/shipping/pickups/skydropx-test
// ========================================
router.get('/pickups/skydropx-test', async (req, res) => {
  try {
    const { skydropxFetch, getAccessToken } = await import('../services/skydropx.js');

    // 1. List existing pickups from Skydropx
    const pickupsRes = await skydropxFetch('/pickups');
    const pickupsData = await pickupsRes.json().catch(() => pickupsRes.text());

    // 2. Try creating a pickup with a real shipment ID if provided
    let createResult = null;
    const testShipmentId = req.query.shipment_id;
    if (testShipmentId) {
      const token = await getAccessToken();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pickupDate = req.query.date || tomorrow.toISOString().split('T')[0];

      const payload = {
        pickup: {
          address: {
            name: skydropx.ORIGIN_ADDRESS.name || 'VT Anunciando',
            company: skydropx.ORIGIN_ADDRESS.company || 'VT Anunciando',
            street1: `${skydropx.ORIGIN_ADDRESS.street} ${skydropx.ORIGIN_ADDRESS.number}`.trim(),
            zip: skydropx.ORIGIN_ADDRESS.zip,
            country_code: 'MX',
            phone: skydropx.ORIGIN_ADDRESS.phone,
            email: skydropx.ORIGIN_ADDRESS.email,
            reference: skydropx.ORIGIN_ADDRESS.reference || ''
          },
          pickup_date: pickupDate,
          pickup_time_from: '09:00',
          pickup_time_to: '18:00',
          shipment_ids: [testShipmentId]
        }
      };

      // Try all known Skydropx URLs (SDK uses /api/v1 not /v1)
      const urls = [
        'https://api.skydropx.com/api/v1/pickups',
        'https://api.skydropx.com/v1/pickups',
        'https://pro.skydropx.com/api/v1/pickups',
        'https://app.skydropx.com/api/v1/pickups'
      ];

      const results = [];
      for (const url of urls) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          const text = await r.text();
          let parsed;
          try { parsed = JSON.parse(text); } catch { parsed = text.substring(0, 500); }
          results.push({ url, status: r.status, response: parsed });
        } catch (e) {
          results.push({ url, error: e.message });
        }
      }
      createResult = { payload, results };
    }

    res.json({
      success: true,
      existingPickups: pickupsData?.data?.length || 0,
      pickups: pickupsData,
      createTest: createResult,
      usage: 'Add ?shipment_id=UUID to test creating a pickup. Add &date=YYYY-MM-DD for specific date.'
    });
  } catch (error) {
    res.json({ success: false, error: 'Error interno del servidor' });
  }
});

// ========================================
// GET SINGLE PICKUP DETAILS
// GET /api/shipping/pickups/:pickupId
// ========================================
router.get('/pickups/:pickupId', async (req, res) => {
  const { pickupId } = req.params;

  try {
    // Get pickup from database
    const pickupResult = await query(`
      SELECT * FROM pickups WHERE pickup_id = $1 OR id::text = $1
    `, [pickupId]);

    if (pickupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recolección no encontrada' });
    }

    const pickup = pickupResult.rows[0];

    // Get associated shipping labels
    const labelsResult = await query(`
      SELECT
        sl.*,
        o.order_number,
        c.name as client_name
      FROM shipping_labels sl
      JOIN orders o ON sl.order_id = o.id
      JOIN clients c ON o.client_id = c.id
      WHERE sl.pickup_id = $1
    `, [pickup.pickup_id]);

    res.json({
      success: true,
      pickup: {
        id: pickup.id,
        pickupId: pickup.pickup_id,
        pickupDate: pickup.pickup_date,
        timeFrom: pickup.pickup_time_from,
        timeTo: pickup.pickup_time_to,
        shipmentCount: pickup.shipment_count,
        status: pickup.status,
        createdAt: pickup.created_at,
        requestedAt: pickup.requested_at
      },
      shipments: labelsResult.rows.map(l => ({
        id: l.id,
        orderNumber: l.order_number,
        clientName: l.client_name,
        trackingNumber: l.tracking_number,
        carrier: l.carrier,
        service: l.service
      }))
    });

  } catch (error) {
    logError('shipping.error-getting-pickup-details', error);
    res.status(500).json({ error: 'Error obteniendo detalles de recolección' });
  }
});

// ========================================
// UPDATE PICKUP (CONFIRMATION CODE, STATUS)
// PATCH /api/shipping/pickups/:pickupId
// ========================================
router.patch('/pickups/:pickupId', async (req, res) => {
  const { pickupId } = req.params;
  const { confirmationCode, status } = req.body;

  try {
    const pickupResult = await query(`
      SELECT * FROM pickups WHERE pickup_id = $1
    `, [pickupId]);

    if (pickupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Recolección no encontrada' });
    }

    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (confirmationCode !== undefined) {
      updates.push(`confirmation_code = $${paramIdx++}`);
      values.push(confirmationCode);
    }

    if (status) {
      updates.push(`status = $${paramIdx++}`);
      values.push(status);
      if (status === 'confirmed') {
        updates.push(`confirmed_at = NOW()`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay datos para actualizar' });
    }

    values.push(pickupId);
    await query(`
      UPDATE pickups SET ${updates.join(', ')} WHERE pickup_id = $${paramIdx}
    `, values);

    // If confirming, also update shipping labels
    if (status === 'confirmed') {
      await query(`
        UPDATE shipping_labels
        SET pickup_status = 'confirmed'
        WHERE pickup_id = $1
      `, [pickupId]);
    }

    res.json({
      success: true,
      message: 'Recolección actualizada',
      pickup_id: pickupId,
      confirmationCode: confirmationCode || null,
      status: status || pickupResult.rows[0].status
    });

  } catch (error) {
    logError('shipping.error-updating-pickup', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ========================================
// CANCEL A PICKUP
// DELETE /api/shipping/pickups/:pickupId
// ========================================
router.delete('/pickups/:pickupId', async (req, res) => {
  const { pickupId } = req.params;

  try {
    // Get pickup from database
    const pickupResult = await query(`
      SELECT * FROM pickups WHERE pickup_id = $1
    `, [pickupId]);

    if (pickupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recolección no encontrada' });
    }

    // Only try to cancel in Skydropx if it's not a local pickup
    const isLocal = pickupId.startsWith('local-');
    if (!isLocal) {
      try {
        await skydropx.cancelPickup(pickupId);
      } catch (skydropxErr) {
        log('info', 'shipping.could-not-cancel-in-skydropx');
      }
    }

    // Update database
    await query(`
      UPDATE pickups SET status = 'cancelled' WHERE pickup_id = $1
    `, [pickupId]);

    // Update shipping labels back to pending
    await query(`
      UPDATE shipping_labels
      SET pickup_status = 'pending', pickup_id = NULL
      WHERE pickup_id = $1
    `, [pickupId]);

    res.json({
      success: true,
      message: 'Recolección cancelada exitosamente'
    });

  } catch (error) {
    logError('shipping.error-cancelling-pickup', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// GENERATE SHIPPING LABEL FOR CLIENT (NO ORDER)
// POST /api/shipping/clients/:clientId/generate
// Allows creating shipping labels directly for a client
// without requiring an associated order
// ========================================
router.post('/clients/:clientId/generate', async (req, res) => {
  const { clientId } = req.params;
  const { labelsCount = 1, notes, quotationId, rateId, selectedRate } = req.body;

  try {
    // Get client info
    const clientResult = await query(`
      SELECT
        c.id, c.name, c.phone, c.email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes
      FROM clients c
      WHERE c.id = $1
    `, [clientId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    const client = clientResult.rows[0];

    // Validate client has shipping address
    const postal = client.postal || client.postal_code;
    const missingFields = [];
    if (!client.street) missingFields.push('calle');
    if (!client.city) missingFields.push('ciudad');
    if (!client.state) missingFields.push('estado');
    if (!postal) missingFields.push('código postal');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Dirección incompleta. Faltan: ${missingFields.join(', ')}. Edita el cliente en la sección de Clientes.`,
        missingFields: missingFields,
        client: {
          id: client.id,
          name: client.name,
          street: client.street,
          city: client.city,
          state: client.state,
          postal: postal
        }
      });
    }

    // Build destination address
    const destAddress = {
      name: client.name,
      phone: client.phone,
      email: client.email,
      street: client.street,
      street_number: client.street_number,
      colonia: client.colonia,
      city: client.city,
      state: client.state,
      postal: postal,
      reference_notes: client.reference_notes
    };

    log('info', 'shipping.creating-multigua-with-packages-for-client-no-orde');
    log('info', 'shipping.address-cp');

    // Use the original quotation_id from the user's selected rate directly.
    // The quoting endpoint already fired 4+ parallel quotes and returned the
    // correct quotation_id per rate. Re-quoting is unreliable because Skydropx
    // randomly omits carriers from multi-package quotes.
    let finalRate;
    let finalQuotationId;

    if (quotationId && rateId && selectedRate) {
      // Use the original quotation_id + rate_id from the quoting step
      log('info', 'shipping.using-original-quote-quotation');
      finalRate = selectedRate;
      finalQuotationId = quotationId;

      // Safety check: if this rate is flagged as single-package estimate but we need
      // multiple packages, the quotation_id won't work. This shouldn't happen anymore
      // (quoting endpoint now filters these out), but guard against it.
      if (selectedRate.isEstimated && labelsCount > 1) {
        log('info', 'shipping.rate-was-single-package-estimate-for-packages-atte');
        const freshQuotePromises = [];
        for (let i = 0; i < 3; i++) {
          freshQuotePromises.push(
            skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, labelsCount).catch(() => null)
          );
        }
        const freshResults = await Promise.all(freshQuotePromises);
        let found = false;
        for (const q of freshResults) {
          if (!q?.rates?.length) continue;
          const match = q.rates.find(r =>
            r.carrier === selectedRate.carrier && r.service === selectedRate.service
          );
          if (match) {
            log('info', 'shipping.found-in-fresh-multi-package-quote');
            finalRate = match;
            finalQuotationId = q.quotation_id;
            found = true;
            break;
          }
        }
        if (!found) {
          log('info', 'shipping.not-available-for-packages');
          return res.status(400).json({
            success: false,
            error: `${selectedRate.carrier} – ${selectedRate.service} no soporta envíos de ${labelsCount} paquetes. Por favor selecciona otra paquetería.`
          });
        }
      }
    } else {
      // No pre-selected rate — get a fresh quote and pick cheapest
      log('info', 'shipping.no-pre-selected-rate-getting-fresh-quote');
      const quote = await skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, labelsCount);
      if (!quote?.rates?.length) {
        return res.status(400).json({
          success: false,
          error: `No hay tarifas de envío disponibles para: ${client.city}, ${client.state} CP ${postal}.`
        });
      }
      finalRate = skydropx.selectBestRate(quote.rates);
      finalQuotationId = quote.quotation_id;
    }

    // Generate ONE shipment with multiple packages (MULTIGUÍA)
    log('info', 'shipping.creating-multigua-with-packages-for-client');
    log('info', 'shipping.carrier');

    const shipment = await skydropx.createShipment(
      finalQuotationId,
      finalRate.rate_id,
      finalRate,
      destAddress,
      skydropx.DEFAULT_PACKAGE,
      labelsCount  // Number of packages in this multiguía
    );

    // Save each package as a separate database record
    const generatedLabels = [];
    const packagesArray = shipment.packages || [shipment]; // Fallback to single package

    for (let i = 0; i < packagesArray.length; i++) {
      const pkg = packagesArray[i];

      // Save to database (order_id is NULL for client-only labels)
      const insertResult = await query(`
        INSERT INTO shipping_labels (
          order_id, client_id, shipment_id, quotation_id, rate_id,
          tracking_number, tracking_url, label_url,
          carrier, service, delivery_days, shipping_cost,
          package_number, status, label_generated_at
        ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        clientId,
        shipment.shipment_id,
        finalQuotationId,
        finalRate.rate_id,
        pkg.tracking_number || shipment.tracking_number,
        pkg.tracking_url || shipment.tracking_url,
        pkg.label_url || shipment.label_url,
        shipment.carrier,
        shipment.service,
        shipment.delivery_days,
        shipment.shipping_cost,
        i + 1,
        (pkg.label_url || shipment.label_url) ? 'label_generated' : 'processing'
      ]);

      generatedLabels.push(insertResult.rows[0]);
    }

    // Auto-request pickup ONCE for the entire shipment
    if (shipment.shipment_id && shipment.carrier) {
      setImmediate(async () => {
        try {
          const pickupResult = await skydropx.requestPickupIfNeeded(
            shipment.shipment_id,
            shipment.carrier
          );
          log('info', 'shipping.pickup-for-multigua');
        } catch (pickupError) {
          logError('shipping.pickup.error', pickupError);
        }
      });
    }

    log('info', 'shipping.generated-multigua-with-packages-for-client');

    res.json({
      success: true,
      message: `${labelsCount} guía(s) generada(s) exitosamente para ${client.name}`,
      labels: generatedLabels.map(label => ({
        id: label.id,
        tracking_number: label.tracking_number,
        tracking_url: label.tracking_url,
        label_url: label.label_url,
        carrier: label.carrier,
        service: label.service,
        delivery_days: label.delivery_days
      })),
      client: {
        id: client.id,
        name: client.name,
        city: client.city,
        state: client.state
      }
    });

  } catch (error) {
    logError('shipping.error-generating-shipping-label-for-client', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ========================================
// GET SHIPPING QUOTES FOR CLIENT (NO ORDER)
// GET /api/shipping/clients/:clientId/quotes
// ========================================
router.get('/clients/:clientId/quotes', async (req, res) => {
  const { clientId } = req.params;
  const packagesCount = parseInt(req.query.packagesCount) || 1;

  try {
    // Get client info
    const clientResult = await query(`
      SELECT
        c.id, c.name, c.phone, c.email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes
      FROM clients c
      WHERE c.id = $1
    `, [clientId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const client = clientResult.rows[0];

    // Check for addressId param - use specific address from client_addresses table
    const addressId = req.query.addressId;
    let addressRow = null;

    if (addressId) {
      const addrResult = await query('SELECT * FROM client_addresses WHERE id = $1', [addressId]);
      if (addrResult.rows.length > 0) addressRow = addrResult.rows[0];
    }

    // Use address record if found, fallback to client table fields
    const addr = addressRow || client;
    const postal = addr.postal || client.postal || client.postal_code;

    // Validate client has shipping address
    if (!postal || !(addr.city || client.city) || !(addr.state || client.state)) {
      return res.status(400).json({
        error: 'El cliente no tiene dirección de envío completa'
      });
    }

    // Build destination address
    const destAddress = {
      name: client.name,
      phone: client.phone,
      email: client.email,
      street: addr.street || client.street,
      street_number: addr.street_number || client.street_number,
      colonia: addr.colonia || client.colonia,
      city: addr.city || client.city,
      state: addr.state || client.state,
      zip: postal,
      reference_notes: addr.reference_notes || client.reference_notes
    };

    log('info', 'shipping.getting-shipping-quotes-for-client-packages');

    // Strategy: Skydropx multi-package quotes are INCONSISTENT — they randomly
    // omit carriers (e.g. FedEx) even though they support multi-package.
    // Fix: Fire 1 single + 3 multi quotes in PARALLEL to maximize the chance of
    // capturing every carrier at bulk rate. Merge all results.

    let singlePackageQuote = null;
    const multiRatesMap = new Map(); // carrier-service → best multi rate
    let bestMultiQuotationId = null;

    // Fire all quote requests in parallel: 1 single + 3 multi
    const quotePromises = [
      skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, 1).catch(err => {
        log('info', 'shipping.single-quote-error');
        return null;
      })
    ];

    if (packagesCount > 1) {
      // Fire 3 multi-package quotes in parallel to maximize carrier coverage
      for (let i = 0; i < 3; i++) {
        quotePromises.push(
          skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, packagesCount).catch(err => {
            log('info', 'shipping.multi-quote-error');
            return null;
          })
        );
      }
    }

    const quoteResults = await Promise.all(quotePromises);
    const singleResult = quoteResults[0];
    const multiResults = quoteResults.slice(1);

    if (singleResult?.rates?.length > 0) singlePackageQuote = singleResult;

    // Merge all multi-package results — keep cheapest rate per carrier-service
    for (const multi of multiResults) {
      if (multi?.rates?.length > 0) {
        if (!bestMultiQuotationId) bestMultiQuotationId = multi.quotation_id;
        multi.rates.forEach(rate => {
          const key = `${rate.carrier}-${rate.service}`;
          const existing = multiRatesMap.get(key);
          if (!existing || rate.total_price < existing.total_price) {
            multiRatesMap.set(key, { ...rate, quotation_id: multi.quotation_id });
          }
        });
      }
    }

    log('info', 'shipping.quotes-single-carriers-multi-carriers-from-3-succe');

    // If everything failed, retry once more
    if ((!singlePackageQuote?.rates?.length) && multiRatesMap.size === 0) {
      log('info', 'shipping.no-rates-from-any-quote-retrying');
      await new Promise(r => setTimeout(r, 1500));
      try {
        const retry = await skydropx.getQuote(destAddress, skydropx.DEFAULT_PACKAGE, packagesCount > 1 ? packagesCount : 1);
        if (retry?.rates?.length > 0) {
          if (packagesCount > 1) {
            bestMultiQuotationId = retry.quotation_id;
            retry.rates.forEach(rate => {
              multiRatesMap.set(`${rate.carrier}-${rate.service}`, { ...rate, quotation_id: retry.quotation_id });
            });
          } else {
            singlePackageQuote = retry;
          }
        }
      } catch (err) {
        log('info', 'shipping.retry-error');
      }
    }

    if ((!singlePackageQuote?.rates?.length) && multiRatesMap.size === 0) {
      // Get diagnosis from any quote attempt
      const diagnosis = singleResult?.diagnosis || multiResults?.find(r => r?.diagnosis)?.diagnosis;
      const addr = addressRow || client;
      const postal = addr.postal || client.postal || client.postal_code;

      const diagMessages = {
        'FUERA_DE_AREA': `Todas las paqueterías reportan que CP ${postal} (${addr.city || client.city}) está fuera de su área de cobertura. Verifica que el código postal sea correcto.`,
        'CP_NO_RECONOCIDO': `El código postal ${postal} no es reconocido por las paqueterías. Verifica que sea un CP válido para ${addr.city || client.city}, ${addr.state || client.state}.`,
        'DIRECCION_INVALIDA': `La dirección no pudo ser validada por las paqueterías. Verifica: calle "${addr.street || client.street}", colonia "${addr.colonia || client.colonia}", CP ${postal}.`,
        'SIN_COBERTURA': `No hay cobertura de paquetería disponible para ${addr.city || client.city}, ${addr.state || client.state} (CP ${postal}). Puede ser una zona de difícil acceso.`
      };

      return res.status(400).json({
        error: diagMessages[diagnosis] || `No hay tarifas de envío disponibles para CP ${postal} (${addr.city || client.city}). Verifica la dirección.`,
        diagnosis: diagnosis || 'UNKNOWN',
        address: {
          street: addr.street || client.street,
          colonia: addr.colonia || client.colonia,
          city: addr.city || client.city,
          state: addr.state || client.state,
          postal: postal
        }
      });
    }

    // Step 3: Build combined rates — for each carrier, pick the LOWEST price
    const ratesMap = new Map();

    // Add all multi-package rates (real bulk pricing)
    multiRatesMap.forEach((rate, key) => {
      ratesMap.set(key, {
        ...rate,
        total_price: rate.total_price,
        source: 'multi',
        quotation_id: rate.quotation_id
      });
    });

    // For multi-package orders: only add single-quote rates if the carrier also exists
    // in multi-package quotes (i.e. single × N is cheaper). Never add carriers that
    // ONLY appear in single-package quotes — their quotation_id won't work for N packages.
    // For single-package orders: add all single-quote rates normally.
    if (singlePackageQuote?.rates) {
      singlePackageQuote.rates.forEach(rate => {
        const key = `${rate.carrier}-${rate.service}`;
        const estimatedTotal = rate.total_price * packagesCount;
        const existing = ratesMap.get(key);

        if (!existing && packagesCount === 1) {
          // Single-package order: safe to add any carrier from single quote
          ratesMap.set(key, {
            ...rate,
            total_price: estimatedTotal,
            source: 'single_estimated',
            quotation_id: singlePackageQuote.quotation_id
          });
        } else if (!existing && packagesCount > 1) {
          // Multi-package order: carrier ONLY in single quote — skip it.
          // Its quotation_id is for 1 package and will fail at generation time.
          log('info', 'shipping.skipping-only-available-in-single-package-quote-in');
        } else if (existing && estimatedTotal < existing.total_price) {
          // Carrier exists in both — single × N is cheaper, use lower price
          // but keep the multi-package quotation_id so generation works
          ratesMap.set(key, {
            ...existing,
            total_price: estimatedTotal,
            source: 'single_cheaper',
            quotation_id: existing.quotation_id  // keep multi-package quotation_id
          });
        }
      });
    }

    // Sort by price (cheapest first)
    const combinedRates = Array.from(ratesMap.values())
      .sort((a, b) => a.total_price - b.total_price);

    // Format rates
    const formattedRates = combinedRates.map((rate, index) => {
      const totalPrice = rate.total_price;
      const pricePerPackage = packagesCount > 1 ? (totalPrice / packagesCount) : totalPrice;
      return {
        rate_id: rate.rate_id,
        carrier: rate.carrier,
        service: rate.service,
        price: totalPrice,
        pricePerPackage: pricePerPackage,
        priceFormatted: `$${totalPrice.toFixed(2)}`,
        pricePerPackageFormatted: `$${pricePerPackage.toFixed(2)}`,
        days: rate.days,
        daysText: rate.days === 1 ? '1 día' : `${rate.days} días`,
        isCheapest: index === 0,
        isEstimated: rate.source === 'single_estimated',
        quotation_id: rate.quotation_id
      };
    });

    res.json({
      success: true,
      quotation_id: bestMultiQuotationId || singlePackageQuote?.quotation_id,
      packagesCount: packagesCount,
      rates: formattedRates,
      client: {
        id: client.id,
        name: client.name,
        city: client.city,
        state: client.state,
        postal: postal
      }
    });

  } catch (error) {
    logError('shipping.error-getting-shipping-quotes-for-client', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ========================================
// PRINTER MANAGEMENT
// ========================================

/**
 * GET /shipping/printers
 * Lists available system printers
 */
router.get('/printers', async (req, res) => {
  try {
    const { execFileSync } = await import('child_process');
    const output = execFileSync('lpstat', ['-p'], { encoding: 'utf8', timeout: 5000 });
    let defaultPrinter = null;
    try {
      const defaultOutput = execFileSync('lpstat', ['-d'], { encoding: 'utf8', timeout: 5000 });
      const defaultMatch = defaultOutput.match(/destination:\s*(.+)/);
      defaultPrinter = defaultMatch ? defaultMatch[1].trim() : null;
    } catch (_) {}

    const printers = [];
    for (const line of output.split('\n')) {
      const match = line.match(/^printer\s+(\S+)\s+is\s+(.+)/);
      if (match) {
        printers.push({
          name: match[1],
          status: match[2].trim(),
          isDefault: match[1] === defaultPrinter
        });
      }
    }

    res.json({ success: true, printers, defaultPrinter });
  } catch (error) {
    res.json({ success: true, printers: [], defaultPrinter: null, error: 'No printers found' });
  }
});

/**
 * POST /shipping/labels/print
 * Downloads label PDFs and sends them to the system printer
 * Body: { labelIds: [1, 2, 3], printer?: "PRINTER_NAME" }
 */
router.post('/labels/print', async (req, res) => {
  try {
    const { labelIds, printer } = req.body;

    if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ success: false, error: 'labelIds array required' });
    }

    if (labelIds.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 labels per print job' });
    }

    if (!labelIds.every(id => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ success: false, error: 'Invalid label IDs' });
    }

    const placeholders = labelIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `SELECT id, label_url, tracking_number FROM shipping_labels WHERE id IN (${placeholders}) AND label_url IS NOT NULL`,
      labelIds
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No printable labels found' });
    }

    const { execFileSync } = await import('child_process');
    const tmpDir = mkdtempSync(join(tmpdir(), 'axkan-labels-'));
    let printed = 0;
    let failed = 0;
    const errors = [];

    for (const label of result.rows) {
      try {
        const response = await fetch(label.label_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const filePath = join(tmpDir, `label-${label.id}.pdf`);
        writeFileSync(filePath, buffer);

        const args = [];
        if (printer) { args.push('-d', printer); }
        args.push(filePath);
        execFileSync('lp', args, { timeout: 10000 });

        printed++;

        try { unlinkSync(filePath); } catch (_) {}
      } catch (err) {
        failed++;
        errors.push({ id: label.id, tracking: label.tracking_number, error: err.message });
      }
    }

    try { rmdirSync(tmpDir); } catch (_) {}

    // Mark successfully printed labels
    if (printed > 0) {
      const printedIds = result.rows.map(r => r.id);
      const ph = printedIds.map((_, i) => `$${i + 1}`).join(',');
      await query(
        `UPDATE shipping_labels SET is_printed = true, printed_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`,
        printedIds
      );
    }

    res.json({ success: true, printed, failed, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    logError('shipping.print-error', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /shipping/labels/mark-printed
 * Manually mark labels as printed (for print-proxy or manual printing)
 */
router.post('/labels/mark-printed', async (req, res) => {
  try {
    const { labelIds } = req.body;
    if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ success: false, error: 'labelIds array required' });
    }
    const ph = labelIds.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE shipping_labels SET is_printed = true, printed_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`,
      labelIds
    );
    res.json({ success: true, marked: labelIds.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /shipping/labels/mark-unprinted
 * Mark labels as not printed
 */
router.post('/labels/mark-unprinted', async (req, res) => {
  try {
    const { labelIds } = req.body;
    if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0) {
      return res.status(400).json({ success: false, error: 'labelIds array required' });
    }
    const ph = labelIds.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE shipping_labels SET is_printed = false, printed_at = NULL WHERE id IN (${ph})`,
      labelIds
    );
    res.json({ success: true, marked: labelIds.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
