/**
 * Price Tracking & Analytics API Routes
 * Handles price history, cost tracking, margins, and insights
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';
import { log, logError } from '../shared/logger.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// products/ folder at the repo root (two levels up from backend/api/)
const PRODUCTS_DIR = path.resolve(__dirname, '../../products');
const COSTS_XLSX_PATH = path.join(PRODUCTS_DIR, 'costs.xlsx');

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
      log('warn', 'price.pricinginsights-table-may-not-exist');
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
    logError('price.error-fetching-price-dashboard', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-products-pricing', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-product-price-history', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-updating-product-price', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-material-cost-history', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-recording-material-cost', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-price-trends', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-margin-analysis', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-pricing-insights', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-creating-insight', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-dismissing-insight', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-implementing-insight', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-fetching-benchmarks', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
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
    logError('price.error-adding-benchmark', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// =====================================================
// HAND-EDITED COST SHEET (products/costs.xlsx)
// Single workbook with 3 sheets: Products, Breakdown, Materials.
// Fallback: if costs.xlsx is missing, try the legacy 3 CSVs.
// =====================================================

/**
 * Read a named sheet from products/costs.xlsx and return an array of
 * row objects keyed by the header row. Returns [] if file/sheet missing.
 *
 * The styled workbook has: row 1 = title (merged), row 2 = section labels,
 * row 3 = snake_case headers, row 4+ = data. We pass range:2 so SheetJS
 * treats row 3 as the header row.
 */
function readXlsxSheet(sheetName) {
  if (!fs.existsSync(COSTS_XLSX_PATH)) return null;
  try {
    const wb = XLSX.readFile(COSTS_XLSX_PATH, { cellFormula: false });
    const actual = wb.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase());
    if (!actual) return [];
    const sheet = wb.Sheets[actual];
    // raw:true keeps numbers as Numbers (avoids "$140.00" strings).
    // range:2 skips the merged title + section-label rows — headers live in row 3.
    return XLSX.utils.sheet_to_json(sheet, { range: 2, defval: '', raw: true });
  } catch (err) {
    logError('price.error-reading-xlsx-sheet', err);
    return null;
  }
}

/**
 * Tiny RFC-4180-ish CSV parser — handles quoted fields and embedded commas.
 * Returns an array of objects keyed by the header row.
 */
function parseCsv(text) {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        // Skip blank lines
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  // Tail
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
}

function readCsvFile(filename) {
  const filePath = path.join(PRODUCTS_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return parseCsv(text);
  } catch (err) {
    logError('price.error-reading', err);
    return [];
  }
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Tolerate currency strings like "$140.00" or "2,400" or "12.5%"
  const cleaned = String(v).replace(/[$,%\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/prices/cost-sheet
 * Reads products/costs.xlsx (3 sheets: Config, Products, Materials) and
 * returns a merged JSON view used by the admin "Hoja de Costos" tab.
 *
 * Cost model:
 *   - All products share the same per-piece cost, computed by summing
 *     Materials.cost_per_piece across all rows (materials + overhead).
 *   - Overhead rows (variable=yes) with monthly_cost_mxn filled are
 *     auto-divided: monthly_cost / (Config.work_days × Config.pieces_per_day)
 *   - Material rows with bulk_cost_mxn + divisors compute:
 *     bulk_cost / (div1 × div2 × div3 × div4)
 *   - Otherwise cost_per_piece is taken as-entered.
 *   - Per-product: margin = price - cost_per_piece
 */
router.get('/cost-sheet', async (req, res) => {
  try {
    let configRaw = readXlsxSheet('Config') || [];
    let productsRaw = readXlsxSheet('Products') || [];
    let materialsRaw = readXlsxSheet('Materials') || [];
    const source = 'xlsx';

    // --- Parse Config into a key/value map ---
    const config = {};
    for (const row of configRaw) {
      const k = (row.key || '').trim();
      if (k) config[k] = row.value;
    }
    const piecesPerDay = toNumber(config.pieces_per_day) || 2400;
    const workDays = toNumber(config.work_days_per_month) || 20;
    const monthlyCapacity = workDays * piecesPerDay; // pieces/month

    // --- Compute cost_per_piece for each material row ---
    // Skip the footer TOTAL row (label starts with emoji or "TOTAL")
    const materials = materialsRaw
      .filter(row => {
        const m = (row.material || '').toString().trim();
        if (!m) return false;
        if (/^(💰|TOTAL)/i.test(m)) return false;
        return true;
      })
      .map(row => {
      const manualPerPiece = toNumber(row.cost_per_piece_mxn);
      const bulk = toNumber(row.bulk_cost_mxn);
      const monthly = toNumber(row.monthly_cost_mxn);
      const divs = [row.div1, row.div2, row.div3, row.div4]
        .map(toNumber)
        .filter(d => d != null && d > 0);

      let costPerPiece = null;
      let computedBy = null;

      if (monthly != null && monthlyCapacity > 0) {
        costPerPiece = monthly / monthlyCapacity;
        computedBy = 'monthly_over_capacity';
      } else if (bulk != null && divs.length > 0) {
        costPerPiece = bulk / divs.reduce((a, b) => a * b, 1);
        computedBy = 'bulk_over_divisors';
      } else if (manualPerPiece != null) {
        costPerPiece = manualPerPiece;
        computedBy = 'manual';
      }

      return {
        material: row.material,
        cost_per_piece_mxn: costPerPiece,
        cost_per_piece_manual: manualPerPiece,
        variable: /^(yes|variable|si|sí)$/i.test((row.variable || '').toString().trim()),
        bulk_cost_mxn: bulk,
        monthly_cost_mxn: monthly,
        div1: toNumber(row.div1),
        div2: toNumber(row.div2),
        div3: toNumber(row.div3),
        div4: toNumber(row.div4),
        computed_by: computedBy,
        notes: row.notes || ''
      };
    });

    const totalCostPerPiece = materials.reduce(
      (s, m) => s + (m.cost_per_piece_mxn || 0),
      0
    );

    // --- Build product list with margin calcs ---
    const products = productsRaw.map(row => {
      const sku = (row.sku || '').toString().trim();
      const priceUnit = toNumber(row.price_unit_mxn);
      const priceWholesale = toNumber(row.price_wholesale_mxn);

      const marginUnitMxn = priceUnit != null
        ? priceUnit - totalCostPerPiece
        : null;
      const marginUnitPct = (priceUnit != null && priceUnit > 0)
        ? (marginUnitMxn / priceUnit) * 100
        : null;

      const marginWholesaleMxn = priceWholesale != null
        ? priceWholesale - totalCostPerPiece
        : null;
      const marginWholesalePct = (priceWholesale != null && priceWholesale > 0)
        ? (marginWholesaleMxn / priceWholesale) * 100
        : null;

      return {
        sku,
        name: row.name || sku,
        cost_per_piece_mxn: totalCostPerPiece,
        price_unit_mxn: priceUnit,
        price_wholesale_mxn: priceWholesale,
        margin_unit_mxn: marginUnitMxn,
        margin_unit_pct: marginUnitPct,
        margin_wholesale_mxn: marginWholesaleMxn,
        margin_wholesale_pct: marginWholesalePct,
        notes: row.notes || ''
      };
    });

    // --- Summary stats for the top-of-tab cards ---
    const pricedUnit = products.filter(p => p.price_unit_mxn != null);
    const pricedWholesale = products.filter(p => p.price_wholesale_mxn != null);
    const avgMarginUnit = pricedUnit.length
      ? pricedUnit.reduce((s, p) => s + (p.margin_unit_pct || 0), 0) / pricedUnit.length
      : null;
    const avgMarginWholesale = pricedWholesale.length
      ? pricedWholesale.reduce((s, p) => s + (p.margin_wholesale_pct || 0), 0) / pricedWholesale.length
      : null;

    res.json({
      success: true,
      data: {
        config: {
          pieces_per_day: piecesPerDay,
          work_days_per_month: workDays,
          monthly_capacity: monthlyCapacity
        },
        cost_per_piece_total: totalCostPerPiece,
        products,
        materials,
        summary: {
          total_products: products.length,
          priced_products: pricedUnit.length,
          unpriced_products: products.length - pricedUnit.length,
          cost_per_piece_mxn: totalCostPerPiece,
          avg_margin_unit_pct: avgMarginUnit,
          avg_margin_wholesale_pct: avgMarginWholesale,
          source,
          generated_at: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    logError('price.error-loading-cost-sheet', error);
    res.status(500).json({
      success: false,
      error: 'Error leyendo products/ CSVs: ' + error.message
    });
  }
});

export default router;
