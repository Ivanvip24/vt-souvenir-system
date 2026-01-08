/**
 * AI Universal Assistant API Routes
 * Powered by Claude API - knows everything about the business
 * Supports AI Actions: shipping labels, order management, etc.
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';

const router = express.Router();

// Apply authentication
router.use(authMiddleware);

// =====================================================
// PIECES PER BOX CONFIGURATION
// =====================================================
const PIECES_PER_BOX = {
  'iman': 200,
  'imanes': 200,
  'magnet': 200,
  'llavero': 450,
  'llaveros': 450,
  'keychain': 450,
  'destapador': 200,
  'destapadores': 200,
  'bottle opener': 200,
  'abridor': 200,
  'portallaves': 40,
  'porta llaves': 40,
  'key holder': 40,
  'default': 100
};

function getPiecesPerBox(productName) {
  if (!productName) return PIECES_PER_BOX.default;
  const name = productName.toLowerCase().trim();
  for (const [keyword, pieces] of Object.entries(PIECES_PER_BOX)) {
    if (keyword !== 'default' && name.includes(keyword)) return pieces;
  }
  return PIECES_PER_BOX.default;
}

async function calculateBoxesForOrder(orderId) {
  const itemsResult = await query(`
    SELECT product_name, quantity FROM order_items WHERE order_id = $1
  `, [orderId]);

  let totalBoxes = 0;
  const breakdown = [];

  for (const item of itemsResult.rows) {
    const piecesPerBox = getPiecesPerBox(item.product_name);
    const boxes = Math.ceil(item.quantity / piecesPerBox);
    totalBoxes += boxes;
    breakdown.push({
      product: item.product_name,
      quantity: item.quantity,
      piecesPerBox,
      boxes
    });
  }

  return { totalBoxes: Math.max(1, totalBoxes), breakdown };
}

// =====================================================
// AI ACTION HANDLERS
// =====================================================

/**
 * Smart search for client by name, city, or any identifier
 * Splits search term into words and searches across multiple fields
 * Returns best matches with relevance scoring
 */
async function findClientByName(searchTerm) {
  // Clean and split search term into words (min 2 chars each)
  const words = searchTerm
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  if (words.length === 0) {
    return [];
  }

  // Build dynamic search conditions for each word
  // Each word can match: name, city, colonia, phone, or email
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  for (const word of words) {
    conditions.push(`(
      c.name ILIKE $${paramIndex} OR
      c.city ILIKE $${paramIndex} OR
      c.colonia ILIKE $${paramIndex} OR
      c.phone ILIKE $${paramIndex} OR
      c.email ILIKE $${paramIndex} OR
      c.street ILIKE $${paramIndex}
    )`);
    params.push(`%${word}%`);
    paramIndex++;
  }

  // Search with all words as OR conditions first for broader matches
  // Then score by how many words match
  const result = await query(`
    SELECT
      c.id, c.name, c.phone, c.email,
      c.street, c.street_number, c.colonia, c.city, c.state, c.postal, c.postal_code,
      (SELECT COUNT(*) FROM orders WHERE client_id = c.id) as order_count,
      (SELECT MAX(created_at) FROM orders WHERE client_id = c.id) as last_order,
      -- Calculate relevance score
      (
        ${words.map((_, i) => `
          CASE WHEN c.name ILIKE $${i + 1} THEN 3 ELSE 0 END +
          CASE WHEN c.city ILIKE $${i + 1} THEN 2 ELSE 0 END +
          CASE WHEN c.colonia ILIKE $${i + 1} THEN 1 ELSE 0 END +
          CASE WHEN c.phone ILIKE $${i + 1} THEN 2 ELSE 0 END
        `).join(' + ')}
      ) as relevance_score
    FROM clients c
    WHERE ${conditions.join(' OR ')}
    ORDER BY
      relevance_score DESC,
      CASE WHEN c.name ILIKE $${paramIndex} THEN 0 ELSE 1 END,
      (SELECT MAX(created_at) FROM orders WHERE client_id = c.id) DESC NULLS LAST
    LIMIT 10
  `, [...params, `${words[0]}%`]);

  // Filter to only return results with meaningful relevance
  const filtered = result.rows.filter(r => r.relevance_score >= words.length);

  // If no good matches with all words, return top results anyway
  return filtered.length > 0 ? filtered.slice(0, 5) : result.rows.slice(0, 5);
}

/**
 * Get client's recent orders
 */
async function getClientOrders(clientId, limit = 5) {
  const result = await query(`
    SELECT
      o.id, o.order_number, o.total_price, o.status, o.approval_status,
      o.created_at, o.production_deadline,
      (SELECT COUNT(*) FROM shipping_labels WHERE order_id = o.id) as labels_count,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) as total_pieces
    FROM orders o
    WHERE o.client_id = $1
    ORDER BY o.created_at DESC
    LIMIT $2
  `, [clientId, limit]);

  return result.rows;
}

/**
 * Get order details by order number or ID
 */
async function getOrderDetails(orderIdentifier) {
  const result = await query(`
    SELECT
      o.id, o.order_number, o.total_price, o.status, o.approval_status,
      o.created_at, o.production_deadline, o.shipping_labels_count,
      c.id as client_id, c.name as client_name, c.phone as client_phone, c.email as client_email,
      c.street, c.street_number, c.colonia, c.city, c.state,
      COALESCE(c.postal, c.postal_code) as postal,
      (SELECT COUNT(*) FROM shipping_labels WHERE order_id = o.id) as existing_labels,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) as total_pieces
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    WHERE o.order_number ILIKE $1 OR o.id::text = $1
  `, [orderIdentifier.replace('#', '').replace('VT-', 'VT-')]);

  return result.rows[0];
}

/**
 * Parse AI response for actions
 */
function parseAIResponseForActions(response) {
  // Look for JSON action block in response
  const actionMatch = response.match(/```action\n([\s\S]*?)\n```/);
  if (actionMatch) {
    try {
      return JSON.parse(actionMatch[1]);
    } catch (e) {
      console.error('Failed to parse action JSON:', e);
    }
  }
  return null;
}

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

## REGLAS IMPORTANTES:

1. **NUNCA dibujes gráficos ASCII** - No uses caracteres como |, -, +, = para hacer gráficos de barras o líneas. La interfaz de chat NO puede mostrar estos gráficos correctamente y se verán como texto sin sentido.

2. **Para visualizaciones**: Cuando el usuario pida gráficos o visualizaciones, menciona que pueden ver gráficos interactivos en la sección de **Analíticas**. El sistema automáticamente mostrará un mini-gráfico si es relevante.

3. **Menciona las secciones relevantes**: Cuando hables de pedidos, analíticas, productos, precios o envíos, menciona la sección correspondiente. El sistema automáticamente agregará botones de navegación.

## FORMATO DE RESPUESTA:

Cuando des información, estructura tu respuesta así:
- Primero: respuesta directa con los datos solicitados
- Segundo: contexto adicional si es relevante
- Tercero: sugerencia de dónde ver más detalles (mención natural de la sección)

Ejemplo:
"Los ingresos del último mes fueron **$45,230.00** con un total de 23 pedidos.

El valor promedio por pedido fue de $1,966.52.

Para ver el desglose completo con gráficos interactivos, visita la sección de **Analíticas**."

## ACCIONES EJECUTABLES:

Puedes ejecutar acciones cuando el usuario lo solicite. Las acciones disponibles son:

### 1. CREAR GUÍAS DE ENVÍO
Cuando el usuario pida crear guías de envío, debes:
1. Identificar el cliente o pedido mencionado
2. Determinar cuántas cajas/guías necesita
3. Responder con un bloque de acción

**Ejemplos de solicitudes de guías:**
- "Crea 8 guías para el pedido de María García"
- "Necesito generar etiquetas de envío para VT-0045, son 5 cajas"
- "Hazme las guías del cliente Juan Pérez, el pedido de los llaveros"

**Cuando detectes una solicitud de guías, incluye este bloque en tu respuesta:**

\`\`\`action
{
  "type": "create_shipping_labels",
  "clientName": "Nombre del cliente mencionado",
  "orderNumber": "VT-XXXX si se menciona",
  "labelsCount": número de guías/cajas,
  "needsConfirmation": true
}
\`\`\`

**Si te falta información**, pregunta específicamente qué necesitas:
- Si no sabes cuántas cajas: "¿Cuántas cajas/guías necesitas para este pedido?"
- Si no identificas al cliente: "¿Podrías confirmarme el nombre del cliente o número de pedido?"

### 2. BUSCAR CLIENTE
Si mencionan un cliente pero no tienes certeza de cuál es:

\`\`\`action
{
  "type": "search_client",
  "searchTerm": "término de búsqueda"
}
\`\`\`

### 3. VER DETALLES DE PEDIDO

\`\`\`action
{
  "type": "view_order",
  "orderNumber": "VT-XXXX"
}
\`\`\`

## IMPORTANTE PARA ACCIONES:
- Solo incluye el bloque \`\`\`action\`\`\` cuando tengas suficiente información
- El bloque action debe estar en JSON válido
- Siempre confirma la acción antes de ejecutarla
- Si hay múltiples coincidencias de cliente, pregunta cuál es el correcto`;
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

    let assistantMessage = response.content[0].text;

    // Parse for action blocks
    const action = parseAIResponseForActions(assistantMessage);
    let actionData = null;

    if (action) {
      console.log('🎯 AI Action detected:', action.type);

      // Process the action and enrich with database data
      if (action.type === 'create_shipping_labels') {
        actionData = {
          type: 'create_shipping_labels',
          needsConfirmation: true,
          data: {
            labelsCount: action.labelsCount || 1
          }
        };

        // Look up client if name provided
        if (action.clientName) {
          const clients = await findClientByName(action.clientName);
          if (clients.length === 1) {
            actionData.data.client = clients[0];
            // Get recent orders for this client
            const orders = await getClientOrders(clients[0].id);
            actionData.data.recentOrders = orders;
            // Auto-select most recent approved order without labels
            const eligibleOrder = orders.find(o =>
              o.approval_status === 'approved' &&
              parseInt(o.labels_count) === 0
            );
            if (eligibleOrder) {
              actionData.data.suggestedOrder = eligibleOrder;
            }
          } else if (clients.length > 1) {
            actionData.data.clientMatches = clients;
            actionData.needsClientSelection = true;
          } else {
            actionData.data.clientNotFound = true;
            actionData.data.searchTerm = action.clientName;
          }
        }

        // Look up order if order number provided
        if (action.orderNumber) {
          const order = await getOrderDetails(action.orderNumber);
          if (order) {
            actionData.data.order = order;
            actionData.data.client = {
              id: order.client_id,
              name: order.client_name,
              phone: order.client_phone,
              email: order.client_email,
              street: order.street,
              street_number: order.street_number,
              colonia: order.colonia,
              city: order.city,
              state: order.state,
              postal: order.postal
            };
            // Calculate boxes for this order
            const { totalBoxes, breakdown } = await calculateBoxesForOrder(order.id);
            actionData.data.calculatedBoxes = totalBoxes;
            actionData.data.boxBreakdown = breakdown;
            actionData.data.labelsCount = totalBoxes; // Auto-set to calculated
          } else {
            actionData.data.orderNotFound = true;
            actionData.data.searchTerm = action.orderNumber;
          }
        }

        // If we have a suggested order, calculate boxes for it too
        if (actionData.data.suggestedOrder) {
          const { totalBoxes, breakdown } = await calculateBoxesForOrder(actionData.data.suggestedOrder.id);
          actionData.data.calculatedBoxes = totalBoxes;
          actionData.data.boxBreakdown = breakdown;
          actionData.data.labelsCount = totalBoxes;
        }
      } else if (action.type === 'search_client') {
        const clients = await findClientByName(action.searchTerm);
        actionData = {
          type: 'search_client',
          data: {
            clients,
            searchTerm: action.searchTerm
          }
        };
      } else if (action.type === 'view_order') {
        const order = await getOrderDetails(action.orderNumber);
        actionData = {
          type: 'view_order',
          data: { order }
        };
      }

      // Remove the action block from displayed message
      assistantMessage = assistantMessage.replace(/```action\n[\s\S]*?\n```/g, '').trim();
    }

    // Store in conversation history
    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: assistantMessage });

    // Detect ALL sections mentioned in message or response
    const lowerMessage = message.toLowerCase();
    const lowerResponse = assistantMessage.toLowerCase();
    const combinedText = lowerMessage + ' ' + lowerResponse;

    const detectedSections = [];

    // Check for analytics/revenue mentions
    if (combinedText.includes('ingreso') || combinedText.includes('revenue') || combinedText.includes('venta') ||
        combinedText.includes('ganancia') || combinedText.includes('analítica') || combinedText.includes('reporte') ||
        combinedText.includes('gráfico') || combinedText.includes('estadística')) {
      detectedSections.push({ name: 'Analíticas', tab: 'analytics', icon: '📊' });
    }

    // Check for orders mentions
    if (combinedText.includes('pedido') || combinedText.includes('orden') || combinedText.includes('order') ||
        combinedText.includes('pendiente') || combinedText.includes('producción') || combinedText.includes('entrega')) {
      detectedSections.push({ name: 'Pedidos', tab: 'orders', icon: '📋' });
    }

    // Check for products/inventory mentions
    if (combinedText.includes('material') || combinedText.includes('inventario') || combinedText.includes('stock') ||
        combinedText.includes('producto')) {
      detectedSections.push({ name: 'Productos', tab: 'products', icon: '🛍️' });
    }

    // Check for prices mentions
    if (combinedText.includes('precio') || combinedText.includes('margen') || combinedText.includes('costo') ||
        combinedText.includes('proveedor') || combinedText.includes('recibo') || combinedText.includes('bom')) {
      detectedSections.push({ name: 'Precios', tab: 'prices', icon: '💰' });
    }

    // Check for shipping mentions
    if (combinedText.includes('envío') || combinedText.includes('dirección') || combinedText.includes('shipping') ||
        combinedText.includes('guía') || combinedText.includes('paquete')) {
      detectedSections.push({ name: 'Envíos', tab: 'shipping', icon: '📦' });
    }

    // Check for calendar mentions
    if (combinedText.includes('calendario') || combinedText.includes('fecha') || combinedText.includes('deadline') ||
        combinedText.includes('capacidad')) {
      detectedSections.push({ name: 'Calendario', tab: 'calendar', icon: '📅' });
    }

    // Extract quick stats if the query is about numbers
    let quickStats = null;
    if (lowerMessage.includes('ingreso') || lowerMessage.includes('revenue') || lowerMessage.includes('cuánto') ||
        lowerMessage.includes('total') || lowerMessage.includes('ventas')) {
      quickStats = {
        'Hoy': `$${parseFloat(businessContext.orderStats?.revenue_today || 0).toLocaleString('es-MX', {minimumFractionDigits: 0})}`,
        '7 días': `$${parseFloat(businessContext.orderStats?.revenue_last_7_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 0})}`,
        '30 días': `$${parseFloat(businessContext.orderStats?.revenue_last_30_days || 0).toLocaleString('es-MX', {minimumFractionDigits: 0})}`
      };
    }

    // Include chart data when relevant (for mini-charts)
    let chartData = null;
    if (lowerMessage.includes('ingreso') || lowerMessage.includes('venta') || lowerMessage.includes('revenue') ||
        lowerMessage.includes('mes') || lowerMessage.includes('gráfico') || lowerMessage.includes('gráfica')) {
      // Prepare monthly revenue data for chart
      if (businessContext.monthlyRevenue && businessContext.monthlyRevenue.length > 0) {
        chartData = {
          type: 'bar',
          title: 'Ingresos por Mes',
          labels: businessContext.monthlyRevenue.map(m => {
            const [year, month] = m.month.split('-');
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return monthNames[parseInt(month) - 1] + ' ' + year.slice(2);
          }).reverse(),
          data: businessContext.monthlyRevenue.map(m => parseFloat(m.revenue)).reverse(),
          backgroundColor: '#3b82f6'
        };
      }
    }

    res.json({
      success: true,
      data: {
        message: assistantMessage,
        detectedSections,
        quickStats,
        chartData,
        action: actionData,
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
