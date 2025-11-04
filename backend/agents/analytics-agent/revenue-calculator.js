import { query } from '../../shared/database.js';
import { getDateRange, formatCurrency } from '../../shared/utils.js';
import { format } from 'date-fns';

/**
 * Calculate revenue for a specific time period
 */
export async function calculateRevenue(startDate, endDate) {
  try {
    const result = await query(
      `SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COALESCE(SUM(total_production_cost), 0) as total_cost,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(AVG(profit_margin), 0) as avg_profit_margin,
        COALESCE(AVG(total_price), 0) as avg_order_value
      FROM orders
      WHERE order_date BETWEEN $1 AND $2
        AND status != 'cancelled'`,
      [startDate, endDate]
    );

    const data = result.rows[0];

    return {
      period: { start: startDate, end: endDate },
      orderCount: parseInt(data.order_count),
      revenue: parseFloat(data.total_revenue),
      costs: parseFloat(data.total_cost),
      profit: parseFloat(data.total_profit),
      profitMargin: parseFloat(data.avg_profit_margin),
      avgOrderValue: parseFloat(data.avg_order_value)
    };
  } catch (error) {
    console.error('Error calculating revenue:', error);
    throw error;
  }
}

/**
 * Calculate revenue by period type
 */
export async function calculateRevenueByPeriod(periodType) {
  const dateRange = getDateRange(periodType);
  return await calculateRevenue(dateRange.start, dateRange.end);
}

/**
 * Get revenue breakdown by day for a period
 */
export async function getDailyRevenue(startDate, endDate) {
  try {
    const result = await query(
      `SELECT
        order_date,
        COUNT(*) as order_count,
        SUM(total_price) as revenue,
        SUM(total_production_cost) as costs,
        SUM(profit) as profit,
        AVG(profit_margin) as profit_margin
      FROM orders
      WHERE order_date BETWEEN $1 AND $2
        AND status != 'cancelled'
      GROUP BY order_date
      ORDER BY order_date ASC`,
      [startDate, endDate]
    );

    return result.rows.map(row => ({
      date: row.order_date,
      orderCount: parseInt(row.order_count),
      revenue: parseFloat(row.revenue),
      costs: parseFloat(row.costs),
      profit: parseFloat(row.profit),
      profitMargin: parseFloat(row.profit_margin)
    }));
  } catch (error) {
    console.error('Error getting daily revenue:', error);
    throw error;
  }
}

/**
 * Get revenue comparison (current vs previous period)
 */
export async function getRevenueComparison(periodType) {
  const currentRange = getDateRange(periodType);
  const currentRevenue = await calculateRevenue(currentRange.start, currentRange.end);

  // Calculate previous period
  const periodLength = currentRange.end - currentRange.start;
  const previousStart = new Date(currentRange.start.getTime() - periodLength);
  const previousEnd = new Date(currentRange.end.getTime() - periodLength);
  const previousRevenue = await calculateRevenue(previousStart, previousEnd);

  // Calculate changes
  const revenueChange = currentRevenue.revenue - previousRevenue.revenue;
  const revenueChangePercent = previousRevenue.revenue > 0
    ? ((revenueChange / previousRevenue.revenue) * 100)
    : 0;

  const profitChange = currentRevenue.profit - previousRevenue.profit;
  const profitChangePercent = previousRevenue.profit > 0
    ? ((profitChange / previousRevenue.profit) * 100)
    : 0;

  return {
    current: currentRevenue,
    previous: previousRevenue,
    comparison: {
      revenueChange,
      revenueChangePercent: parseFloat(revenueChangePercent.toFixed(2)),
      profitChange,
      profitChangePercent: parseFloat(profitChangePercent.toFixed(2)),
      orderCountChange: currentRevenue.orderCount - previousRevenue.orderCount
    }
  };
}

/**
 * Get top performing products
 */
export async function getTopProducts(startDate, endDate, limit = 10) {
  try {
    const result = await query(
      `SELECT
        p.name as product_name,
        COUNT(DISTINCT oi.order_id) as times_ordered,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.line_total) as total_revenue,
        SUM(oi.line_cost) as total_cost,
        SUM(oi.line_profit) as total_profit,
        AVG((oi.line_profit / NULLIF(oi.line_total, 0)) * 100) as avg_profit_margin
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.order_date BETWEEN $1 AND $2
        AND o.status != 'cancelled'
      GROUP BY p.name, oi.product_name
      ORDER BY total_revenue DESC
      LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map(row => ({
      productName: row.product_name,
      timesOrdered: parseInt(row.times_ordered),
      totalQuantity: parseInt(row.total_quantity),
      revenue: parseFloat(row.total_revenue),
      cost: parseFloat(row.total_cost),
      profit: parseFloat(row.total_profit),
      profitMargin: parseFloat(row.avg_profit_margin || 0)
    }));
  } catch (error) {
    console.error('Error getting top products:', error);
    throw error;
  }
}

/**
 * Get top clients
 */
export async function getTopClients(startDate, endDate, limit = 10) {
  try {
    const result = await query(
      `SELECT
        c.name as client_name,
        c.phone as client_phone,
        COUNT(o.id) as order_count,
        SUM(o.total_price) as total_spent,
        SUM(o.profit) as total_profit,
        AVG(o.total_price) as avg_order_value,
        MAX(o.order_date) as last_order_date
      FROM clients c
      JOIN orders o ON c.id = o.client_id
      WHERE o.order_date BETWEEN $1 AND $2
        AND o.status != 'cancelled'
      GROUP BY c.id, c.name, c.phone
      ORDER BY total_spent DESC
      LIMIT $3`,
      [startDate, endDate, limit]
    );

    return result.rows.map(row => ({
      clientName: row.client_name,
      clientPhone: row.client_phone,
      orderCount: parseInt(row.order_count),
      totalSpent: parseFloat(row.total_spent),
      totalProfit: parseFloat(row.total_profit),
      avgOrderValue: parseFloat(row.avg_order_value),
      lastOrderDate: row.last_order_date
    }));
  } catch (error) {
    console.error('Error getting top clients:', error);
    throw error;
  }
}

/**
 * Get orders by status
 */
export async function getOrdersByStatus(startDate, endDate) {
  try {
    const result = await query(
      `SELECT
        status,
        COUNT(*) as count,
        SUM(total_price) as revenue
      FROM orders
      WHERE order_date BETWEEN $1 AND $2
      GROUP BY status
      ORDER BY count DESC`,
      [startDate, endDate]
    );

    return result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      revenue: parseFloat(row.revenue)
    }));
  } catch (error) {
    console.error('Error getting orders by status:', error);
    throw error;
  }
}

/**
 * Get low margin orders (potential problem orders)
 */
export async function getLowMarginOrders(threshold = 20, limit = 10) {
  try {
    const result = await query(
      `SELECT
        o.order_number,
        o.order_date,
        c.name as client_name,
        o.total_price,
        o.total_production_cost,
        o.profit,
        o.profit_margin,
        o.status
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.profit_margin < $1
        AND o.status != 'cancelled'
      ORDER BY o.profit_margin ASC
      LIMIT $2`,
      [threshold, limit]
    );

    return result.rows.map(row => ({
      orderNumber: row.order_number,
      orderDate: row.order_date,
      clientName: row.client_name,
      totalPrice: parseFloat(row.total_price),
      productionCost: parseFloat(row.total_production_cost),
      profit: parseFloat(row.profit),
      profitMargin: parseFloat(row.profit_margin),
      status: row.status
    }));
  } catch (error) {
    console.error('Error getting low margin orders:', error);
    throw error;
  }
}

/**
 * Get production efficiency metrics
 */
export async function getProductionMetrics(startDate, endDate) {
  try {
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders,
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE shipped_at IS NOT NULL AND delivery_date IS NOT NULL
          AND shipped_at <= delivery_date) as on_time_deliveries,
        COUNT(*) FILTER (WHERE shipped_at IS NOT NULL) as total_shipped,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/86400) as avg_completion_days
      FROM orders
      WHERE order_date BETWEEN $1 AND $2
        AND status != 'cancelled'`,
      [startDate, endDate]
    );

    const data = result.rows[0];

    const onTimeRate = data.total_shipped > 0
      ? (data.on_time_deliveries / data.total_shipped) * 100
      : 0;

    const completionRate = data.total_orders > 0
      ? (data.completed_orders / data.total_orders) * 100
      : 0;

    return {
      completedOrders: parseInt(data.completed_orders),
      totalOrders: parseInt(data.total_orders),
      completionRate: parseFloat(completionRate.toFixed(2)),
      onTimeDeliveries: parseInt(data.on_time_deliveries),
      totalShipped: parseInt(data.total_shipped),
      onTimeRate: parseFloat(onTimeRate.toFixed(2)),
      avgCompletionDays: parseFloat(data.avg_completion_days || 0).toFixed(1)
    };
  } catch (error) {
    console.error('Error getting production metrics:', error);
    throw error;
  }
}

/**
 * Get comprehensive analytics summary
 */
export async function getAnalyticsSummary(periodType = 'this_month') {
  const dateRange = getDateRange(periodType);

  const [
    revenue,
    comparison,
    topProducts,
    topClients,
    ordersByStatus,
    lowMarginOrders,
    productionMetrics
  ] = await Promise.all([
    calculateRevenue(dateRange.start, dateRange.end),
    getRevenueComparison(periodType),
    getTopProducts(dateRange.start, dateRange.end, 5),
    getTopClients(dateRange.start, dateRange.end, 5),
    getOrdersByStatus(dateRange.start, dateRange.end),
    getLowMarginOrders(20, 5),
    getProductionMetrics(dateRange.start, dateRange.end)
  ]);

  return {
    periodType,
    dateRange: {
      start: format(dateRange.start, 'yyyy-MM-dd'),
      end: format(dateRange.end, 'yyyy-MM-dd')
    },
    revenue,
    comparison,
    topProducts,
    topClients,
    ordersByStatus,
    lowMarginOrders,
    productionMetrics,
    generatedAt: new Date().toISOString()
  };
}

export default {
  calculateRevenue,
  calculateRevenueByPeriod,
  getDailyRevenue,
  getRevenueComparison,
  getTopProducts,
  getTopClients,
  getOrdersByStatus,
  getLowMarginOrders,
  getProductionMetrics,
  getAnalyticsSummary
};
