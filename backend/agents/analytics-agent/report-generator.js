import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';
import { formatCurrency, formatDate, formatDateMX } from '../../shared/utils.js';
import * as revenueCalculator from './revenue-calculator.js';
import { query } from '../../shared/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Register Handlebars helpers
handlebars.registerHelper('formatCurrency', (value) => formatCurrency(value));
handlebars.registerHelper('formatDate', (value) => formatDate(value));
handlebars.registerHelper('eq', (a, b) => a === b);
handlebars.registerHelper('gt', (a, b) => a > b);
handlebars.registerHelper('lt', (a, b) => a < b);

/**
 * Generate daily report
 */
export async function generateDailyReport(date = new Date()) {
  try {
    console.log('📊 Generating daily report...');

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // Get analytics data
    const revenue = await revenueCalculator.calculateRevenue(startDate, endDate);
    const comparison = await revenueCalculator.getRevenueComparison('today');
    const topProducts = await revenueCalculator.getTopProducts(startDate, endDate, 5);
    const lowMarginOrders = await revenueCalculator.getLowMarginOrders(20, 5);

    // Get recent orders
    const recentOrders = await query(
      `SELECT o.order_number, c.name as client_name, o.total_price, o.status
       FROM orders o
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE o.order_date = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [startDate.toISOString().split('T')[0]]
    );

    // Prepare template data
    const templateData = {
      companyName: process.env.COMPANY_NAME || 'Tu Empresa',
      date: formatDateMX(date),
      generatedAt: formatDateMX(new Date()),

      // Main metrics
      revenue: formatCurrency(revenue.revenue),
      profit: formatCurrency(revenue.profit),
      orderCount: revenue.orderCount,
      profitMargin: revenue.profitMargin.toFixed(1),

      // Changes vs previous day
      revenueChange: formatChange(comparison.comparison.revenueChangePercent, 'vs ayer'),
      profitChange: formatChange(comparison.comparison.profitChangePercent, 'vs ayer'),
      orderCountChange: `${comparison.comparison.orderCountChange > 0 ? '+' : ''}${comparison.comparison.orderCountChange} vs ayer`,

      // Low margin alert
      hasLowMarginOrders: lowMarginOrders.length > 0,
      lowMarginCount: lowMarginOrders.length,
      lowMarginThreshold: 20,

      // Top products
      topProducts: topProducts.map(p => ({
        ...p,
        revenueFormatted: formatCurrency(p.revenue),
        profitFormatted: formatCurrency(p.profit)
      })),

      // Recent orders
      recentOrders: recentOrders.rows.map(o => ({
        ...o,
        totalFormatted: formatCurrency(o.total_price),
        statusText: capitalizeFirst(o.status)
      }))
    };

    // Compile template
    const templatePath = path.join(__dirname, 'templates', 'daily-report.html');
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    const html = template(templateData);

    console.log('✅ Daily report generated successfully');

    return {
      html,
      data: templateData,
      type: 'daily',
      date: startDate
    };

  } catch (error) {
    console.error('❌ Error generating daily report:', error);
    throw error;
  }
}

/**
 * Generate monthly report
 */
export async function generateMonthlyReport(year, month) {
  try {
    console.log(`📊 Generating monthly report for ${year}-${month}...`);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get comprehensive analytics
    const revenue = await revenueCalculator.calculateRevenue(startDate, endDate);
    const comparison = await revenueCalculator.getRevenueComparison('this_month');
    const topProducts = await revenueCalculator.getTopProducts(startDate, endDate, 10);
    const topClients = await revenueCalculator.getTopClients(startDate, endDate, 10);
    const ordersByStatus = await revenueCalculator.getOrdersByStatus(startDate, endDate);
    const lowMarginOrders = await revenueCalculator.getLowMarginOrders(20, 10);
    const productionMetrics = await revenueCalculator.getProductionMetrics(startDate, endDate);
    const dailyRevenue = await revenueCalculator.getDailyRevenue(startDate, endDate);

    // Generate insights
    const insights = generateInsights({
      revenue,
      comparison,
      topProducts,
      topClients,
      productionMetrics
    });

    // Generate recommendations
    const recommendations = generateRecommendations({
      lowMarginOrders,
      productionMetrics,
      comparison
    });

    // Calculate totals for orders by status
    const totalOrdersCount = ordersByStatus.reduce((sum, s) => sum + s.count, 0);

    // Prepare template data
    const templateData = {
      companyName: process.env.COMPANY_NAME || 'Tu Empresa',
      companyEmail: process.env.COMPANY_EMAIL || '',
      period: `${getMonthName(month)} ${year}`,
      generatedAt: formatDateMX(new Date()),

      // Summary
      totalRevenue: formatCurrency(revenue.revenue),
      totalProfit: formatCurrency(revenue.profit),
      totalOrders: revenue.orderCount,
      avgMargin: revenue.profitMargin.toFixed(1),

      // Changes
      revenueChange: formatChange(comparison.comparison.revenueChangePercent, 'vs mes anterior'),
      profitChange: formatChange(comparison.comparison.profitChangePercent, 'vs mes anterior'),
      orderChange: `${comparison.comparison.orderCountChange > 0 ? '+' : ''}${comparison.comparison.orderCountChange} órdenes`,
      marginChange: 'del total',

      // Comparison
      currentRevenue: formatCurrency(comparison.current.revenue),
      currentProfit: formatCurrency(comparison.current.profit),
      revenueChangePercent: Math.abs(comparison.comparison.revenueChangePercent).toFixed(1),
      profitChangePercent: Math.abs(comparison.comparison.profitChangePercent).toFixed(1),
      revenueChangeClass: comparison.comparison.revenueChangePercent >= 0 ? 'positive' : 'negative',
      profitChangeClass: comparison.comparison.profitChangePercent >= 0 ? 'positive' : 'negative',
      revenueChangeIcon: comparison.comparison.revenueChangePercent >= 0 ? '↑' : '↓',
      profitChangeIcon: comparison.comparison.profitChangePercent >= 0 ? '↑' : '↓',

      // Low margin alert
      hasLowMarginOrders: lowMarginOrders.length > 0,
      lowMarginCount: lowMarginOrders.length,
      lowMarginThreshold: 20,

      // Production metrics
      completionRate: productionMetrics.completionRate,
      onTimeRate: productionMetrics.onTimeRate,
      avgCompletionDays: productionMetrics.avgCompletionDays,

      // Top products
      topProducts: topProducts.map((p, index) => ({
        rank: index + 1,
        ...p,
        revenueFormatted: formatCurrency(p.revenue),
        profitFormatted: formatCurrency(p.profit),
        profitMargin: p.profitMargin.toFixed(1)
      })),

      // Top clients
      topClients: topClients.map((c, index) => ({
        rank: index + 1,
        ...c,
        totalSpentFormatted: formatCurrency(c.totalSpent),
        totalProfitFormatted: formatCurrency(c.totalProfit),
        avgOrderValueFormatted: formatCurrency(c.avgOrderValue)
      })),

      // Orders by status
      ordersByStatus: ordersByStatus.map(s => ({
        ...s,
        statusText: capitalizeFirst(s.status),
        revenueFormatted: formatCurrency(s.revenue),
        percentage: ((s.count / totalOrdersCount) * 100).toFixed(1)
      })),

      // Daily revenue (for charts)
      dailyRevenue,

      // Insights and recommendations
      insights,
      recommendations
    };

    // Compile template
    const templatePath = path.join(__dirname, 'templates', 'monthly-report.html');
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);
    const html = template(templateData);

    console.log('✅ Monthly report generated successfully');

    // Save report history
    await saveReportHistory({
      type: 'monthly',
      period: `${year}-${month}`,
      startDate,
      endDate,
      metrics: {
        totalOrders: revenue.orderCount,
        totalRevenue: revenue.revenue,
        totalProfit: revenue.profit,
        avgProfitMargin: revenue.profitMargin
      }
    });

    return {
      html,
      data: templateData,
      type: 'monthly',
      startDate,
      endDate
    };

  } catch (error) {
    console.error('❌ Error generating monthly report:', error);
    throw error;
  }
}

/**
 * Generate weekly report
 */
export async function generateWeeklyReport(date = new Date()) {
  try {
    console.log('📊 Generating weekly report...');

    // Use monthly template but with weekly data
    const summary = await revenueCalculator.getAnalyticsSummary('this_week');

    // For simplicity, reuse daily report template with weekly data
    // In production, you might want a dedicated weekly template
    return await generateDailyReport(date);

  } catch (error) {
    console.error('❌ Error generating weekly report:', error);
    throw error;
  }
}

/**
 * Helper functions
 */

function formatChange(percentage, suffix = '') {
  const sign = percentage >= 0 ? '+' : '';
  const icon = percentage >= 0 ? '↑' : '↓';
  return `${icon} ${sign}${percentage.toFixed(1)}% ${suffix}`;
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function getMonthName(month) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1];
}

function generateInsights(data) {
  const insights = {};

  // Production insight
  if (data.productionMetrics.onTimeRate < 70) {
    insights.production = `La tasa de entrega a tiempo es del ${data.productionMetrics.onTimeRate}%. Considere revisar los procesos de producción para mejorar la eficiencia.`;
  } else if (data.productionMetrics.onTimeRate >= 95) {
    insights.production = `¡Excelente! La tasa de entrega a tiempo es del ${data.productionMetrics.onTimeRate}%, superando el objetivo.`;
  }

  // Product insight
  if (data.topProducts.length > 0) {
    const topProduct = data.topProducts[0];
    insights.products = `"${topProduct.productName}" es el producto más vendido con ${formatCurrency(topProduct.revenue)} en ingresos. Asegúrese de mantener suficiente inventario de materiales.`;
  }

  // Client insight
  if (data.topClients.length > 0) {
    const topClient = data.topClients[0];
    insights.clients = `${topClient.clientName} es el cliente más valioso con ${topClient.orderCount} órdenes y ${formatCurrency(topClient.totalSpent)} en compras totales. Considere un programa de lealtad.`;
  }

  return insights;
}

function generateRecommendations(data) {
  const recommendations = [];

  // Low margin recommendation
  if (data.lowMarginOrders.length > 5) {
    recommendations.push({
      title: '💰 Optimizar Márgenes de Ganancia',
      description: `${data.lowMarginOrders.length} órdenes tienen márgenes bajos. Revise los costos de materiales y considere ajustar los precios para productos con bajo margen.`
    });
  }

  // Production efficiency recommendation
  if (data.productionMetrics.completionRate < 80) {
    recommendations.push({
      title: '⚡ Mejorar Eficiencia de Producción',
      description: `La tasa de finalización es del ${data.productionMetrics.completionRate}%. Identifique cuellos de botella en el proceso de producción.`
    });
  }

  // Growth recommendation
  if (data.comparison.comparison.revenueChangePercent < 0) {
    recommendations.push({
      title: '📈 Estrategia de Crecimiento',
      description: 'Los ingresos han disminuido vs el período anterior. Considere campañas de marketing o promociones especiales para impulsar las ventas.'
    });
  }

  return recommendations;
}

async function saveReportHistory(reportData) {
  try {
    await query(
      `INSERT INTO reports_history (
        report_type,
        report_period,
        start_date,
        end_date,
        total_orders,
        total_revenue,
        total_profit,
        average_profit_margin,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        reportData.type,
        reportData.period,
        reportData.startDate,
        reportData.endDate,
        reportData.metrics.totalOrders,
        reportData.metrics.totalRevenue,
        reportData.metrics.totalProfit,
        reportData.metrics.avgProfitMargin
      ]
    );
  } catch (error) {
    console.error('Error saving report history:', error);
    // Don't throw - report generation should continue even if history save fails
  }
}

export default {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport
};
