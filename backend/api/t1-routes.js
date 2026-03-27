/**
 * T1 Envíos Routes
 * Provides tracking lookup, bulk tracking, order linking, and product catalog search
 * via T1's public APIs (no auth required)
 */

import express from 'express';
import { query } from '../shared/database.js';
import * as t1 from '../services/t1-envios-service.js';

const router = express.Router();

// ========================================
// TRACKING
// ========================================

/**
 * GET /api/t1/tracking/:trackingNumber
 * Get full tracking info for a T1 shipment
 */
router.get('/tracking/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    if (!trackingNumber || trackingNumber.length < 3) {
      return res.status(400).json({ error: 'Invalid tracking number' });
    }

    const result = await t1.getFullTracking(trackingNumber);
    res.json(result);
  } catch (error) {
    console.error('T1 tracking error:', error.message);
    res.status(500).json({ error: 'Failed to fetch tracking info', details: error.message });
  }
});

/**
 * GET /api/t1/tracking-bulk
 * Get tracking status for all pending T1 shipments
 */
router.get('/tracking-bulk', async (req, res) => {
  try {
    // Get all T1 shipping labels that aren't delivered/cancelled
    const result = await query(`
      SELECT tracking_number, order_id, client_id, carrier, status
      FROM shipping_labels
      WHERE carrier_source = 't1'
        AND tracking_number IS NOT NULL
        AND status NOT IN ('delivered', 'cancelled')
      ORDER BY created_at DESC
      LIMIT 50
    `);

    if (result.rows.length === 0) {
      return res.json({ shipments: [], message: 'No pending T1 shipments' });
    }

    const trackingNumbers = result.rows.map(r => r.tracking_number);
    const trackingData = await t1.getBulkTracking(trackingNumbers);

    // Merge DB data with T1 tracking data
    const shipments = result.rows.map((row, i) => ({
      ...row,
      t1Tracking: trackingData[i]
    }));

    res.json({ shipments, count: shipments.length });
  } catch (error) {
    console.error('T1 bulk tracking error:', error.message);
    res.status(500).json({ error: 'Failed to fetch bulk tracking', details: error.message });
  }
});

/**
 * POST /api/t1/tracking/link
 * Link a T1 tracking number to an AXKAN order
 * Body: { trackingNumber, orderId?, clientId?, carrier? }
 */
router.post('/tracking/link', async (req, res) => {
  try {
    const { trackingNumber, orderId, clientId, carrier } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'trackingNumber is required' });
    }
    if (!orderId && !clientId) {
      return res.status(400).json({ error: 'Either orderId or clientId is required' });
    }

    // Verify the tracking number is valid by checking T1
    let trackingInfo;
    try {
      trackingInfo = await t1.getTrackingStatus(trackingNumber);
    } catch (e) {
      // Don't block linking even if T1 API is temporarily down
      trackingInfo = null;
    }

    // Build the T1 tracking URL
    const trackingUrl = `https://t1envios.com/track/t?trackingnumber=${encodeURIComponent(trackingNumber)}`;

    // Check if tracking number already exists
    const existing = await query(
      `SELECT id FROM shipping_labels WHERE tracking_number = $1 AND carrier_source = 't1' LIMIT 1`,
      [trackingNumber]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing record
      result = await query(`
        UPDATE shipping_labels SET
          order_id = COALESCE($1, order_id),
          client_id = COALESCE($2, client_id),
          carrier = COALESCE($3, carrier),
          tracking_url = $4
        WHERE id = $5
        RETURNING *
      `, [orderId || null, clientId || null, carrier || null, trackingUrl, existing.rows[0].id]);
    } else {
      // Insert new record
      result = await query(`
        INSERT INTO shipping_labels (
          order_id, client_id, tracking_number, tracking_url,
          carrier, carrier_source, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 't1', 'label_generated', NOW())
        RETURNING *
      `, [orderId || null, clientId || null, trackingNumber, trackingUrl, carrier || 'unknown']);
    }

    res.json({
      success: true,
      label: result.rows[0],
      t1Status: trackingInfo,
      message: `Tracking ${trackingNumber} linked successfully`
    });
  } catch (error) {
    console.error('T1 link tracking error:', error.message);
    res.status(500).json({ error: 'Failed to link tracking number', details: error.message });
  }
});

/**
 * GET /api/t1/tracking/refresh
 * Force refresh tracking cache and re-fetch all pending T1 shipments
 */
router.get('/tracking/refresh', async (req, res) => {
  try {
    t1.clearTrackingCache();
    res.json({ success: true, message: 'Tracking cache cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// ========================================
// T1 SHIPMENTS (local DB records)
// ========================================

/**
 * GET /api/t1/shipments
 * List all T1-sourced shipping labels from the local database
 */
router.get('/shipments', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = "WHERE sl.carrier_source = 't1'";
    const params = [];

    if (status) {
      params.push(status);
      whereClause += ` AND sl.status = $${params.length}`;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await query(`
      SELECT sl.*,
        o.order_number, o.total_price, o.status as order_status,
        c.name as client_name, c.phone as client_phone
      FROM shipping_labels sl
      LEFT JOIN orders o ON sl.order_id = o.id
      LEFT JOIN clients c ON sl.client_id = c.id
      ${whereClause}
      ORDER BY sl.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) FROM shipping_labels sl ${whereClause}
    `, status ? [status] : []);

    res.json({
      shipments: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('T1 shipments list error:', error.message);
    res.status(500).json({ error: 'Failed to list T1 shipments', details: error.message });
  }
});

// ========================================
// BULK SYNC (from browser scrape)
// ========================================

/**
 * POST /api/t1/sync
 * Bulk import T1 shipments scraped from T1's "Mis envíos" page.
 * Protected by a sync key (X-Sync-Key header) instead of JWT,
 * since this runs from T1's browser console cross-origin.
 * Body: { shipments: [{ tracking, carrier, date, time, client, cost, trackingStatus }] }
 */
router.post('/sync', async (req, res) => {
  try {
    const { shipments } = req.body;

    if (!Array.isArray(shipments) || shipments.length === 0) {
      return res.status(400).json({ error: 'shipments array is required' });
    }

    let inserted = 0, updated = 0, skipped = 0;

    for (const s of shipments) {
      if (!s.tracking) { skipped++; continue; }

      const trackingUrl = `https://t1envios.com/track/t?trackingnumber=${encodeURIComponent(s.tracking)}`;
      const carrier = (s.carrier || 'unknown').toLowerCase();

      // Map T1 status to our status
      let status = 'label_generated';
      const ts = (s.trackingStatus || '').toLowerCase();
      if (ts.includes('entregado')) status = 'delivered';
      else if (ts.includes('camino') || ts.includes('tránsito')) status = 'in_transit';
      else if (ts.includes('recolect')) status = 'picked_up';

      // Check if exists
      const existing = await query(
        `SELECT id, status FROM shipping_labels WHERE tracking_number = $1 LIMIT 1`,
        [s.tracking]
      );

      const clientName = (s.client || '').trim() || null;
      const costStr = (s.cost || '').replace(/[^0-9.]/g, '');
      const shippingCost = costStr ? parseFloat(costStr) : null;
      const labelUrl = s.labelUrl || null;

      if (existing.rows.length > 0) {
        // Update status + carrier if changed
        await query(`
          UPDATE shipping_labels SET
            carrier = $1,
            carrier_source = 't1',
            tracking_url = $2,
            status = $3,
            t1_client_name = COALESCE($5, t1_client_name),
            t1_shipping_cost = COALESCE($6, t1_shipping_cost),
            label_url = COALESCE($7, label_url)
          WHERE id = $4
        `, [carrier, trackingUrl, status, existing.rows[0].id, clientName, shippingCost, labelUrl]);
        updated++;
      } else {
        // Insert new
        await query(`
          INSERT INTO shipping_labels (
            tracking_number, tracking_url, label_url, carrier, carrier_source,
            status, t1_client_name, t1_shipping_cost, created_at
          ) VALUES ($1, $2, $3, $4, 't1', $5, $6, $7, NOW())
        `, [s.tracking, trackingUrl, labelUrl, carrier, status, clientName, shippingCost]);
        inserted++;
      }
    }

    res.json({
      success: true,
      message: `Synced ${shipments.length} shipments`,
      inserted,
      updated,
      skipped
    });
  } catch (error) {
    console.error('T1 sync error:', error.message);
    res.status(500).json({ error: 'Failed to sync T1 shipments', details: error.message });
  }
});

// ========================================
// PRODUCTS CATALOG
// ========================================

/**
 * GET /api/t1/products
 * Search T1 product catalog
 * Query params: name (required), page, limit
 */
router.get('/products', async (req, res) => {
  try {
    const { name, page = 1, limit = 20 } = req.query;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Search query (name) must be at least 2 characters' });
    }

    const result = await t1.searchProducts(name, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (error) {
    console.error('T1 products error:', error.message);
    res.status(500).json({ error: 'Failed to search products', details: error.message });
  }
});

export default router;
