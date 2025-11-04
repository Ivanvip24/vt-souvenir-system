/**
 * FORECASTING & ALERT ENGINE
 * Predicts material depletion and generates smart alerts
 */

import { query, getClient } from '../../shared/database.js';
import { calculatePendingOrdersRequirements } from './bom-manager.js';

/**
 * Calculate consumption forecast for a material
 */
export async function calculateMaterialForecast(materialId) {
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
      m.supplier_lead_time_days,

      -- Consumption analytics
      mca.consumption_last_7_days,
      mca.consumption_last_30_days,
      mca.avg_daily_consumption,

      -- Calculate days of stock
      CASE
        WHEN mca.avg_daily_consumption > 0 THEN
          ROUND((m.available_stock / mca.avg_daily_consumption)::numeric, 0)
        ELSE NULL
      END as days_of_available_stock,

      CASE
        WHEN mca.avg_daily_consumption > 0 THEN
          ROUND((m.current_stock / mca.avg_daily_consumption)::numeric, 0)
        ELSE NULL
      END as days_of_total_stock

    FROM materials m
    LEFT JOIN material_consumption_analytics mca ON m.id = mca.material_id
    WHERE m.id = $1
  `, [materialId]);

  if (result.rows.length === 0) {
    throw new Error('Material not found');
  }

  const material = result.rows[0];

  // Calculate estimated depletion date
  let estimatedDepletionDate = null;
  let estimatedTotalDepletionDate = null;

  if (material.avg_daily_consumption > 0) {
    const daysUntilDepletion = Math.floor(material.available_stock / material.avg_daily_consumption);
    const daysUntilTotalDepletion = Math.floor(material.current_stock / material.avg_daily_consumption);

    if (daysUntilDepletion > 0) {
      estimatedDepletionDate = new Date();
      estimatedDepletionDate.setDate(estimatedDepletionDate.getDate() + daysUntilDepletion);
    }

    if (daysUntilTotalDepletion > 0) {
      estimatedTotalDepletionDate = new Date();
      estimatedTotalDepletionDate.setDate(estimatedTotalDepletionDate.getDate() + daysUntilTotalDepletion);
    }
  }

  // Determine stock status and alert level
  const { stockStatus, alertLevel, alertMessage, recommendedAction } =
    determineStockStatus(material, estimatedDepletionDate);

  return {
    materialId: material.id,
    materialName: material.name,
    unitType: material.unit_type,
    currentStock: parseFloat(material.current_stock),
    reservedStock: parseFloat(material.reserved_stock),
    availableStock: parseFloat(material.available_stock),
    minStockLevel: parseFloat(material.min_stock_level),
    reorderPoint: parseFloat(material.reorder_point),
    consumption: {
      last7Days: parseFloat(material.consumption_last_7_days || 0),
      last30Days: parseFloat(material.consumption_last_30_days || 0),
      avgDaily: parseFloat(material.avg_daily_consumption || 0)
    },
    forecast: {
      daysOfAvailableStock: parseInt(material.days_of_available_stock) || null,
      daysOfTotalStock: parseInt(material.days_of_total_stock) || null,
      estimatedDepletionDate,
      estimatedTotalDepletionDate
    },
    status: {
      stockStatus,
      alertLevel,
      alertMessage,
      recommendedAction
    },
    supplier: {
      leadTimeDays: material.supplier_lead_time_days
    }
  };
}

/**
 * Determine stock status and generate alerts
 */
function determineStockStatus(material, estimatedDepletionDate) {
  const availableStock = parseFloat(material.available_stock);
  const reorderPoint = parseFloat(material.reorder_point);
  const minStockLevel = parseFloat(material.min_stock_level);
  const leadTimeDays = material.supplier_lead_time_days || 7;
  const daysOfStock = material.days_of_available_stock;

  let stockStatus = 'healthy';
  let alertLevel = 'healthy';
  let alertMessage = 'Stock levels are healthy';
  let recommendedAction = 'No action needed';

  // Critical: Out of stock or insufficient for pending orders
  if (availableStock <= 0) {
    stockStatus = 'out_of_stock';
    alertLevel = 'critical';
    alertMessage = `⚫ OUT OF STOCK: ${material.name} has no available stock`;
    recommendedAction = `URGENT: Order immediately! Reserved: ${material.reserved_stock} ${material.unit_type}`;
  }
  // Critical: Below minimum stock level
  else if (availableStock < minStockLevel) {
    stockStatus = 'critical';
    alertLevel = 'critical';
    alertMessage = `🔴 CRITICAL: ${material.name} below minimum stock level`;
    recommendedAction = `Order NOW! Lead time: ${leadTimeDays} days. Current: ${availableStock}, Min: ${minStockLevel}`;
  }
  // Critical: Will run out within lead time
  else if (daysOfStock !== null && daysOfStock < leadTimeDays) {
    stockStatus = 'critical';
    alertLevel = 'critical';
    alertMessage = `🔴 CRITICAL: ${material.name} will run out in ${daysOfStock} days`;
    recommendedAction = `Order NOW! Stock will deplete before next delivery (${leadTimeDays} day lead time)`;
  }
  // Warning: Below reorder point
  else if (availableStock < reorderPoint) {
    stockStatus = 'low';
    alertLevel = 'warning';
    alertMessage = `🟡 WARNING: ${material.name} below reorder point`;

    if (daysOfStock !== null) {
      const orderByDate = new Date();
      orderByDate.setDate(orderByDate.getDate() + (daysOfStock - leadTimeDays));
      recommendedAction = `Order within ${Math.max(0, daysOfStock - leadTimeDays)} days (by ${orderByDate.toLocaleDateString()})`;
    } else {
      recommendedAction = `Consider ordering soon. Available: ${availableStock}, Reorder point: ${reorderPoint}`;
    }
  }
  // Healthy
  else {
    stockStatus = 'healthy';
    alertLevel = 'healthy';
    alertMessage = `🟢 ${material.name} stock is healthy`;

    if (daysOfStock !== null) {
      recommendedAction = `Stock sufficient for ${daysOfStock} days. No action needed.`;
    } else {
      recommendedAction = 'No consumption data yet. Monitor usage.';
    }
  }

  return { stockStatus, alertLevel, alertMessage, recommendedAction };
}

/**
 * Generate or update alerts for a material
 */
export async function generateAlertForMaterial(materialId) {
  const forecast = await calculateMaterialForecast(materialId);

  // Only create alert if not healthy
  if (forecast.status.alertLevel === 'healthy') {
    // Deactivate existing alerts
    await query(`
      UPDATE inventory_alerts
      SET is_active = false, resolved_at = CURRENT_TIMESTAMP
      WHERE material_id = $1 AND is_active = true
    `, [materialId]);

    return null;
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Deactivate old alerts
    await client.query(`
      UPDATE inventory_alerts
      SET is_active = false, resolved_at = CURRENT_TIMESTAMP
      WHERE material_id = $1 AND is_active = true
    `, [materialId]);

    // Create new alert
    const alertType = forecast.status.stockStatus === 'out_of_stock' ? 'out_of_stock' :
                      forecast.status.stockStatus === 'critical' ? 'reorder_needed' :
                      'low_stock';

    const result = await client.query(`
      INSERT INTO inventory_alerts (
        material_id, alert_level, alert_type, alert_message,
        current_stock, reserved_stock, available_stock, min_stock_level,
        estimated_depletion_date, days_until_depletion, recommended_action,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      RETURNING *
    `, [
      materialId,
      forecast.status.alertLevel,
      alertType,
      forecast.status.alertMessage,
      forecast.currentStock,
      forecast.reservedStock,
      forecast.availableStock,
      forecast.minStockLevel,
      forecast.forecast.estimatedDepletionDate,
      forecast.forecast.daysOfAvailableStock,
      forecast.status.recommendedAction
    ]);

    await client.query('COMMIT');

    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate alerts for all materials
 */
export async function generateAllAlerts() {
  const materials = await query('SELECT id FROM materials WHERE is_active = true');

  const alerts = [];
  for (const material of materials.rows) {
    try {
      const alert = await generateAlertForMaterial(material.id);
      if (alert) {
        alerts.push(alert);
      }
    } catch (error) {
      console.error(`Error generating alert for material ${material.id}:`, error);
    }
  }

  return alerts;
}

/**
 * Get all active alerts
 */
export async function getActiveAlerts(options = {}) {
  const { alertLevel, materialId } = options;

  let whereClause = 'WHERE ia.is_active = true';
  const params = [];
  let paramCounter = 1;

  if (alertLevel) {
    whereClause += ` AND ia.alert_level = $${paramCounter}`;
    params.push(alertLevel);
    paramCounter++;
  }

  if (materialId) {
    whereClause += ` AND ia.material_id = $${paramCounter}`;
    params.push(materialId);
    paramCounter++;
  }

  const result = await query(`
    SELECT
      ia.*,
      m.name as material_name,
      m.unit_type,
      m.supplier_name,
      m.supplier_lead_time_days
    FROM inventory_alerts ia
    JOIN materials m ON ia.material_id = m.id
    ${whereClause}
    ORDER BY
      CASE ia.alert_level
        WHEN 'critical' THEN 1
        WHEN 'warning' THEN 2
        WHEN 'healthy' THEN 3
      END,
      ia.created_at DESC
  `, params);

  return result.rows;
}

/**
 * Get alert summary (count by level)
 */
export async function getAlertSummary() {
  const result = await query(`
    SELECT
      alert_level,
      COUNT(*) as count,
      ARRAY_AGG(
        json_build_object(
          'id', ia.id,
          'material_id', ia.material_id,
          'material_name', m.name,
          'alert_message', ia.alert_message,
          'days_until_depletion', ia.days_until_depletion
        )
      ) as alerts
    FROM inventory_alerts ia
    JOIN materials m ON ia.material_id = m.id
    WHERE ia.is_active = true
    GROUP BY alert_level
    ORDER BY
      CASE alert_level
        WHEN 'critical' THEN 1
        WHEN 'warning' THEN 2
        WHEN 'healthy' THEN 3
      END
  `);

  const summary = {
    critical: 0,
    warning: 0,
    healthy: 0,
    total: 0,
    alerts: []
  };

  for (const row of result.rows) {
    summary[row.alert_level] = parseInt(row.count);
    summary.total += parseInt(row.count);
    summary.alerts.push(...row.alerts);
  }

  return summary;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId, acknowledgedBy = 'User') {
  const result = await query(`
    UPDATE inventory_alerts
    SET acknowledged = true,
        acknowledged_at = CURRENT_TIMESTAMP,
        acknowledged_by = $2
    WHERE id = $1
    RETURNING *
  `, [alertId, acknowledgedBy]);

  return result.rows[0];
}

/**
 * Check if new order can be fulfilled and what impact it will have
 */
export async function checkOrderImpactOnInventory(orderItems) {
  // orderItems format: [{ productId, quantity }, ...]

  const impacts = [];

  for (const item of orderItems) {
    const bomResult = await query(`
      SELECT
        pm.*,
        m.name as material_name,
        m.unit_type,
        m.available_stock,
        m.reorder_point
      FROM product_materials pm
      JOIN materials m ON pm.material_id = m.id
      WHERE pm.product_id = $1
    `, [item.productId]);

    for (const bom of bomResult.rows) {
      const requiredQty = item.quantity * parseFloat(bom.effective_quantity);
      const availableStock = parseFloat(bom.available_stock);
      const afterOrder = availableStock - requiredQty;
      const percentageRemaining = availableStock > 0 ? (afterOrder / availableStock * 100) : 0;

      // Get forecast for this material
      const forecast = await calculateMaterialForecast(bom.material_id);

      impacts.push({
        materialId: bom.material_id,
        materialName: bom.material_name,
        unitType: bom.unit_type,
        currentAvailable: availableStock,
        requiredForOrder: requiredQty,
        afterOrder,
        percentageRemaining: Math.round(percentageRemaining),
        canFulfill: afterOrder >= 0,
        shortage: afterOrder < 0 ? Math.abs(afterOrder) : 0,
        willTriggerReorder: afterOrder < parseFloat(bom.reorder_point),
        currentDaysOfStock: forecast.forecast.daysOfAvailableStock,
        daysOfStockAfterOrder: forecast.consumption.avgDaily > 0 ?
          Math.floor(afterOrder / forecast.consumption.avgDaily) : null
      });
    }
  }

  // Group by material
  const grouped = {};
  for (const impact of impacts) {
    if (!grouped[impact.materialId]) {
      grouped[impact.materialId] = impact;
    } else {
      grouped[impact.materialId].requiredForOrder += impact.requiredForOrder;
      grouped[impact.materialId].afterOrder = grouped[impact.materialId].currentAvailable - grouped[impact.materialId].requiredForOrder;
      grouped[impact.materialId].canFulfill = grouped[impact.materialId].afterOrder >= 0;
      grouped[impact.materialId].shortage = grouped[impact.materialId].afterOrder < 0 ? Math.abs(grouped[impact.materialId].afterOrder) : 0;
    }
  }

  const impactList = Object.values(grouped);
  const canFulfillOrder = impactList.every(i => i.canFulfill);

  return {
    canFulfillOrder,
    impacts: impactList,
    criticalMaterials: impactList.filter(i => !i.canFulfill),
    reorderNeeded: impactList.filter(i => i.willTriggerReorder)
  };
}

export default {
  calculateMaterialForecast,
  generateAlertForMaterial,
  generateAllAlerts,
  getActiveAlerts,
  getAlertSummary,
  acknowledgeAlert,
  checkOrderImpactOnInventory
};
