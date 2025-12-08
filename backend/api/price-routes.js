/**
 * Price Tracking & Analytics API Routes
 * Handles price history, cost tracking, margins, and insights
 */

import express from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// Apply authentication to all price routes
router.use(authMiddleware);

// =====================================================
// DASHBOARD & OVERVIEW
// =====================================================

/**
 * GET /api/prices/dashboard
 * Get comprehensive pricing dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const days = parseInt(period);

    // Get summary statistics
    const summaryQuery = await query(`
      SELECT
        COUNT(DISTINCT p.id) AS total_products,
        AVG(p.base_price - p.production_cost) AS avg_profit_per_product,
        AVG(
          CASE
            WHEN p.base_price > 0 THEN ((p.base_price - p.production_cost) / p.base_price * 100)
            ELSE 0
          END
        ) AS avg_profit_margin,
        MIN(
          CASE
            WHEN p.base_price > 0 THEN ((p.base_price - p.production_cost) / p.base_price * 100)
            ELSE 0
          END
        ) AS min_margin,
        MAX(
          CASE
            WHEN p.base_price > 0 THEN ((p.base_price - p.production_cost) / p.base_price * 100)
            ELSE 0
          END
        ) AS max_margin
      FROM products p
      WHERE p.is_active = true
    `);

    // Get recent price changes
    const priceChangesQuery = await query(`
      SELECT COUNT(*) AS price_changes
      FROM product_price_history
      WHERE effective_date >= CURRENT_DATE - $1::integer
    `, [days]);

    // Get revenue and profit trends
    const trendsQuery = await query(`
      SELECT
        DATE_TRUNC('day', order_date) AS date,
        COUNT(*) AS order_count,
        SUM(total_price) AS revenue,
        SUM(total_production_cost) AS costs,
        SUM(profit) AS profit,
        AVG(profit_margin) AS avg_margin
      FROM orders
      WHERE order_date >= CURRENT_DATE - $1::integer
        AND status != 'cancelled'
      GROUP BY DATE_TRUNC('day', order_date)
      ORDER BY date ASC
    `, [days]);

    // Get products with margin issues (below 20% or negative)
    const marginAlertsQuery = await query(`
      SELECT
        id,
        name,
        base_price,
        production_cost,
        CASE
          WHEN base_price > 0 THEN ((base_price - production_cost) / base_price * 100)
          ELSE 0
        END AS margin_pct
      FROM products
      WHERE is_active = true
        AND (
          (base_price - production_cost) / NULLIF(base_price, 0) * 100 < 20
          OR (base_price - production_cost) < 0
        )
      ORDER BY margin_pct ASC
      LIMIT 10
    `);

    // Get top performing products by profit
    const topProductsQuery = await query(`
      SELECT
        p.id,
        p.name,
        p.category,
        p.base_price,
        p.production_cost,
        COALESCE(SUM(oi.line_profit), 0) AS total_profit,
        COALESCE(SUM(oi.quantity), 0) AS units_sold,
        CASE
          WHEN p.base_price > 0 THEN ((p.base_price - p.production_cost) / p.base_price * 100)
          ELSE 0
        END AS margin_pct
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id
        AND o.order_date >= CURRENT_DATE - $1::integer
        AND o.status != 'cancelled'
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.category, p.base_price, p.production_cost
      ORDER BY total_profit DESC
      LIMIT 10
    `, [days]);

    // Get pricing insights (table may not exist, so handle gracefully)
    let insightsRows = [];
    try {
      const insightsQuery = await query(`
        SELECT
          id,
          insight_type,
          severity,
          title,
          description,
          current_value,
          recommended_value,
          potential_impact,
          generated_at
        FROM pricing_insights
        WHERE status = 'active'
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'warning' THEN 2
            ELSE 3
          END,
          generated_at DESC
        LIMIT 20
      `);
      insightsRows = insightsQuery.rows;
    } catch (insightError) {
      console.warn('pricing_insights table may not exist:', insightError.message);
    }

    res.json({
      success: true,
      data: {
        summary: summaryQuery.rows[0] || {},
        recentChanges: priceChangesQuery.rows[0] || {},
        trends: trendsQuery.rows || [],
        marginAlerts: marginAlertsQuery.rows || [],
        topProducts: topProductsQuery.rows || [],
        insights: insightsRows
      }
    });

  } catch (error) {
    console.error('Error fetching price dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// PRODUCT PRICE HISTORY
// =====================================================

/**
 * GET /api/prices/products
 * Get all products with current pricing
 */
router.get('/products', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM cost_analysis
      ORDER BY product_name ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching products pricing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prices/products/:productId/history
 * Get price history for a specific product
 */
router.get('/products/:productId/history', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 50 } = req.query;

    const result = await query(`
      SELECT
        id,
        base_price,
        production_cost,
        material_cost,
        labor_cost,
        overhead_cost,
        profit_margin,
        change_reason,
        changed_by,
        effective_date,
        created_at
      FROM product_price_history
      WHERE product_id = $1
      ORDER BY effective_date DESC, created_at DESC
      LIMIT $2
    `, [productId, limit]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching product price history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prices/products/:productId
 * Update product price and track in history
 */
router.post('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      base_price,
      production_cost,
      material_cost,
      labor_cost,
      overhead_cost,
      change_reason
    } = req.body;

    // Update product
    await query(`
      UPDATE products
      SET
        base_price = $1,
        production_cost = $2,
        material_cost = $3,
        labor_cost = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [base_price, production_cost, material_cost, labor_cost, productId]);

    // Record in history (trigger will also fire, but we add explicit entry with reason)
    const historyResult = await query(`
      INSERT INTO product_price_history (
        product_id,
        base_price,
        production_cost,
        material_cost,
        labor_cost,
        overhead_cost,
        change_reason,
        changed_by,
        effective_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
      RETURNING *
    `, [
      productId,
      base_price,
      production_cost,
      material_cost,
      labor_cost,
      overhead_cost || 0,
      change_reason || 'Price updated',
      'admin' // In production, get from JWT token
    ]);

    res.json({
      success: true,
      message: 'Product price updated successfully',
      data: historyResult.rows[0]
    });

  } catch (error) {
    console.error('Error updating product price:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// MATERIAL COSTS
// =====================================================

/**
 * GET /api/prices/materials/:materialId/history
 * Get cost history for a material
 */
router.get('/materials/:materialId/history', async (req, res) => {
  try {
    const { materialId } = req.params;

    const result = await query(`
      SELECT
        id,
        cost_per_unit,
        supplier_name,
        purchase_quantity,
        total_purchase_amount,
        invoice_number,
        invoice_date,
        invoice_url,
        effective_date,
        created_at
      FROM material_cost_history
      WHERE material_id = $1
      ORDER BY effective_date DESC
      LIMIT 50
    `, [materialId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching material cost history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prices/materials/:materialId/cost
 * Record new material cost from purchase
 */
router.post('/materials/:materialId/cost', async (req, res) => {
  try {
    const { materialId } = req.params;
    const {
      cost_per_unit,
      supplier_name,
      purchase_quantity,
      total_purchase_amount,
      invoice_number,
      invoice_date,
      invoice_url
    } = req.body;

    const result = await query(`
      INSERT INTO material_cost_history (
        material_id,
        cost_per_unit,
        supplier_name,
        purchase_quantity,
        total_purchase_amount,
        invoice_number,
        invoice_date,
        invoice_url,
        effective_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
      RETURNING *
    `, [
      materialId,
      cost_per_unit,
      supplier_name,
      purchase_quantity,
      total_purchase_amount,
      invoice_number,
      invoice_date,
      invoice_url
    ]);

    // Update material's current cost
    await query(`
      UPDATE materials
      SET cost_per_unit = $1
      WHERE id = $2
    `, [cost_per_unit, materialId]);

    res.json({
      success: true,
      message: 'Material cost recorded successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error recording material cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// TRENDS & ANALYTICS
// =====================================================

/**
 * GET /api/prices/trends
 * Get price and cost trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const { months = 6 } = req.query;

    // Refresh materialized view
    await query('SELECT refresh_price_trends()');

    const result = await query(`
      SELECT
        TO_CHAR(month, 'YYYY-MM') AS month_label,
        month,
        product_id,
        product_name,
        avg_price,
        avg_cost,
        avg_margin,
        change_count,
        last_change_date
      FROM price_trends_monthly
      WHERE month >= CURRENT_DATE - $1::integer * INTERVAL '1 month'
      ORDER BY month DESC, product_name ASC
    `, [months]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching price trends:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/prices/margins
 * Get margin performance analysis
 */
router.get('/margins', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await query(`
      SELECT
        order_id,
        order_number,
        order_date,
        total_price,
        total_production_cost,
        profit,
        actual_margin,
        expected_margin,
        margin_variance
      FROM margin_performance
      ORDER BY order_date DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching margin analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// INSIGHTS & RECOMMENDATIONS
// =====================================================

/**
 * GET /api/prices/insights
 * Get all active pricing insights
 */
router.get('/insights', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        i.id,
        i.insight_type,
        i.severity,
        i.title,
        i.description,
        i.current_value,
        i.recommended_value,
        i.potential_impact,
        i.status,
        i.generated_at,
        i.valid_until,
        p.name AS product_name,
        m.name AS material_name
      FROM pricing_insights i
      LEFT JOIN products p ON i.product_id = p.id
      LEFT JOIN materials m ON i.material_id = m.id
      WHERE i.status = 'active'
      ORDER BY
        CASE i.severity
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          ELSE 3
        END,
        i.generated_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching pricing insights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prices/insights
 * Create a new pricing insight/recommendation
 */
router.post('/insights', async (req, res) => {
  try {
    const {
      insight_type,
      severity,
      title,
      description,
      product_id,
      material_id,
      current_value,
      recommended_value,
      potential_impact,
      valid_until
    } = req.body;

    const result = await query(`
      INSERT INTO pricing_insights (
        insight_type,
        severity,
        title,
        description,
        product_id,
        material_id,
        current_value,
        recommended_value,
        potential_impact,
        valid_until
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      insight_type,
      severity,
      title,
      description,
      product_id,
      material_id,
      current_value,
      recommended_value,
      potential_impact,
      valid_until
    ]);

    res.json({
      success: true,
      message: 'Insight created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating insight:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/prices/insights/:insightId/dismiss
 * Dismiss an insight
 */
router.put('/insights/:insightId/dismiss', async (req, res) => {
  try {
    const { insightId } = req.params;

    await query(`
      UPDATE pricing_insights
      SET
        status = 'dismissed',
        dismissed_at = CURRENT_TIMESTAMP,
        dismissed_by = $1
      WHERE id = $2
    `, ['admin', insightId]); // In production, get user from JWT

    res.json({
      success: true,
      message: 'Insight dismissed successfully'
    });

  } catch (error) {
    console.error('Error dismissing insight:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prices/insights/:insightId/implement
 * Mark insight as implemented
 */
router.post('/insights/:insightId/implement', async (req, res) => {
  try {
    const { insightId } = req.params;

    await query(`
      UPDATE pricing_insights
      SET status = 'implemented'
      WHERE id = $1
    `, [insightId]);

    res.json({
      success: true,
      message: 'Insight marked as implemented'
    });

  } catch (error) {
    console.error('Error implementing insight:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// MARKET BENCHMARKS
// =====================================================

/**
 * GET /api/prices/benchmarks
 * Get market price benchmarks
 */
router.get('/benchmarks', async (req, res) => {
  try {
    const { category } = req.query;

    let queryStr = `
      SELECT
        id,
        product_category,
        product_name,
        competitor_name,
        competitor_price,
        our_price,
        price_difference,
        price_difference_pct,
        source_url,
        notes,
        recorded_date
      FROM market_price_benchmarks
    `;

    const params = [];
    if (category) {
      queryStr += ' WHERE product_category = $1';
      params.push(category);
    }

    queryStr += ' ORDER BY recorded_date DESC LIMIT 100';

    const result = await query(queryStr, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/prices/benchmarks
 * Add market benchmark
 */
router.post('/benchmarks', async (req, res) => {
  try {
    const {
      product_category,
      product_name,
      competitor_name,
      competitor_price,
      our_price,
      source_url,
      notes
    } = req.body;

    const result = await query(`
      INSERT INTO market_price_benchmarks (
        product_category,
        product_name,
        competitor_name,
        competitor_price,
        our_price,
        source_url,
        notes,
        recorded_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
      RETURNING *
    `, [
      product_category,
      product_name,
      competitor_name,
      competitor_price,
      our_price,
      source_url,
      notes
    ]);

    res.json({
      success: true,
      message: 'Benchmark added successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding benchmark:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
