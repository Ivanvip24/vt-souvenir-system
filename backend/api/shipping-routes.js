/**
 * Shipping / Guías Routes
 * Handles shipping label generation and management
 */

import express from 'express';
import { query } from '../shared/database.js';
import * as skydropx from '../services/skydropx.js';

const router = express.Router();

// ========================================
// GENERATE SHIPPING LABEL FOR ORDER
// POST /api/shipping/orders/:orderId/generate
// ========================================
router.post('/orders/:orderId/generate', async (req, res) => {
  const { orderId } = req.params;
  const { labelsCount = 1 } = req.body; // Allow override for multiple labels

  try {
    // Get order with client info
    const orderResult = await query(`
      SELECT
        o.id, o.order_number, o.client_id, o.total_price, o.status,
        o.second_payment_received, o.all_labels_generated,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        c.street, c.street_number, c.colonia, c.city, c.state,
        c.postal, c.postal_code, c.reference_notes
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    const order = orderResult.rows[0];

    // Check if second payment received
    if (!order.second_payment_received) {
      return res.status(400).json({
        error: 'El segundo pago debe estar confirmado antes de generar guías'
      });
    }

    // Check if labels already generated
    if (order.all_labels_generated) {
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

    console.log(`📦 Generating ${labelsCount} shipping label(s) for order ${order.order_number}`);

    // Get quote for shipping
    const quote = await skydropx.getQuote(destAddress);

    if (!quote.rates || quote.rates.length === 0) {
      return res.status(400).json({
        error: 'No hay tarifas de envío disponibles para esta dirección'
      });
    }

    // Auto-select best (cheapest) rate
    const selectedRate = skydropx.selectBestRate(quote.rates);

    // Generate label(s)
    const generatedLabels = [];

    for (let i = 0; i < labelsCount; i++) {
      const shipment = await skydropx.createShipment(
        quote.quotation_id,
        selectedRate.rate_id,
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
        quote.quotation_id,
        selectedRate.rate_id,
        shipment.tracking_number,
        shipment.tracking_url,
        shipment.label_url,
        shipment.carrier,
        shipment.service,
        shipment.delivery_days,
        shipment.shipping_cost,
        i + 1,
        shipment.label_url ? 'label_generated' : 'processing'
      ]);

      generatedLabels.push(insertResult.rows[0]);
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
    console.error('❌ Error generating shipping label:', error);
    res.status(500).json({ error: error.message || 'Error generando guía de envío' });
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
    console.error('❌ Error getting shipping labels:', error);
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
        c.name ILIKE $${paramIndex}
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

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM shipping_labels sl
      JOIN orders o ON sl.order_id = o.id
      JOIN clients c ON sl.client_id = c.id
      WHERE ${whereClause}
    `, params);

    // Get paginated results
    const result = await query(`
      SELECT
        sl.*,
        o.order_number,
        o.total_price as order_total,
        c.name as client_name,
        c.phone as client_phone,
        c.city as client_city,
        c.state as client_state
      FROM shipping_labels sl
      JOIN orders o ON sl.order_id = o.id
      JOIN clients c ON sl.client_id = c.id
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
    console.error('❌ Error listing shipping labels:', error);
    res.status(500).json({ error: 'Error obteniendo guías' });
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
        o.order_number,
        o.total_price as order_total,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        c.street, c.street_number, c.colonia,
        c.city, c.state, c.postal
      FROM shipping_labels sl
      JOIN orders o ON sl.order_id = o.id
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
    console.error('❌ Error getting shipping label:', error);
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
    console.error('❌ Error updating shipping label:', error);
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
    console.error('❌ Error refreshing shipping label:', error);
    res.status(500).json({ error: 'Error actualizando información de guía' });
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
        o.id, o.order_number, o.second_payment_received, o.all_labels_generated,
        c.postal, c.postal_code, c.city, c.state
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

    res.json({
      success: true,
      canGenerate: order.second_payment_received && !order.all_labels_generated && hasAddress,
      reasons: {
        secondPaymentReceived: order.second_payment_received,
        labelsNotGenerated: !order.all_labels_generated,
        hasValidAddress: hasAddress
      }
    });

  } catch (error) {
    console.error('❌ Error checking shipping eligibility:', error);
    res.status(500).json({ error: 'Error verificando elegibilidad' });
  }
});

export default router;
