import * as notionAgent from './index.js';
import { query } from '../../shared/database.js';
import { generateOrderNumber } from '../../shared/utils.js';

/**
 * Sync local order to Notion
 * Creates new page if doesn't exist, updates if it does
 */
export async function syncOrderToNotion(orderId) {
  try {
    // Get order from local database
    const result = await query(
      `SELECT
        o.*,
        c.name as client_name,
        c.phone as client_phone,
        c.address as client_address,
        c.city as client_city,
        c.state as client_state,
        json_agg(
          json_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price
          )
        ) as items
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id, c.name, c.phone, c.address, c.city, c.state`,
      [orderId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Order ${orderId} not found in database`);
    }

    const order = result.rows[0];

    // Format products and quantities for Notion
    const productsText = order.items
      .map(item => item.product_name)
      .join(', ');

    const quantitiesText = order.items
      .map(item => `${item.product_name}: ${item.quantity}`)
      .join(', ');

    // Prepare order data for Notion
    const notionData = {
      orderNumber: order.order_number,
      orderDate: order.order_date,
      clientName: order.client_name,
      clientPhone: order.client_phone,
      clientAddress: order.client_address,
      clientCity: order.client_city,
      clientState: order.client_state,
      products: productsText,
      quantities: quantitiesText,
      totalPrice: parseFloat(order.total_price),
      productionCost: parseFloat(order.total_production_cost),
      profit: parseFloat(order.profit),
      profitMargin: parseFloat(order.profit_margin),
      status: order.status,
      department: order.department,
      priority: order.priority,
      shippingLabelGenerated: order.shipping_label_generated,
      trackingNumber: order.tracking_number,
      deliveryDate: order.delivery_date,
      notes: order.notes,
      internalNotes: order.internal_notes,
    };

    let response;

    if (order.notion_page_id) {
      // Update existing Notion page
      response = await notionAgent.updateOrder(order.notion_page_id, notionData);
      console.log(`✅ Updated order ${order.order_number} in Notion`);
    } else {
      // Create new Notion page
      response = await notionAgent.createOrder(notionData);

      // Update local database with Notion page ID
      await query(
        `UPDATE orders
         SET notion_page_id = $1, notion_page_url = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [response.notionPageId, response.notionPageUrl, orderId]
      );

      console.log(`✅ Created order ${order.order_number} in Notion`);
    }

    return {
      success: true,
      orderId,
      notionPageId: response.notionPageId || order.notion_page_id,
      action: order.notion_page_id ? 'updated' : 'created'
    };

  } catch (error) {
    console.error('❌ Error syncing order to Notion:', error);
    throw error;
  }
}

/**
 * Sync Notion page to local database
 * Updates local order with data from Notion
 */
export async function syncOrderFromNotion(notionPageId) {
  try {
    // Get order from Notion
    const notionResponse = await notionAgent.getOrder(notionPageId);
    const notionOrder = notionResponse.data;

    // Check if order exists in local database
    const existingOrder = await query(
      `SELECT id FROM orders WHERE notion_page_id = $1`,
      [notionPageId]
    );

    if (existingOrder.rows.length > 0) {
      // Update existing order
      const orderId = existingOrder.rows[0].id;

      await query(
        `UPDATE orders SET
          status = $1,
          department = $2,
          priority = $3,
          tracking_number = $4,
          delivery_date = $5,
          notes = $6,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          notionOrder.status.toLowerCase(),
          notionOrder.department.toLowerCase(),
          notionOrder.priority.toLowerCase(),
          notionOrder.trackingNumber,
          notionOrder.deliveryDate,
          notionOrder.notes,
          orderId
        ]
      );

      console.log(`✅ Updated local order from Notion: ${notionOrder.orderNumber}`);

      return {
        success: true,
        orderId,
        action: 'updated'
      };
    } else {
      console.log('⚠️  Order not found locally, consider creating it');
      return {
        success: false,
        message: 'Order not found in local database'
      };
    }

  } catch (error) {
    console.error('❌ Error syncing order from Notion:', error);
    throw error;
  }
}

/**
 * Sync all orders to Notion
 * Useful for initial setup or bulk sync
 */
export async function syncAllOrdersToNotion(limit = 100) {
  try {
    console.log(`🔄 Starting bulk sync of up to ${limit} orders to Notion...`);

    const result = await query(
      `SELECT id, order_number
       FROM orders
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const orders = result.rows;
    const results = {
      total: orders.length,
      synced: 0,
      failed: 0,
      errors: []
    };

    for (const order of orders) {
      try {
        await syncOrderToNotion(order.id);
        results.synced++;

        // Rate limiting: Notion allows 3 requests/second
        await new Promise(resolve => setTimeout(resolve, 350));
      } catch (error) {
        results.failed++;
        results.errors.push({
          orderId: order.id,
          orderNumber: order.order_number,
          error: error.message
        });
      }
    }

    console.log(`✅ Bulk sync complete: ${results.synced} synced, ${results.failed} failed`);

    return results;

  } catch (error) {
    console.error('❌ Error in bulk sync:', error);
    throw error;
  }
}

/**
 * Sync order status update to Notion
 * Quick function for just updating status
 */
export async function syncStatusToNotion(orderId, newStatus) {
  try {
    const result = await query(
      `SELECT notion_page_id FROM orders WHERE id = $1`,
      [orderId]
    );

    if (result.rows.length === 0 || !result.rows[0].notion_page_id) {
      throw new Error('Order not found or not synced to Notion');
    }

    const notionPageId = result.rows[0].notion_page_id;

    await notionAgent.updateStatus(notionPageId, newStatus);

    // Update local database
    await query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newStatus.toLowerCase(), orderId]
    );

    console.log(`✅ Status updated to "${newStatus}" for order ${orderId}`);

    return {
      success: true,
      orderId,
      newStatus
    };

  } catch (error) {
    console.error('❌ Error syncing status:', error);
    throw error;
  }
}

/**
 * Create order in both systems simultaneously
 * Recommended way to create new orders
 */
export async function createOrderBothSystems(orderData) {
  const client = await query('BEGIN');

  try {
    // 1. Generate order number if not provided
    if (!orderData.orderNumber) {
      orderData.orderNumber = generateOrderNumber();
    }

    // 2. Create or get client
    let clientId;
    if (orderData.clientId) {
      clientId = orderData.clientId;
    } else {
      const clientResult = await query(
        `INSERT INTO clients (name, phone, address, city, state)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (phone) DO UPDATE SET
           name = EXCLUDED.name,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           state = EXCLUDED.state
         RETURNING id`,
        [
          orderData.clientName,
          orderData.clientPhone,
          orderData.clientAddress,
          orderData.clientCity,
          orderData.clientState
        ]
      );
      clientId = clientResult.rows[0].id;
    }

    // 3. Create order in local database
    const orderResult = await query(
      `INSERT INTO orders (
        order_number,
        client_id,
        order_date,
        status,
        department,
        priority,
        total_price,
        total_production_cost,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        orderData.orderNumber,
        clientId,
        orderData.orderDate || new Date().toISOString().split('T')[0],
        orderData.status || 'new',
        orderData.department || 'design',
        orderData.priority || 'normal',
        orderData.totalPrice,
        orderData.productionCost,
        orderData.notes
      ]
    );

    const orderId = orderResult.rows[0].id;

    // 4. Create order items
    if (orderData.items && orderData.items.length > 0) {
      for (const item of orderData.items) {
        await query(
          `INSERT INTO order_items (
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            unit_cost
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            item.productId,
            item.productName,
            item.quantity,
            item.unitPrice,
            item.unitCost
          ]
        );
      }
    }

    // 5. Sync to Notion
    const syncResult = await syncOrderToNotion(orderId);

    await query('COMMIT');

    console.log(`✅ Order ${orderData.orderNumber} created in both systems`);

    return {
      success: true,
      orderId,
      orderNumber: orderData.orderNumber,
      notionPageId: syncResult.notionPageId,
      notionPageUrl: syncResult.notionPageUrl
    };

  } catch (error) {
    await query('ROLLBACK');
    console.error('❌ Error creating order:', error);
    throw error;
  }
}

export default {
  syncOrderToNotion,
  syncOrderFromNotion,
  syncAllOrdersToNotion,
  syncStatusToNotion,
  createOrderBothSystems
};
