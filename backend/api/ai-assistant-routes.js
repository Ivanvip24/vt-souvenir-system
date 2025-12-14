/**
 * AI Universal Assistant API Routes
 * Powered by Claude API - knows everything about the business
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// Apply authentication
router.use(authMiddleware);

// Store conversation history per session (in-memory for now)
const conversationStore = new Map();

// Clean up old conversations after 2 hours
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  for (const [key, value] of conversationStore.entries()) {
    if (value.lastAccess < twoHoursAgo) {
      conversationStore.delete(key);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

/**
 * Get business context data for AI
 */
async function getBusinessContext() {
  try {
    const context = {};

    // Get order statistics
    const orderStats = await query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as orders_last_30_days,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as orders_last_7_days,
        COUNT(CASE WHEN status = 'pending' OR status = 'New' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'completed' OR status = 'Delivered' THEN 1 END) as completed_orders,
        COALESCE(SUM(total_price), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN total_price END), 0) as revenue_last_30_days,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN total_price END), 0) as revenue_last_7_days,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_price END), 0) as revenue_today,
        COALESCE(AVG(total_price), 0) as avg_order_value
      FROM orders
    `);
    context.orderStats = orderStats.rows[0];

    // Get monthly revenue breakdown
    const monthlyRevenue = await query(`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as order_count,
        COALESCE(SUM(total_price), 0) as revenue
      FROM orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 6
    `);
    context.monthlyRevenue = monthlyRevenue.rows;

    // Get client statistics
    const clientStats = await query(`
      SELECT
        COUNT(*) as total_clients,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_clients_30_days
      FROM clients
    `);
    context.clientStats = clientStats.rows[0];

    // Get top clients
    const topClients = await query(`
      SELECT
        c.name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_price), 0) as total_spent
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      GROUP BY c.id, c.name
      ORDER BY total_spent DESC
      LIMIT 5
    `);
    context.topClients = topClients.rows;

    // Get top products
    const topProducts = await query(`
      SELECT
        product_name,
        SUM(quantity) as total_quantity,
        COALESCE(SUM(line_total), 0) as total_revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY total_revenue DESC
      LIMIT 5
    `);
    context.topProducts = topProducts.rows;

    // Get recent orders
    const recentOrders = await query(`
      SELECT
        o.id,
        o.order_number,
        c.name as client_name,
        o.total_price,
        o.status,
        o.created_at
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);
    context.recentOrders = recentOrders.rows;

    // Get materials/inventory stats
    const materialStats = await query(`
      SELECT
        COUNT(*) as total_materials,
        COUNT(CASE WHEN current_stock <= min_stock_level THEN 1 END) as low_stock_count
      FROM raw_materials
      WHERE is_active = true
    `).catch(() => ({ rows: [{ total_materials: 0, low_stock_count: 0 }] }));
    context.materialStats = materialStats.rows[0];

    // Get supplier stats
    const supplierStats = await query(`
      SELECT
        COUNT(DISTINCT s.id) as total_suppliers,
        COUNT(sr.id) as total_receipts,
        COALESCE(SUM(sr.grand_total), 0) as total_purchases
      FROM suppliers s
      LEFT JOIN supplier_receipts sr ON s.id = sr.supplier_id
    `).catch(() => ({ rows: [{ total_suppliers: 0, total_receipts: 0, total_purchases: 0 }] }));
    context.supplierStats = supplierStats.rows[0];

    // Get pending payments info
    const paymentStats = await query(`
      SELECT
        COUNT(CASE WHEN deposit_amount IS NOT NULL AND deposit_amount > 0 AND (second_payment_amount IS NULL OR second_payment_amount = 0) THEN 1 END) as pending_final_payments,
        COALESCE(SUM(CASE WHEN deposit_amount IS NOT NULL AND deposit_amount > 0 AND (second_payment_amount IS NULL OR second_payment_amount = 0) THEN total_price - deposit_amount END), 0) as pending_amount
      FROM orders
      WHERE status NOT IN ('cancelled', 'Cancelled')
    `).catch(() => ({ rows: [{ pending_final_payments: 0, pending_amount: 0 }] }));
    context.paymentStats = paymentStats.rows[0];

    return context;
  } catch (error) {
    console.error('Error fetching business context:', error);
    return {};
  }
}

/**
 * Build system prompt with business context
 */
function buildSystemPrompt(context) {
  const now = new Date();
  const currentMonth = now.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  return `Eres el asistente de IA de AXKAN, un sistema CRM para gestión de pedidos de souvenirs personalizados.
Tu rol es ayudar a los administradores a encontrar información, navegar el sistema y responder preguntas sobre el negocio.

FECHA ACTUAL: ${now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## DATOS DEL NEGOCIO EN TIEMPO REAL:

### ESTADÍSTICAS DE PEDIDOS:
- Total de pedidos: ${context.orderStats?.total_orders || 0}
- Pedidos últimos 30 días: ${context.orderStats?.orders_last_30_days || 0}
- Pedidos últimos 7 días: ${context.orderStats?.orders_last_7_days || 0}
- Pedidos pendientes: ${context.orderStats?.pending_orders || 0}
- Pedidos completados: ${context.orderStats?.completed_orders || 0}

### INGRESOS:
- Ingresos totales: $${parseFloat(context.orderStats?.total_revenue || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
- Ingresos últimos 30 días: $${parseFloat(context.orderStats?.revenue_last_30_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
- Ingresos últimos 7 días: $${parseFloat(context.orderStats?.revenue_last_7_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
- Ingresos hoy: $${parseFloat(context.orderStats?.revenue_today || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
- Valor promedio de pedido: $${parseFloat(context.orderStats?.avg_order_value || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}

### INGRESOS POR MES (últimos 6 meses):
${context.monthlyRevenue?.map(m => `- ${m.month}: $${parseFloat(m.revenue).toLocaleString('es-MX', {minimumFractionDigits: 2})} (${m.order_count} pedidos)`).join('\n') || 'Sin datos'}

### CLIENTES:
- Total de clientes: ${context.clientStats?.total_clients || 0}
- Nuevos clientes (30 días): ${context.clientStats?.new_clients_30_days || 0}

### TOP 5 CLIENTES:
${context.topClients?.map((c, i) => `${i+1}. ${c.name}: $${parseFloat(c.total_spent).toLocaleString('es-MX', {minimumFractionDigits: 2})} (${c.order_count} pedidos)`).join('\n') || 'Sin datos'}

### TOP 5 PRODUCTOS:
${context.topProducts?.map((p, i) => `${i+1}. ${p.product_name}: ${p.total_quantity} unidades, $${parseFloat(p.total_revenue).toLocaleString('es-MX', {minimumFractionDigits: 2})}`).join('\n') || 'Sin datos'}

### PEDIDOS RECIENTES:
${context.recentOrders?.slice(0, 5).map(o => `- #${o.order_number}: ${o.client_name} - $${parseFloat(o.total_price).toLocaleString('es-MX', {minimumFractionDigits: 2})} (${o.status})`).join('\n') || 'Sin datos'}

### INVENTARIO Y MATERIALES:
- Total de materiales: ${context.materialStats?.total_materials || 0}
- Materiales con stock bajo: ${context.materialStats?.low_stock_count || 0}

### PROVEEDORES:
- Total de proveedores: ${context.supplierStats?.total_suppliers || 0}
- Total de recibos: ${context.supplierStats?.total_receipts || 0}
- Total de compras: $${parseFloat(context.supplierStats?.total_purchases || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}

### PAGOS PENDIENTES:
- Pagos finales pendientes: ${context.paymentStats?.pending_final_payments || 0}
- Monto pendiente total: $${parseFloat(context.paymentStats?.pending_amount || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}

## SECCIONES DEL SISTEMA:

1. **Pedidos** (tab: pedidos) - Gestión de órdenes, crear nuevos pedidos, ver detalles, actualizar estados
2. **Analíticas** (tab: analytics) - Gráficos de ingresos, métricas de ventas, reportes
3. **Productos/Inventario** (tab: productos) - Gestión de materiales, inventario, códigos de barras
4. **Precios** (tab: precios) - Configuración de precios, márgenes, BOM (Bill of Materials), recibos de proveedores
5. **Envíos** (tab: envios) - Base de datos de clientes para envíos, direcciones

## CÓMO RESPONDER:

1. **Responde en español** siempre
2. **Sé conciso pero completo** - da la información directa primero, luego ofrece más detalles
3. **Incluye datos específicos** cuando pregunten por números/estadísticas
4. **Sugiere la sección correcta** del sistema para más información
5. **Usa formato estructurado** con bullets, negritas para números importantes
6. **Si no tienes la información**, indica dónde podrían encontrarla en el sistema

## FORMATO DE RESPUESTA:

Cuando des información, estructura tu respuesta así:
- Primero: respuesta directa con los datos solicitados
- Segundo: contexto adicional si es relevante
- Tercero: sugerencia de dónde ver más detalles (sección del sistema)

Ejemplo:
"Los ingresos del último mes fueron **$45,230.00** con un total de 23 pedidos.

El valor promedio por pedido fue de $1,966.52.

📊 Para ver el desglose completo y gráficos, visita la sección de **Analíticas**."`;
}

/**
 * POST /api/ai-assistant/chat
 * Send a message to the AI assistant
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Mensaje vacío'
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'El asistente de IA no está configurado'
      });
    }

    console.log(`🤖 AI Assistant query: "${message.substring(0, 50)}..."`);

    // Get or create conversation history
    const conversationKey = sessionId || req.headers['x-session-id'] || 'default';
    if (!conversationStore.has(conversationKey)) {
      conversationStore.set(conversationKey, {
        messages: [],
        lastAccess: Date.now()
      });
    }
    const conversation = conversationStore.get(conversationKey);
    conversation.lastAccess = Date.now();

    // Get fresh business context
    const businessContext = await getBusinessContext();

    // Build messages array with history
    const messages = [
      ...conversation.messages.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: buildSystemPrompt(businessContext),
      messages: messages
    });

    const assistantMessage = response.content[0].text;

    // Store in conversation history
    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: assistantMessage });

    // Determine which section is most relevant based on the query
    let suggestedSection = null;
    const lowerMessage = message.toLowerCase();
    const lowerResponse = assistantMessage.toLowerCase();

    if (lowerMessage.includes('ingreso') || lowerMessage.includes('revenue') || lowerMessage.includes('venta') ||
        lowerMessage.includes('ganancia') || lowerMessage.includes('analítica') || lowerMessage.includes('reporte') ||
        lowerResponse.includes('analíticas')) {
      suggestedSection = { name: 'Analíticas', tab: 'analytics', icon: '📊' };
    } else if (lowerMessage.includes('pedido') || lowerMessage.includes('orden') || lowerMessage.includes('order') ||
               lowerMessage.includes('cliente') || lowerMessage.includes('nuevo pedido')) {
      suggestedSection = { name: 'Pedidos', tab: 'pedidos', icon: '📋' };
    } else if (lowerMessage.includes('material') || lowerMessage.includes('inventario') || lowerMessage.includes('stock') ||
               lowerMessage.includes('producto')) {
      suggestedSection = { name: 'Productos/Inventario', tab: 'productos', icon: '🛍️' };
    } else if (lowerMessage.includes('precio') || lowerMessage.includes('margen') || lowerMessage.includes('costo') ||
               lowerMessage.includes('proveedor') || lowerMessage.includes('recibo')) {
      suggestedSection = { name: 'Precios', tab: 'precios', icon: '💰' };
    } else if (lowerMessage.includes('envío') || lowerMessage.includes('dirección') || lowerMessage.includes('shipping')) {
      suggestedSection = { name: 'Envíos', tab: 'envios', icon: '📦' };
    }

    // Extract quick stats if the query is about numbers
    let quickStats = null;
    if (lowerMessage.includes('ingreso') || lowerMessage.includes('revenue') || lowerMessage.includes('cuánto') ||
        lowerMessage.includes('total') || lowerMessage.includes('ventas')) {
      quickStats = {
        'Hoy': `$${parseFloat(businessContext.orderStats?.revenue_today || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
        '7 días': `$${parseFloat(businessContext.orderStats?.revenue_last_7_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
        '30 días': `$${parseFloat(businessContext.orderStats?.revenue_last_30_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`
      };
    }

    res.json({
      success: true,
      data: {
        message: assistantMessage,
        suggestedSection,
        quickStats,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ AI Assistant error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar tu mensaje'
    });
  }
});

/**
 * POST /api/ai-assistant/clear
 * Clear conversation history
 */
router.post('/clear', (req, res) => {
  const { sessionId } = req.body;
  const conversationKey = sessionId || req.headers['x-session-id'] || 'default';

  if (conversationStore.has(conversationKey)) {
    conversationStore.delete(conversationKey);
  }

  res.json({
    success: true,
    message: 'Conversación limpiada'
  });
});

/**
 * GET /api/ai-assistant/suggestions
 * Get suggested queries
 */
router.get('/suggestions', (req, res) => {
  res.json({
    success: true,
    data: [
      '¿Cuánto vendimos este mes?',
      '¿Cuáles son los productos más vendidos?',
      '¿Cuántos pedidos tenemos pendientes?',
      '¿Quiénes son nuestros mejores clientes?',
      '¿Cómo creo un nuevo pedido?',
      '¿Dónde veo los reportes de ventas?'
    ]
  });
});

export default router;
