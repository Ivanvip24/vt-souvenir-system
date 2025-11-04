/**
 * MATERIAL MANAGER
 * Handles all material inventory operations
 */

import { query, getClient } from '../../shared/database.js';

/**
 * Get all materials with current status
 */
export async function getAllMaterials() {
  const result = await query(`
    SELECT * FROM material_inventory_status
    ORDER BY
      CASE stock_status
        WHEN 'out_of_stock' THEN 1
        WHEN 'critical' THEN 2
        WHEN 'low' THEN 3
        WHEN 'healthy' THEN 4
      END,
      name
  `);

  return result.rows;
}

/**
 * Get single material by ID
 */
export async function getMaterialById(materialId) {
  const result = await query(`
    SELECT m.*,
      (SELECT COUNT(*) FROM inventory_alerts ia
       WHERE ia.material_id = m.id AND ia.is_active = true) as active_alerts_count
    FROM materials m
    WHERE m.id = $1
  `, [materialId]);

  return result.rows[0];
}

/**
 * Create new material
 */
export async function createMaterial(materialData) {
  const {
    name,
    description,
    unitType,
    unitSize,
    currentStock = 0,
    minStockLevel,
    reorderPoint,
    reorderQuantity,
    supplierName,
    supplierContact,
    supplierLeadTimeDays = 7,
    costPerUnit
  } = materialData;

  const result = await query(`
    INSERT INTO materials (
      name, description, unit_type, unit_size, current_stock,
      min_stock_level, reorder_point, reorder_quantity,
      supplier_name, supplier_contact, supplier_lead_time_days, cost_per_unit
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    name, description, unitType, unitSize, currentStock,
    minStockLevel, reorderPoint, reorderQuantity,
    supplierName, supplierContact, supplierLeadTimeDays, costPerUnit
  ]);

  return result.rows[0];
}

/**
 * Update material
 */
export async function updateMaterial(materialId, updates) {
  const allowedFields = [
    'description', 'unit_type', 'unit_size', 'min_stock_level',
    'reorder_point', 'reorder_quantity', 'supplier_name', 'supplier_contact',
    'supplier_lead_time_days', 'cost_per_unit', 'is_active'
  ];

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

  values.push(materialId);

  const result = await query(`
    UPDATE materials
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCounter}
    RETURNING *
  `, values);

  return result.rows[0];
}

/**
 * Record material purchase
 */
export async function recordPurchase(purchaseData) {
  const {
    materialId,
    quantity,
    unitCost,
    supplierName,
    purchaseOrderNumber,
    notes,
    performedBy = 'System'
  } = purchaseData;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get current stock
    const materialResult = await client.query(
      'SELECT current_stock FROM materials WHERE id = $1',
      [materialId]
    );
    const stockBefore = parseFloat(materialResult.rows[0].current_stock);
    const stockAfter = stockBefore + quantity;
    const totalCost = quantity * unitCost;

    // Record transaction
    const transactionResult = await client.query(`
      INSERT INTO material_transactions (
        material_id, transaction_type, quantity, stock_before, stock_after,
        unit_cost, total_cost, supplier_name, purchase_order_number,
        notes, performed_by
      ) VALUES ($1, 'purchase', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      materialId, quantity, stockBefore, stockAfter,
      unitCost, totalCost, supplierName, purchaseOrderNumber,
      notes, performedBy
    ]);

    // Update material stock
    await client.query(`
      UPDATE materials
      SET current_stock = $1,
          last_purchase_price = $2,
          last_purchase_date = CURRENT_DATE
      WHERE id = $3
    `, [stockAfter, unitCost, materialId]);

    await client.query('COMMIT');

    return {
      success: true,
      transaction: transactionResult.rows[0],
      newStock: stockAfter
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Record material consumption
 */
export async function recordConsumption(consumptionData) {
  const {
    materialId,
    quantity,
    orderId,
    notes,
    performedBy = 'System'
  } = consumptionData;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get current stock
    const materialResult = await client.query(
      'SELECT current_stock, name FROM materials WHERE id = $1',
      [materialId]
    );
    const stockBefore = parseFloat(materialResult.rows[0].current_stock);
    const materialName = materialResult.rows[0].name;

    // Check if enough stock
    if (stockBefore < quantity) {
      throw new Error(`Insufficient stock for ${materialName}. Available: ${stockBefore}, Required: ${quantity}`);
    }

    const stockAfter = stockBefore - quantity;

    // Record transaction (quantity is negative for consumption)
    const transactionResult = await client.query(`
      INSERT INTO material_transactions (
        material_id, transaction_type, quantity, stock_before, stock_after,
        order_id, notes, performed_by
      ) VALUES ($1, 'consumption', $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      materialId, -quantity, stockBefore, stockAfter,
      orderId, notes, performedBy
    ]);

    // Update material stock
    await client.query(`
      UPDATE materials
      SET current_stock = $1
      WHERE id = $2
    `, [stockAfter, materialId]);

    // Update reservation if exists
    if (orderId) {
      await client.query(`
        UPDATE order_material_reservations
        SET quantity_consumed = quantity_consumed + $1,
            consumed_at = CURRENT_TIMESTAMP,
            reservation_status = CASE
              WHEN quantity_consumed + $1 >= quantity_reserved THEN 'consumed'
              ELSE 'partial'
            END
        WHERE order_id = $2 AND material_id = $3
      `, [quantity, orderId, materialId]);
    }

    await client.query('COMMIT');

    return {
      success: true,
      transaction: transactionResult.rows[0],
      newStock: stockAfter
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adjust material stock (manual adjustment)
 */
export async function adjustStock(adjustmentData) {
  const {
    materialId,
    newQuantity,
    reason,
    performedBy = 'System'
  } = adjustmentData;

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get current stock
    const materialResult = await client.query(
      'SELECT current_stock FROM materials WHERE id = $1',
      [materialId]
    );
    const stockBefore = parseFloat(materialResult.rows[0].current_stock);
    const difference = newQuantity - stockBefore;

    // Record transaction
    await client.query(`
      INSERT INTO material_transactions (
        material_id, transaction_type, quantity, stock_before, stock_after,
        notes, performed_by
      ) VALUES ($1, 'adjustment', $2, $3, $4, $5, $6)
    `, [
      materialId, difference, stockBefore, newQuantity,
      reason, performedBy
    ]);

    // Update material stock
    await client.query(`
      UPDATE materials
      SET current_stock = $1
      WHERE id = $2
    `, [newQuantity, materialId]);

    await client.query('COMMIT');

    return {
      success: true,
      adjustment: difference,
      newStock: newQuantity
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get material transaction history
 */
export async function getMaterialTransactions(materialId, options = {}) {
  const { limit = 50, transactionType, startDate, endDate } = options;

  let whereClause = 'WHERE material_id = $1';
  const params = [materialId];
  let paramCounter = 2;

  if (transactionType) {
    whereClause += ` AND transaction_type = $${paramCounter}`;
    params.push(transactionType);
    paramCounter++;
  }

  if (startDate) {
    whereClause += ` AND transaction_date >= $${paramCounter}`;
    params.push(startDate);
    paramCounter++;
  }

  if (endDate) {
    whereClause += ` AND transaction_date <= $${paramCounter}`;
    params.push(endDate);
    paramCounter++;
  }

  const result = await query(`
    SELECT
      mt.*,
      m.name as material_name,
      m.unit_type,
      o.order_number
    FROM material_transactions mt
    JOIN materials m ON mt.material_id = m.id
    LEFT JOIN orders o ON mt.order_id = o.id
    ${whereClause}
    ORDER BY mt.transaction_date DESC
    LIMIT $${paramCounter}
  `, [...params, limit]);

  return result.rows;
}

/**
 * Get material statistics
 */
export async function getMaterialStatistics(materialId) {
  const result = await query(`
    SELECT
      m.id,
      m.name,
      m.unit_type,
      m.current_stock,
      m.reserved_stock,
      m.available_stock,
      m.min_stock_level,
      m.reorder_point,

      -- Consumption stats
      mca.consumption_last_7_days,
      mca.consumption_last_30_days,
      mca.avg_daily_consumption,
      mca.days_of_stock_remaining,

      -- Purchase stats
      (SELECT COUNT(*)
       FROM material_transactions mt
       WHERE mt.material_id = m.id AND mt.transaction_type = 'purchase') as total_purchases,

      (SELECT SUM(quantity)
       FROM material_transactions mt
       WHERE mt.material_id = m.id AND mt.transaction_type = 'purchase') as total_purchased_quantity,

      (SELECT SUM(total_cost)
       FROM material_transactions mt
       WHERE mt.material_id = m.id AND mt.transaction_type = 'purchase') as total_purchase_cost,

      -- Consumption stats
      (SELECT COUNT(*)
       FROM material_transactions mt
       WHERE mt.material_id = m.id AND mt.transaction_type = 'consumption') as total_consumptions,

      (SELECT SUM(ABS(quantity))
       FROM material_transactions mt
       WHERE mt.material_id = m.id AND mt.transaction_type = 'consumption') as total_consumed_quantity

    FROM materials m
    LEFT JOIN material_consumption_analytics mca ON m.id = mca.material_id
    WHERE m.id = $1
  `, [materialId]);

  return result.rows[0];
}

export default {
  getAllMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  recordPurchase,
  recordConsumption,
  adjustStock,
  getMaterialTransactions,
  getMaterialStatistics
};
