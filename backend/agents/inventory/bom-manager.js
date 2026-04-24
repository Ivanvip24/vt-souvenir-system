/**
 * BILL OF MATERIALS (BOM) MANAGER
 * Manages product-material relationships and calculates material requirements
 */

import { query, getClient } from '../../shared/database.js';

/**
 * Add material requirement to product (BOM entry)
 */
export async function addProductMaterial(bomData) {
  const {
    productId,
    materialId,
    quantityPerUnit,
    wastePercentage = 0,
    notes
  } = bomData;

  const result = await query(`
    INSERT INTO product_materials (
      product_id, material_id, quantity_per_unit, waste_percentage, notes
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (product_id, material_id)
    DO UPDATE SET
      quantity_per_unit = EXCLUDED.quantity_per_unit,
      waste_percentage = EXCLUDED.waste_percentage,
      notes = EXCLUDED.notes
    RETURNING *
  `, [productId, materialId, quantityPerUnit, wastePercentage, notes]);

  return result.rows[0];
}

/**
 * Get BOM for a product
 */
export async function getProductBOM(productId) {
  const result = await query(`
    SELECT
      pm.*,
      p.name as product_name,
      m.name as material_name,
      m.unit_type,
      m.current_stock,
      m.available_stock,
      m.cost_per_unit,
      (pm.effective_quantity * m.cost_per_unit) as cost_per_product
    FROM product_materials pm
    JOIN products p ON pm.product_id = p.id
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.product_id = $1
    ORDER BY m.name
  `, [productId]);

  return result.rows;
}

/**
 * Get all products using a specific material
 */
export async function getProductsUsingMaterial(materialId) {
  const result = await query(`
    SELECT
      pm.*,
      p.name as product_name,
      p.base_price,
      m.name as material_name
    FROM product_materials pm
    JOIN products p ON pm.product_id = p.id
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.material_id = $1
    ORDER BY p.name
  `, [materialId]);

  return result.rows;
}

/**
 * Calculate material requirements for an order
 */
export async function calculateOrderMaterialRequirements(orderId) {
  const result = await query(`
    SELECT
      m.id as material_id,
      m.name as material_name,
      m.unit_type,
      m.current_stock,
      m.reserved_stock,
      m.available_stock,
      SUM(oi.quantity * pm.effective_quantity) as quantity_required,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) <= m.available_stock THEN true
        ELSE false
      END as is_available,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock
        THEN SUM(oi.quantity * pm.effective_quantity) - m.available_stock
        ELSE 0
      END as shortage_quantity,
      SUM(oi.quantity * pm.effective_quantity * m.cost_per_unit) as material_cost
    FROM order_items oi
    JOIN product_materials pm ON oi.product_id = pm.product_id
    JOIN materials m ON pm.material_id = m.id
    WHERE oi.order_id = $1
    GROUP BY m.id, m.name, m.unit_type, m.current_stock, m.reserved_stock, m.available_stock
    ORDER BY
      CASE WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock THEN 0 ELSE 1 END,
      m.name
  `, [orderId]);

  return result.rows;
}

/**
 * Calculate material requirements for multiple orders
 */
export async function calculateBulkMaterialRequirements(orderIds) {
  if (!orderIds || orderIds.length === 0) {
    return [];
  }

  const result = await query(`
    SELECT
      m.id as material_id,
      m.name as material_name,
      m.unit_type,
      m.current_stock,
      m.reserved_stock,
      m.available_stock,
      SUM(oi.quantity * pm.effective_quantity) as quantity_required,
      COUNT(DISTINCT oi.order_id) as affected_orders,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) <= m.available_stock THEN true
        ELSE false
      END as is_available,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock
        THEN SUM(oi.quantity * pm.effective_quantity) - m.available_stock
        ELSE 0
      END as shortage_quantity
    FROM order_items oi
    JOIN product_materials pm ON oi.product_id = pm.product_id
    JOIN materials m ON pm.material_id = m.id
    WHERE oi.order_id = ANY($1::int[])
    GROUP BY m.id, m.name, m.unit_type, m.current_stock, m.reserved_stock, m.available_stock
    ORDER BY
      CASE WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock THEN 0 ELSE 1 END,
      m.name
  `, [orderIds]);

  return result.rows;
}

/**
 * Calculate material requirements for pending orders
 */
export async function calculatePendingOrdersRequirements() {
  const result = await query(`
    SELECT
      m.id as material_id,
      m.name as material_name,
      m.unit_type,
      m.current_stock,
      m.reserved_stock,
      m.available_stock,
      SUM(oi.quantity * pm.effective_quantity) as quantity_required,
      COUNT(DISTINCT o.id) as pending_orders_count,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) <= m.available_stock THEN true
        ELSE false
      END as is_available,
      CASE
        WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock
        THEN SUM(oi.quantity * pm.effective_quantity) - m.available_stock
        ELSE 0
      END as shortage_quantity,
      ARRAY_AGG(DISTINCT o.order_number) as affected_order_numbers
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN product_materials pm ON oi.product_id = pm.product_id
    JOIN materials m ON pm.material_id = m.id
    WHERE o.status IN ('new', 'design', 'printing', 'cutting')
    GROUP BY m.id, m.name, m.unit_type, m.current_stock, m.reserved_stock, m.available_stock
    ORDER BY
      CASE WHEN SUM(oi.quantity * pm.effective_quantity) > m.available_stock THEN 0 ELSE 1 END,
      m.name
  `);

  return result.rows;
}

/**
 * Check if order can be fulfilled with current inventory
 */
export async function checkOrderFulfillment(orderId) {
  const requirements = await calculateOrderMaterialRequirements(orderId);

  const insufficientMaterials = requirements.filter(req => !req.is_available);
  const canFulfill = insufficientMaterials.length === 0;

  return {
    orderId,
    canFulfill,
    requirements,
    insufficientMaterials,
    totalMaterialCost: requirements.reduce((sum, req) => sum + parseFloat(req.material_cost || 0), 0)
  };
}

/**
 * Reserve materials for an order
 */
export async function reserveMaterialsForOrder(orderId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Calculate requirements
    const requirements = await calculateOrderMaterialRequirements(orderId);

    // Check if can fulfill
    const insufficientMaterials = requirements.filter(req => !req.is_available);
    if (insufficientMaterials.length > 0) {
      throw new Error(`Insufficient materials: ${insufficientMaterials.map(m => m.material_name).join(', ')}`);
    }

    // Create reservations
    for (const req of requirements) {
      await client.query(`
        INSERT INTO order_material_reservations (
          order_id, material_id, quantity_reserved, reservation_status
        ) VALUES ($1, $2, $3, 'pending')
        ON CONFLICT (order_id, material_id)
        DO UPDATE SET
          quantity_reserved = EXCLUDED.quantity_reserved,
          reservation_status = 'pending',
          reserved_at = CURRENT_TIMESTAMP
      `, [orderId, req.material_id, req.quantity_required]);
    }

    await client.query('COMMIT');

    return {
      success: true,
      reservations: requirements.map(req => ({
        materialId: req.material_id,
        materialName: req.material_name,
        quantityReserved: req.quantity_required
      }))
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Release materials reserved for an order
 */
export async function releaseMaterialsForOrder(orderId) {
  const result = await query(`
    DELETE FROM order_material_reservations
    WHERE order_id = $1
    RETURNING *
  `, [orderId]);

  return {
    success: true,
    releasedReservations: result.rows.length
  };
}

/**
 * Get material reservations for an order
 */
export async function getOrderReservations(orderId) {
  const result = await query(`
    SELECT
      omr.*,
      m.name as material_name,
      m.unit_type
    FROM order_material_reservations omr
    JOIN materials m ON omr.material_id = m.id
    WHERE omr.order_id = $1
    ORDER BY m.name
  `, [orderId]);

  return result.rows;
}

/**
 * Update BOM entry
 */
export async function updateProductMaterial(productId, materialId, updates) {
  const allowedFields = ['quantity_per_unit', 'waste_percentage', 'notes'];
  const setClauses = [];
  const values = [];
  let paramCounter = 1;

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (allowedFields.includes(snakeKey)) {
      setClauses.push(`${snakeKey} = $${paramCounter}`);
      values.push(value);
      paramCounter++;
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(productId, materialId);

  const result = await query(`
    UPDATE product_materials
    SET ${setClauses.join(', ')}
    WHERE product_id = $${paramCounter} AND material_id = $${paramCounter + 1}
    RETURNING *
  `, values);

  return result.rows[0];
}

/**
 * Delete BOM entry
 */
export async function deleteProductMaterial(productId, materialId) {
  const result = await query(`
    DELETE FROM product_materials
    WHERE product_id = $1 AND material_id = $2
    RETURNING *
  `, [productId, materialId]);

  return result.rowCount > 0;
}

export default {
  addProductMaterial,
  getProductBOM,
  getProductsUsingMaterial,
  calculateOrderMaterialRequirements,
  calculateBulkMaterialRequirements,
  calculatePendingOrdersRequirements,
  checkOrderFulfillment,
  reserveMaterialsForOrder,
  releaseMaterialsForOrder,
  getOrderReservations,
  updateProductMaterial,
  deleteProductMaterial
};
