/**
 * Bill of Materials (BOM) API Routes
 * Handles raw materials and product components
 */

import express from 'express';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// Apply authentication to all BOM routes
router.use(authMiddleware);

// =====================================================
// RAW MATERIALS
// =====================================================

/**
 * GET /api/bom/materials
 * Get all raw materials
 */
router.get('/materials', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;

    let queryStr = `
      SELECT
        id,
        name,
        description,
        sku,
        unit_type,
        unit_label,
        cost_per_unit,
        purchase_unit_size,
        purchase_unit_cost,
        sheet_width,
        sheet_height,
        density,
        supplier_name,
        supplier_product_code,
        current_stock,
        min_stock_level,
        is_active,
        created_at,
        updated_at
      FROM raw_materials
    `;

    if (active_only === 'true') {
      queryStr += ' WHERE is_active = true';
    }

    queryStr += ' ORDER BY name ASC';

    const result = await query(queryStr);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching raw materials:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bom/materials/:id
 * Get single raw material
 */
router.get('/materials/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT * FROM raw_materials WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Material not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching material:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bom/materials
 * Create new raw material
 */
router.post('/materials', async (req, res) => {
  try {
    const {
      name,
      description,
      sku,
      unit_type,
      unit_label,
      cost_per_unit,
      purchase_unit_size,
      purchase_unit_cost,
      sheet_width,
      sheet_height,
      density,
      supplier_name,
      supplier_product_code,
      current_stock,
      min_stock_level
    } = req.body;

    const result = await query(`
      INSERT INTO raw_materials (
        name,
        description,
        sku,
        unit_type,
        unit_label,
        cost_per_unit,
        purchase_unit_size,
        purchase_unit_cost,
        sheet_width,
        sheet_height,
        density,
        supplier_name,
        supplier_product_code,
        current_stock,
        min_stock_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      name,
      description,
      sku,
      unit_type,
      unit_label,
      cost_per_unit,
      purchase_unit_size,
      purchase_unit_cost,
      sheet_width,
      sheet_height,
      density,
      supplier_name,
      supplier_product_code,
      current_stock || 0,
      min_stock_level
    ]);

    res.json({
      success: true,
      message: 'Material created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating material:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/bom/materials/:id
 * Update raw material
 */
router.put('/materials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      sku,
      unit_type,
      unit_label,
      cost_per_unit,
      purchase_unit_size,
      purchase_unit_cost,
      sheet_width,
      sheet_height,
      density,
      supplier_name,
      supplier_product_code,
      current_stock,
      min_stock_level,
      is_active
    } = req.body;

    const result = await query(`
      UPDATE raw_materials
      SET
        name = $1,
        description = $2,
        sku = $3,
        unit_type = $4,
        unit_label = $5,
        cost_per_unit = $6,
        purchase_unit_size = $7,
        purchase_unit_cost = $8,
        sheet_width = $9,
        sheet_height = $10,
        density = $11,
        supplier_name = $12,
        supplier_product_code = $13,
        current_stock = $14,
        min_stock_level = $15,
        is_active = $16,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17
      RETURNING *
    `, [
      name,
      description,
      sku,
      unit_type,
      unit_label,
      cost_per_unit,
      purchase_unit_size,
      purchase_unit_cost,
      sheet_width,
      sheet_height,
      density,
      supplier_name,
      supplier_product_code,
      current_stock,
      min_stock_level,
      is_active,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Material not found'
      });
    }

    res.json({
      success: true,
      message: 'Material updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/bom/materials/:id
 * Delete raw material
 */
router.delete('/materials/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if material is used in any products
    const usageCheck = await query(`
      SELECT COUNT(*) as usage_count
      FROM product_components
      WHERE raw_material_id = $1
    `, [id]);

    if (parseInt(usageCheck.rows[0].usage_count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete material that is used in product components. Deactivate it instead.'
      });
    }

    await query('DELETE FROM raw_materials WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Material deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// PRODUCT COMPONENTS (BOM)
// =====================================================

/**
 * GET /api/bom/products/:productId/components
 * Get all components for a product
 */
router.get('/products/:productId/components', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await query(`
      SELECT
        pc.id,
        pc.product_id,
        pc.raw_material_id,
        pc.quantity_needed,
        pc.unit_type,
        pc.piece_width,
        pc.piece_height,
        pc.waste_percentage,
        pc.notes,
        rm.name as material_name,
        rm.sku as material_sku,
        rm.unit_label,
        rm.cost_per_unit,
        pc.quantity_needed * rm.cost_per_unit as component_cost,
        pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100) as component_cost_with_waste
      FROM product_components pc
      JOIN raw_materials rm ON pc.raw_material_id = rm.id
      WHERE pc.product_id = $1
      ORDER BY rm.name
    `, [productId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching product components:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bom/products/:productId/components
 * Add component to product
 */
router.post('/products/:productId/components', async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      raw_material_id,
      quantity_needed,
      unit_type,
      piece_width,
      piece_height,
      waste_percentage,
      notes
    } = req.body;

    const result = await query(`
      INSERT INTO product_components (
        product_id,
        raw_material_id,
        quantity_needed,
        unit_type,
        piece_width,
        piece_height,
        waste_percentage,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      productId,
      raw_material_id,
      quantity_needed,
      unit_type,
      piece_width,
      piece_height,
      waste_percentage || 5.00,
      notes
    ]);

    res.json({
      success: true,
      message: 'Component added successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding component:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/bom/products/:productId/components/:componentId
 * Update product component
 */
router.put('/products/:productId/components/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;
    const {
      quantity_needed,
      piece_width,
      piece_height,
      waste_percentage,
      notes
    } = req.body;

    const result = await query(`
      UPDATE product_components
      SET
        quantity_needed = $1,
        piece_width = $2,
        piece_height = $3,
        waste_percentage = $4,
        notes = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [
      quantity_needed,
      piece_width,
      piece_height,
      waste_percentage,
      notes,
      componentId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Component not found'
      });
    }

    res.json({
      success: true,
      message: 'Component updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/bom/products/:productId/components/:componentId
 * Remove component from product
 */
router.delete('/products/:productId/components/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;

    await query('DELETE FROM product_components WHERE id = $1', [componentId]);

    res.json({
      success: true,
      message: 'Component removed successfully'
    });

  } catch (error) {
    console.error('Error removing component:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// BOM COST CALCULATIONS
// =====================================================

/**
 * GET /api/bom/products/:productId/cost-breakdown
 * Get detailed cost breakdown for a product
 */
router.get('/products/:productId/cost-breakdown', async (req, res) => {
  try {
    const { productId } = req.params;

    // Get product info
    const productResult = await query(`
      SELECT * FROM products WHERE id = $1
    `, [productId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const product = productResult.rows[0];

    // Get components
    const componentsResult = await query(`
      SELECT
        rm.name as material_name,
        rm.sku,
        rm.unit_label,
        rm.cost_per_unit,
        pc.quantity_needed,
        pc.waste_percentage,
        pc.quantity_needed * rm.cost_per_unit as cost,
        pc.quantity_needed * rm.cost_per_unit * (pc.waste_percentage / 100) as waste_cost,
        pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100) as total_cost
      FROM product_components pc
      JOIN raw_materials rm ON pc.raw_material_id = rm.id
      WHERE pc.product_id = $1
      ORDER BY rm.name
    `, [productId]);

    // Calculate totals
    const materialsCost = componentsResult.rows.reduce((sum, c) => sum + parseFloat(c.total_cost || 0), 0);
    const laborCost = parseFloat(product.labor_cost || 0);
    const totalCost = materialsCost + laborCost;
    const profit = parseFloat(product.base_price) - totalCost;
    const margin = product.base_price > 0 ? (profit / product.base_price * 100) : 0;

    res.json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
          base_price: parseFloat(product.base_price),
          current_production_cost: parseFloat(product.production_cost)
        },
        components: componentsResult.rows,
        summary: {
          materials_cost: materialsCost,
          labor_cost: laborCost,
          total_calculated_cost: totalCost,
          profit: profit,
          margin_pct: margin,
          cost_variance: totalCost - parseFloat(product.production_cost)
        }
      }
    });

  } catch (error) {
    console.error('Error getting cost breakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bom/cost-summary
 * Get BOM cost summary for all products
 */
router.get('/cost-summary', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM bom_cost_summary
      ORDER BY product_name
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching BOM cost summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/bom/material-usage
 * Get material usage report
 */
router.get('/material-usage', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM material_usage_report
      ORDER BY products_using_count DESC, material_name
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching material usage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/bom/calculate-area-cost
 * Calculate cost for area-based material
 */
router.post('/calculate-area-cost', async (req, res) => {
  try {
    const {
      sheet_width,
      sheet_height,
      sheet_cost,
      piece_width,
      piece_height
    } = req.body;

    const result = await query(`
      SELECT calculate_area_cost($1, $2, $3, $4, $5) as calculated_cost
    `, [sheet_width, sheet_height, sheet_cost, piece_width, piece_height]);

    res.json({
      success: true,
      data: {
        calculated_cost: parseFloat(result.rows[0].calculated_cost),
        sheet_area: sheet_width * sheet_height,
        piece_area: piece_width * piece_height,
        cost_per_cm2: sheet_cost / (sheet_width * sheet_height)
      }
    });

  } catch (error) {
    console.error('Error calculating area cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
