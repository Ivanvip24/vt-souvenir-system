/**
 * ORDER INTEGRATION HOOKS
 * Automatically manage inventory when orders are created/updated
 */

import {
  reserveMaterialsForOrder,
  releaseMaterialsForOrder,
  checkOrderFulfillment
} from './bom-manager.js';
import { recordConsumption } from './material-manager.js';
import { generateAllAlerts } from './forecasting-engine.js';
import { query, getClient } from '../../shared/database.js';
import { log, logError } from '../../shared/logger.js';

/**
 * Hook: Called when a new order is created
 * Reserves materials for the order
 */
export async function onOrderCreated(orderId) {
  log('info', 'inventory.orderCreated.checkFulfillment', { orderId });

  try {
    // Check if order can be fulfilled
    const fulfillment = await checkOrderFulfillment(orderId);

    if (!fulfillment.canFulfill) {
      log('warn', 'inventory.orderCreated.cannotFulfill', { orderId, insufficientMaterials: fulfillment.insufficientMaterials });

      return {
        success: false,
        canFulfill: false,
        insufficientMaterials: fulfillment.insufficientMaterials,
        warning: 'Order created but insufficient materials available'
      };
    }

    // Reserve materials
    const reservation = await reserveMaterialsForOrder(orderId);

    log('info', 'inventory.orderCreated.reserved', { orderId, reservations: reservation.reservations });

    // Generate alerts after reservation
    await generateAllAlerts();

    return {
      success: true,
      canFulfill: true,
      reservations: reservation.reservations
    };

  } catch (error) {
    logError('inventory.orderCreated.fail', error, { orderId });
    throw error;
  }
}

/**
 * Hook: Called when order status changes
 * Manages material consumption based on status
 */
export async function onOrderStatusChanged(orderId, oldStatus, newStatus) {
  log('info', 'inventory.statusChanged', { orderId, oldStatus, newStatus });

  try {
    // When order moves to production (printing), consume materials
    if (newStatus === 'printing' && oldStatus !== 'printing') {
      await consumeMaterialsForOrder(orderId);
      log('info', 'inventory.materialsConsumed', { orderId });
    }

    // When order is cancelled, release reservations
    if (newStatus === 'cancelled') {
      await releaseMaterialsForOrder(orderId);
      log('info', 'inventory.materialsReleased', { orderId, reason: 'cancelled' });
    }

    // When order is delivered, ensure materials are fully consumed
    if (newStatus === 'delivered' && oldStatus !== 'delivered') {
      await ensureMaterialsConsumed(orderId);
      log('info', 'inventory.materialsFinalized', { orderId });
    }

    // Regenerate alerts
    await generateAllAlerts();

    return { success: true };

  } catch (error) {
    logError('inventory.statusChanged.fail', error, { orderId });
    throw error;
  }
}

/**
 * Hook: Called when order is deleted
 * Releases all material reservations
 */
export async function onOrderDeleted(orderId) {
  log('info', 'inventory.orderDeleted.releaseMaterials', { orderId });

  try {
    await releaseMaterialsForOrder(orderId);

    // Regenerate alerts
    await generateAllAlerts();

    return { success: true };

  } catch (error) {
    logError('inventory.orderDeleted.fail', error, { orderId });
    throw error;
  }
}

/**
 * Consume materials for an order (when production starts)
 */
async function consumeMaterialsForOrder(orderId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get reserved materials
    const reservations = await client.query(`
      SELECT
        omr.*,
        m.name as material_name
      FROM order_material_reservations omr
      JOIN materials m ON omr.material_id = m.id
      WHERE omr.order_id = $1 AND omr.reservation_status = 'pending'
    `, [orderId]);

    if (reservations.rows.length === 0) {
      log('warn', 'inventory.consume.noPendingReservations', { orderId });
      await client.query('ROLLBACK');
      return;
    }

    // Consume each material
    for (const reservation of reservations.rows) {
      const quantityToConsume = parseFloat(reservation.quantity_reserved) - parseFloat(reservation.quantity_consumed);

      if (quantityToConsume > 0) {
        await recordConsumption({
          materialId: reservation.material_id,
          quantity: quantityToConsume,
          orderId: orderId,
          notes: `Consumed for order production`,
          performedBy: 'System'
        });

        log('info', 'inventory.consume.material', { orderId, material: reservation.material_name, quantity: quantityToConsume });
      }
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ensure all materials are consumed for a delivered order
 */
async function ensureMaterialsConsumed(orderId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get any remaining reservations
    const reservations = await client.query(`
      SELECT
        omr.*,
        m.name as material_name
      FROM order_material_reservations omr
      JOIN materials m ON omr.material_id = m.id
      WHERE omr.order_id = $1
        AND omr.quantity_consumed < omr.quantity_reserved
    `, [orderId]);

    for (const reservation of reservations.rows) {
      const remaining = parseFloat(reservation.quantity_reserved) - parseFloat(reservation.quantity_consumed);

      if (remaining > 0) {
        await recordConsumption({
          materialId: reservation.material_id,
          quantity: remaining,
          orderId: orderId,
          notes: `Final consumption for delivered order`,
          performedBy: 'System'
        });

        log('info', 'inventory.finalConsume.material', { orderId, material: reservation.material_name, quantity: remaining });
      }
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check inventory before accepting an order
 * Returns detailed impact analysis
 */
export async function checkInventoryBeforeOrder(orderItems) {
  // orderItems format: [{ productId, quantity }, ...]

  const client = await getClient();

  try {
    const analysis = {
      canFulfill: true,
      materials: [],
      warnings: [],
      criticalAlerts: []
    };

    for (const item of orderItems) {
      // Get BOM for product
      const bomResult = await client.query(`
        SELECT
          pm.*,
          m.id as material_id,
          m.name as material_name,
          m.unit_type,
          m.available_stock,
          m.min_stock_level,
          m.reorder_point
        FROM product_materials pm
        JOIN materials m ON pm.material_id = m.id
        WHERE pm.product_id = $1
      `, [item.productId]);

      for (const bom of bomResult.rows) {
        const required = item.quantity * parseFloat(bom.effective_quantity);
        const available = parseFloat(bom.available_stock);
        const afterOrder = available - required;

        const materialInfo = {
          materialId: bom.material_id,
          materialName: bom.material_name,
          unitType: bom.unit_type,
          currentAvailable: available,
          required: required,
          afterOrder: afterOrder,
          canFulfill: afterOrder >= 0
        };

        analysis.materials.push(materialInfo);

        // Check if can fulfill
        if (!materialInfo.canFulfill) {
          analysis.canFulfill = false;
          analysis.warnings.push(
            `Insufficient ${bom.material_name}: need ${required}, have ${available} (shortage: ${Math.abs(afterOrder)})`
          );
        }

        // Check if will drop below reorder point
        else if (afterOrder < parseFloat(bom.reorder_point)) {
          analysis.warnings.push(
            `${bom.material_name} will drop below reorder point after this order (${afterOrder} < ${bom.reorder_point})`
          );
        }

        // Check if will drop below minimum
        if (afterOrder < parseFloat(bom.min_stock_level) && afterOrder >= 0) {
          analysis.criticalAlerts.push(
            `WARNING: ${bom.material_name} will be critically low after this order (${afterOrder} ${bom.unit_type})`
          );
        }
      }
    }

    return analysis;

  } finally {
    client.release();
  }
}

/**
 * Get inventory status for all pending orders
 */
export async function getPendingOrdersInventoryStatus() {
  const result = await query(`
    SELECT
      o.id,
      o.order_number,
      o.status,
      o.order_date,
      COUNT(omr.id) as materials_count,
      SUM(omr.quantity_reserved) as total_reserved,
      SUM(omr.quantity_consumed) as total_consumed,
      BOOL_AND(
        CASE
          WHEN omr.quantity_reserved <= m.available_stock + omr.quantity_reserved THEN true
          ELSE false
        END
      ) as can_fulfill
    FROM orders o
    LEFT JOIN order_material_reservations omr ON o.id = omr.order_id
    LEFT JOIN materials m ON omr.material_id = m.id
    WHERE o.status IN ('new', 'design', 'printing', 'cutting')
    GROUP BY o.id, o.order_number, o.status, o.order_date
    ORDER BY o.order_date
  `);

  return result.rows;
}

/**
 * Recalculate all reservations (useful for data cleanup/sync)
 */
export async function recalculateAllReservations() {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get all pending orders
    const orders = await client.query(`
      SELECT id FROM orders
      WHERE status IN ('new', 'design')
    `);

    let updated = 0;

    for (const order of orders.rows) {
      try {
        // Release existing
        await releaseMaterialsForOrder(order.id);

        // Re-reserve
        await reserveMaterialsForOrder(order.id);

        updated++;
      } catch (error) {
        logError('inventory.recalculate.fail', error, { orderId: order.id });
      }
    }

    await client.query('COMMIT');

    // Regenerate all alerts
    await generateAllAlerts();

    return {
      success: true,
      ordersUpdated: updated
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default {
  onOrderCreated,
  onOrderStatusChanged,
  onOrderDeleted,
  checkInventoryBeforeOrder,
  getPendingOrdersInventoryStatus,
  recalculateAllReservations
};
