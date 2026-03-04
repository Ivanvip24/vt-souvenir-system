import { query } from '../shared/database.js';

/**
 * R&D Business Intelligence Module
 *
 * Provides weekly insights on product performance, margin health,
 * revenue trends, and inventory alerts. Also identifies cross-sell
 * opportunities by analyzing product co-occurrence in orders.
 */

// ---------------------------------------------------------------------------
// Function 1: generateWeeklyInsights
// ---------------------------------------------------------------------------

export async function generateWeeklyInsights() {
  // 1. Top-growing products (last 30d vs previous 30d)
  const growingProductsQuery = query(`
    WITH recent AS (
      SELECT product_name, SUM(line_total) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_name
    ), previous AS (
      SELECT product_name, SUM(line_total) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '60 days'
        AND o.created_at < CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_name
    )
    SELECT
      r.product_name,
      r.revenue as current_revenue,
      COALESCE(p.revenue, 0) as previous_revenue,
      CASE
        WHEN COALESCE(p.revenue, 0) > 0
          THEN ROUND(((r.revenue - p.revenue) / p.revenue * 100)::numeric, 1)
        ELSE 100
      END as growth_pct
    FROM recent r
    LEFT JOIN previous p ON r.product_name = p.product_name
    ORDER BY growth_pct DESC
    LIMIT 5
  `).catch(() => ({ rows: [] }));

  // 2. Declining products (same comparison, negative growth only)
  const decliningProductsQuery = query(`
    WITH recent AS (
      SELECT product_name, SUM(line_total) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_name
    ), previous AS (
      SELECT product_name, SUM(line_total) as revenue
      FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '60 days'
        AND o.created_at < CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_name
    )
    SELECT
      r.product_name,
      r.revenue as current_revenue,
      COALESCE(p.revenue, 0) as previous_revenue,
      CASE
        WHEN COALESCE(p.revenue, 0) > 0
          THEN ROUND(((r.revenue - p.revenue) / p.revenue * 100)::numeric, 1)
        ELSE 100
      END as growth_pct
    FROM recent r
    LEFT JOIN previous p ON r.product_name = p.product_name
    WHERE CASE
      WHEN COALESCE(p.revenue, 0) > 0
        THEN ((r.revenue - p.revenue) / p.revenue * 100)
      ELSE 100
    END < 0
    ORDER BY growth_pct ASC
    LIMIT 5
  `).catch(() => ({ rows: [] }));

  // 3. Low-margin products (margin < 40%)
  const lowMarginQuery = query(`
    SELECT name, base_price, production_cost, margin_pct
    FROM (
      SELECT name, base_price, production_cost,
        CASE
          WHEN base_price > 0
            THEN ROUND(((base_price - production_cost) / base_price * 100)::numeric, 1)
          ELSE 0
        END as margin_pct
      FROM products
      WHERE is_active = true AND production_cost > 0
    ) sub
    WHERE margin_pct < 40
    ORDER BY margin_pct ASC
  `).catch(() => ({ rows: [] }));

  // 4. Weekly revenue trend (last 4 weeks)
  const weeklyTrendQuery = query(`
    SELECT
      DATE_TRUNC('week', created_at)::date as week_start,
      COUNT(*) as orders,
      COALESCE(SUM(total_price), 0) as revenue
    FROM orders
    WHERE created_at >= CURRENT_DATE - INTERVAL '28 days'
    GROUP BY week_start
    ORDER BY week_start
  `).catch(() => ({ rows: [] }));

  // 5. Low-stock materials
  const lowStockQuery = query(`
    SELECT name, current_stock, min_stock_level, cost_per_unit
    FROM raw_materials
    WHERE is_active = true AND current_stock <= min_stock_level
    ORDER BY (min_stock_level - current_stock) DESC
  `).catch(() => ({ rows: [] }));

  // Await all queries in parallel
  const [
    growingProducts,
    decliningProducts,
    lowMarginProducts,
    weeklyTrend,
    lowStockMaterials,
  ] = await Promise.all([
    growingProductsQuery,
    decliningProductsQuery,
    lowMarginQuery,
    weeklyTrendQuery,
    lowStockQuery,
  ]);

  // Build insights array
  const insights = [];

  // Growing products
  for (const row of growingProducts.rows) {
    insights.push({
      type: 'growth',
      title: `${row.product_name} crecio ${row.growth_pct}%`,
      description: `Ingreso actual: $${Number(row.current_revenue).toLocaleString('es-MX')}, periodo anterior: $${Number(row.previous_revenue).toLocaleString('es-MX')}`,
      data: row,
      recommendation: 'Aumentar inventario y considerar mayor visibilidad en marketing.',
    });
  }

  // Declining products
  for (const row of decliningProducts.rows) {
    insights.push({
      type: 'decline',
      title: `${row.product_name} bajo ${Math.abs(row.growth_pct)}%`,
      description: `Ingreso actual: $${Number(row.current_revenue).toLocaleString('es-MX')}, periodo anterior: $${Number(row.previous_revenue).toLocaleString('es-MX')}`,
      data: row,
      recommendation: 'Considerar promocion o descontinuar.',
    });
  }

  // Low-margin products
  for (const row of lowMarginProducts.rows) {
    insights.push({
      type: 'margin_alert',
      title: `${row.name} tiene margen de ${row.margin_pct}%`,
      description: `Precio: $${Number(row.base_price).toLocaleString('es-MX')}, costo de produccion: $${Number(row.production_cost).toLocaleString('es-MX')}`,
      data: row,
      recommendation: 'Revisar costos de produccion o ajustar precio de venta.',
    });
  }

  // Weekly trend
  if (weeklyTrend.rows.length > 0) {
    insights.push({
      type: 'trend',
      title: 'Tendencia semanal',
      description: `${weeklyTrend.rows.length} semanas analizadas. Ultimo ingreso semanal: $${Number(weeklyTrend.rows[weeklyTrend.rows.length - 1].revenue).toLocaleString('es-MX')}`,
      data: weeklyTrend.rows,
      recommendation: weeklyTrend.rows.length >= 2
        ? (Number(weeklyTrend.rows[weeklyTrend.rows.length - 1].revenue) >=
           Number(weeklyTrend.rows[weeklyTrend.rows.length - 2].revenue)
            ? 'Tendencia positiva. Mantener estrategia actual.'
            : 'Tendencia a la baja. Evaluar acciones correctivas.')
        : 'Datos insuficientes para determinar tendencia.',
    });
  }

  // Low-stock materials
  for (const row of lowStockMaterials.rows) {
    const deficit = Number(row.min_stock_level) - Number(row.current_stock);
    insights.push({
      type: 'stock_alert',
      title: `${row.name} por debajo del minimo (faltan ${deficit} unidades)`,
      description: `Stock actual: ${row.current_stock}, nivel minimo: ${row.min_stock_level}, costo unitario: $${Number(row.cost_per_unit).toLocaleString('es-MX')}`,
      data: row,
      recommendation: `Reabastecer al menos ${deficit} unidades. Costo estimado: $${(deficit * Number(row.cost_per_unit)).toLocaleString('es-MX')}`,
    });
  }

  return {
    insights,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Function 2: getProductOpportunities
// ---------------------------------------------------------------------------

export async function getProductOpportunities() {
  // Products frequently ordered together
  const coOccurrenceQuery = query(`
    SELECT
      a.product_name as product_a,
      b.product_name as product_b,
      COUNT(*) as co_occurrences
    FROM order_items a
    JOIN order_items b ON a.order_id = b.order_id AND a.product_name < b.product_name
    GROUP BY a.product_name, b.product_name
    HAVING COUNT(*) >= 2
    ORDER BY co_occurrences DESC
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  // Average order value for estimating bundle potential
  const avgOrderQuery = query(`
    SELECT COALESCE(AVG(total_price), 0) as avg_order_value
    FROM orders
    WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
  `).catch(() => ({ rows: [{ avg_order_value: 0 }] }));

  const [coOccurrence, avgOrder] = await Promise.all([
    coOccurrenceQuery,
    avgOrderQuery,
  ]);

  const avgOrderValue = Number(avgOrder.rows[0]?.avg_order_value || 0);

  const opportunities = coOccurrence.rows.map((row) => {
    const estimatedPotential = Number(row.co_occurrences) * avgOrderValue;
    return {
      type: 'bundle',
      productA: row.product_a,
      productB: row.product_b,
      coOccurrences: Number(row.co_occurrences),
      description: `"${row.product_a}" y "${row.product_b}" se pidieron juntos ${row.co_occurrences} veces.`,
      estimatedPotentialRevenue: Math.round(estimatedPotential * 100) / 100,
      recommendation: `Crear paquete/bundle con descuento para incentivar compra conjunta. Potencial estimado: $${estimatedPotential.toLocaleString('es-MX')}`,
    };
  });

  return {
    opportunities,
    generatedAt: new Date().toISOString(),
  };
}
