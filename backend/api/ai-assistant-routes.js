/**
 * AI Universal Assistant API Routes
 * Powered by Claude API - knows everything about the business
 * Supports AI Actions: shipping labels, order management, etc.
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../shared/database.js';
import { authMiddleware } from './admin-routes.js';
import { parseQuoteRequest, generateQuotePDF, getQuoteUrl, getPricingInfo } from '../services/quote-generator.js';

const router = express.Router();

// Apply authentication
router.use(authMiddleware);

// Enable pg_trgm extension for fuzzy text search (similarity function)
// Safe to call repeatedly — only creates if not already present
query('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(err => {
  console.warn('⚠️ Could not enable pg_trgm extension:', err.message);
});

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
  // Clean and split search term into words, filtering out stop words
  const STOP_WORDS = new Set([
    'de', 'del', 'la', 'el', 'en', 'lo', 'los', 'las', 'un', 'una',
    'al', 'es', 'si', 'no', 'por', 'con', 'su', 'para', 'que', 'se',
    'le', 'mi', 'ya', 'ni', 'me', 'te', 'tu', 'yo', 'nos', 'son',
    'the', 'of', 'and', 'to', 'in', 'is', 'it', 'for'
  ]);
  const words = searchTerm
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (words.length === 0) {
    return [];
  }

  // Build dynamic search conditions for each word
  // Each word can match via exact substring (ILIKE) or fuzzy trigram similarity
  // This handles typos like "emanuel" matching "Emmanuel"
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // First set of params: ILIKE patterns (%word%)
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

  // Second set of params: raw words for trigram similarity
  const fuzzyConditions = [];
  const fuzzyStartIndex = paramIndex;
  for (const word of words) {
    if (word.length >= 3) {
      fuzzyConditions.push(`(
        similarity(lower(c.name), $${paramIndex}) > 0.2 OR
        similarity(lower(c.city), $${paramIndex}) > 0.3
      )`);
      params.push(word);
      paramIndex++;
    }
  }

  // Combine: exact OR fuzzy matches
  const allConditions = fuzzyConditions.length > 0
    ? `(${conditions.join(' OR ')}) OR (${fuzzyConditions.join(' OR ')})`
    : conditions.join(' OR ');

  // Build relevance scoring that includes both ILIKE and trigram similarity
  // ILIKE match scores full points, trigram match scores slightly less
  const relevanceExpr = words.map((_, i) => {
    const ilikeParam = i + 1;
    // Check if this word has a corresponding fuzzy param (words >= 3 chars)
    const fuzzyParam = words[i].length >= 3 ? fuzzyStartIndex + words.slice(0, i).filter(w => w.length >= 3).length : null;

    let nameScore = `CASE WHEN c.name ILIKE $${ilikeParam} THEN 3`;
    if (fuzzyParam) {
      nameScore += ` WHEN similarity(lower(c.name), $${fuzzyParam}) > 0.2 THEN 2`;
    }
    nameScore += ` ELSE 0 END`;

    let cityScore = `CASE WHEN c.city ILIKE $${ilikeParam} THEN 2`;
    if (fuzzyParam) {
      cityScore += ` WHEN similarity(lower(c.city), $${fuzzyParam}) > 0.3 THEN 1`;
    }
    cityScore += ` ELSE 0 END`;

    return `${nameScore} + ${cityScore} +
          CASE WHEN c.colonia ILIKE $${ilikeParam} THEN 1 ELSE 0 END +
          CASE WHEN c.phone ILIKE $${ilikeParam} THEN 2 ELSE 0 END`;
  }).join(' + ');

  // Search with combined exact + fuzzy conditions, scored by relevance
  const result = await query(`
    SELECT
      c.id, c.name, c.phone, c.email,
      c.street, c.street_number, c.colonia, c.city, c.state, c.postal, c.postal_code,
      (SELECT COUNT(*) FROM orders WHERE client_id = c.id) as order_count,
      (SELECT MAX(created_at) FROM orders WHERE client_id = c.id) as last_order,
      -- Calculate relevance score (ILIKE = full points, trigram = partial points)
      (${relevanceExpr}) as relevance_score
    FROM clients c
    WHERE ${allConditions}
    ORDER BY
      relevance_score DESC,
      CASE WHEN c.name ILIKE $${paramIndex} THEN 0 ELSE 1 END,
      (SELECT MAX(created_at) FROM orders WHERE client_id = c.id) DESC NULLS LAST
    LIMIT 10
  `, [...params, `${words[0]}%`]);

  // Filter to results with meaningful relevance (tolerate 1 non-matching word)
  const minScore = Math.max(1, words.length - 1);
  const filtered = result.rows.filter(r => r.relevance_score >= minScore);

  // If no good matches with relaxed threshold, return top results anyway
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

### NÓMINA SEMANAL (EMPLEADOS):
| Empleado | Salario Semanal |
|----------|----------------|
| Majo | $2,500 |
| Chris | $2,500 |
| Saoní | $2,500 |
| Ahira | $2,800 |
| Loz | $2,300 |
| Montserrat | $2,000 |
| Belinda | $2,000 |
| Iván | $7,500 |
| Alejandra | $5,000 |
| Daniel | $5,000 |

**Total nómina base semanal: $34,600**
**Bonos disponibles por empleado:** Productividad ($500) + Puntualidad ($500) = $1,000 máx/empleado
**Total nómina máxima con todos los bonos: $44,600** (10 empleados × $1,000 en bonos = $10,000)

Cuando pregunten sobre nómina, pagos a empleados o costos de personal:
- Responde con el desglose por empleado
- Calcula totales según lo que pregunten (semanal, quincenal ×2, mensual ×4)
- Menciona los bonos de productividad y puntualidad si son relevantes

## SECCIONES DEL SISTEMA:

1. **Pedidos** (tab: pedidos) - Gestión de órdenes, crear nuevos pedidos, ver detalles, actualizar estados
2. **Analíticas** (tab: analytics) - Gráficos de ingresos, métricas de ventas, reportes
3. **Productos/Inventario** (tab: productos) - Gestión de materiales, inventario, códigos de barras
4. **Precios** (tab: precios) - Configuración de precios, márgenes, BOM (Bill of Materials), recibos de proveedores
5. **Envíos** (tab: envios) - Base de datos de clientes para envíos, direcciones

## CÓMO RESPONDER:

**REGLA #1: SÉ BREVE Y DIRECTO**
- Respuestas de 2-4 oraciones máximo para preguntas simples
- NO escribas introducciones innecesarias ("¡Claro!", "Por supuesto", "Con gusto te ayudo...")
- NO repitas la pregunta del usuario
- NO agregues conclusiones o despedidas innecesarias
- Ve DIRECTO al punto con la información solicitada

1. **Responde en español** siempre
2. **Datos primero** - da el número o información inmediatamente
3. **Sin relleno** - elimina frases de cortesía excesivas
4. **Solo sugiere secciones** si es realmente útil para el usuario

## REGLAS IMPORTANTES:

1. **NUNCA dibujes gráficos ASCII** - La interfaz NO puede mostrarlos correctamente.

2. **Para visualizaciones**: Menciona la sección de **Analíticas** brevemente.

3. **EVITA estas frases**:
   - "¡Claro!", "¡Por supuesto!", "¡Con gusto!"
   - "Espero que esto te ayude"
   - "Si necesitas algo más, aquí estoy"
   - "Déjame explicarte..."
   - Repetir lo que el usuario preguntó

## FORMATO DE RESPUESTA:

**Respuesta directa** → dato/información → (opcional: dónde ver más)

Ejemplo CORRECTO:
"Ingresos últimos 30 días: **$45,230.00** (23 pedidos). Promedio: $1,966.52/pedido."

Ejemplo INCORRECTO (muy largo):
"¡Hola! Con gusto te ayudo con esa información. Los ingresos del último mes fueron **$45,230.00** con un total de 23 pedidos, lo cual representa un muy buen desempeño. El valor promedio por pedido fue de $1,966.52. Para ver el desglose completo con gráficos interactivos, te recomiendo visitar la sección de **Analíticas**. ¡Espero que esta información te sea útil!"

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

### 4. GENERAR COTIZACIÓN / QUOTE PDF
Cuando el usuario pida crear una cotización o "cotizar" productos, debes:
1. Extraer los productos y cantidades mencionados
2. Opcionalmente obtener el nombre del cliente
3. Generar la cotización con el bloque de acción

**PEDIDO MÍNIMO (MOQ):**
- El pedido mínimo es de **100 piezas** para todos los productos
- EXCEPCIONES: Portallaves, Portaretratos y Souvenir Box tienen mínimo de **50 piezas**
- SIEMPRE menciona estos mínimos cuando te pregunten sobre cantidades o pedidos mínimos

**LISTA DE PRECIOS OFICIAL:**
- **Imanes MDF Chico**: $8/u (100-999 pzas) → $6/u (1000+ pzas)
- **Imanes MDF Mediano**: $11/u (100-999 pzas) → $8/u (1000+ pzas)
- **Imanes MDF Grande**: $15/u (100-999 pzas) → $12/u (1000+ pzas)
- **Imanes 3D**: $15/u (100-999 pzas) → $12/u (1000+ pzas)
- **Imanes Foil Metálico**: $15/u (100-999 pzas) → $12/u (1000+ pzas)
- **Llaveros MDF**: $10/u (100-999 pzas) → $8/u (1000+ pzas)
- **Destapadores MDF**: $20/u (100-499 pzas) → $17/u (500-999 pzas) → $15/u (1000+ pzas)
- **Portallaves MDF**: $40/u (mín. 50 pzas)
- **Portaretratos MDF**: (mín. 50 pzas)
- **Souvenir Box**: $2,250/u (sin mínimo)
- **Botones Metálicos**: $8/u (100-999 pzas) → $6/u (1000+ pzas)

**PRECIOS ESPECIALES/DESCUENTOS - MUY IMPORTANTE:**
Cuando el usuario especifique precios personalizados de CUALQUIER forma, DEBES incluirlos en el "text" de la acción.

**Formas comunes de especificar precio personalizado:**
- "en precio $7" → extraer "iman $7"
- "a $7" → extraer "iman $7"
- "precio de $7" → extraer "iman $7"
- "con precio $7" → extraer "iman $7"
- "llavero $6" → incluir "llavero $6"
- "$7 cada uno" → extraer el producto + "$7"

**REGLA CRÍTICA:** Si el usuario menciona UN precio específico (ej: "precio $7", "a $7", "en $7"), SIEMPRE incluye "[producto] $[precio]" en el campo text. Por ejemplo:
- Usuario: "1200 imanes en precio $7" → text: "1200 imanes mediano, iman $7"
- Usuario: "500 llaveros a $6" → text: "500 llaveros, llavero $6"

**Ejemplos de solicitudes de cotización:**
- "Cotiza 50 imanes y 30 llaveros"
- "Crea una cotización de 100 imanes grandes para María García"
- "Cuánto cuesta 200 destapadores y 100 llaveros?"
- "Dame una cotización de 50 imanes chicos"
- "Cotiza 1000 llaveros, 500 destapadores con Llavero $6 Destapador $16" (precios especiales)
- "100 imanes 3D y 100 imanes foil con 3D $25 Foil $25" (precios especiales)
- "1200 imanes en precio $7" → debe generar "iman $7" en el text

**Cuando detectes una solicitud de cotización, incluye este bloque en tu respuesta:**

\`\`\`action
{
  "type": "generate_quote",
  "text": "INCLUIR AQUÍ EL TEXTO COMPLETO con cantidades + productos + precios especiales",
  "clientName": "nombre del cliente si se menciona (opcional)",
  "clientPhone": "teléfono si se menciona (opcional)",
  "notes": "notas adicionales (opcional)"
}
\`\`\`

**MÚLTIPLES COTIZACIONES PARA COMPARACIÓN:**
Cuando el usuario pida cotizaciones con DIFERENTES CANTIDADES del MISMO producto para comparar opciones, genera MÚLTIPLES cotizaciones separadas.

**Detectar solicitudes de múltiples cotizaciones:**
- "cotización para 200 y 300 imanes" → 2 cotizaciones separadas
- "cotiza 100, 200 y 500 llaveros" → 3 cotizaciones separadas
- "precio de 200 y 300 imanes 3d" → 2 cotizaciones separadas
- "cuánto cuestan 100 o 200 destapadores" → 2 cotizaciones separadas

**Para múltiples cotizaciones, usa este formato:**

\`\`\`action
{
  "type": "generate_multiple_quotes",
  "quotes": [
    { "text": "200 imanes 3d", "label": "Opción 200 pzas" },
    { "text": "300 imanes 3d", "label": "Opción 300 pzas" }
  ],
  "clientName": "nombre del cliente si se menciona (opcional)"
}
\`\`\`

**REGLA IMPORTANTE:** Si el usuario menciona cantidades separadas por "y", "o", comas, o dice "para X y Y piezas", SIEMPRE genera múltiples cotizaciones separadas, NO una sola cotización combinada.

**CRÍTICO - El campo "text" DEBE incluir:**
- Cantidades: "1000", "500", "100"
- Productos: "llaveros", "imanes", "destapadores", "imanes 3d", "imanes foil"
- Precios especiales si los hay: "llavero $6", "iman $8", "3d $25"

**Ejemplos CORRECTOS de "text":**
- "1000 llaveros, 500 destapadores, llavero $6, destapador $16"
- "100 imanes 3d, 100 imanes foil, 3d $25, foil $25"
- "1200 imanes mediano, 250 portallaves, iman $8, portallaves $33"

**Ejemplo INCORRECTO (NO HACER):**
- "llavero $6" (falta la cantidad!)
- "" (texto vacío!)

**IMPORTANTE para cotizaciones:**
- Si el usuario pregunta "cuánto cuesta" o "cuál es el precio", SIEMPRE genera la cotización PDF
- El sistema automáticamente calculará los precios por volumen
- Mínimo de 100 piezas para la mayoría de productos (excepto Portallaves: 50, Portaretratos: 50, Souvenir Box: 1)
- Si el usuario no especifica tamaño de imán, asume MEDIANO
- Responde primero con un resumen de los precios, luego genera el PDF

Ejemplo de respuesta para cotización:
"50 Imanes Mediano: $11.00 c/u = $550.00
30 Llaveros: $10.00 c/u = $300.00
**Total: $850.00** (sin envío)"

### 5. GENERAR CATÁLOGO / LISTA DE PRECIOS
**CRÍTICO: Cuando el usuario pida catálogo, lista de precios, precios de mayoreo, o PDF de productos, SIEMPRE incluye el bloque action. NO solo describas lo que harás - INCLUYE EL BLOQUE.**

**Frases que activan esta acción:**
- "lista de precios", "dame la lista de precios", "precios en PDF"
- "catálogo", "catalogo", "catálogo de productos"
- "precios de mayoreo", "precios mayoreo", "todos los precios"
- "genera el catálogo", "manda el catálogo", "PDF de precios"
- "qué productos manejan", "todos los productos"

**OBLIGATORIO: SIEMPRE incluye este bloque cuando detectes estas frases:**

\`\`\`action
{
  "type": "generate_catalog"
}
\`\`\`

Responde: "Generando el catálogo de productos AXKAN con todos los precios..." y SIEMPRE incluye el bloque action arriba.

### 6. CREAR PEDIDO / ORDER
Cuando el usuario pida CREAR UN PEDIDO (no cotizar, sino crear el pedido real), debes:
1. Extraer los productos, cantidades y precios especiales mencionados
2. INMEDIATAMENTE incluir el bloque de acción - el wizard recolectará los datos faltantes

**CRÍTICO: SIEMPRE incluye el bloque action cuando detectes crear pedido. NO preguntes, NO describas lo que va a pasar, solo INCLUYE EL BLOQUE.**

**Detectar solicitudes de creación de pedido:**
- "Crea una orden para 1000 imanes a $7"
- "Crear pedido de 500 llaveros precio especial $6"
- "Hazme un pedido de 200 imanes"
- "Registra un pedido de..."
- "Nuevo pedido de 1000 imanes con precio especial de $7 pesos"

**DIFERENCIA ENTRE COTIZAR Y CREAR PEDIDO:**
- COTIZAR = solo genera PDF informativo (usa generate_quote)
- CREAR PEDIDO = registra en el sistema (usa start_order_creation)

**Palabras clave para CREAR PEDIDO:**
- "crea una orden", "crear pedido", "nuevo pedido"
- "registra un pedido", "hazme un pedido"
- "crear orden", "hacer pedido"

**Palabras clave para COTIZAR (NO crear pedido):**
- "cotiza", "cotización", "cuánto cuesta", "precio de"

**OBLIGATORIO: Cuando detectes una solicitud de CREAR PEDIDO, SIEMPRE incluye este bloque en tu respuesta:**

\`\`\`action
{
  "type": "start_order_creation",
  "products": [
    {
      "name": "Imán MDF Mediano",
      "quantity": 1000,
      "unitPrice": 7.00
    }
  ],
  "needsClientInfo": true
}
\`\`\`

**Extracción de precios especiales para pedidos:**
- "1000 imanes a $7" → unitPrice: 7.00
- "precio especial de $7 pesos" → unitPrice: 7.00
- "con precio $6" → unitPrice: 6.00
- Si no se especifica precio, usa el precio de lista según cantidad

**Mapeo de productos:**
- "imanes", "iman", "imán" → "Imán MDF Mediano" (default) o según tamaño especificado
- "imanes chicos" → "Imán MDF Chico"
- "imanes grandes" → "Imán MDF Grande"
- "imanes 3d" → "Imán 3D"
- "llaveros", "llavero" → "Llavero MDF"
- "destapadores", "destapador" → "Destapador MDF"

**El wizard popup recolectará automáticamente:** nombre, teléfono, fecha evento, entrega, vendedor, anticipo

## IMPORTANTE PARA ACCIONES:
- Para CREAR PEDIDO: SIEMPRE incluye el bloque action inmediatamente, sin preguntar
- El bloque action debe estar en JSON válido
- Para cotizaciones, SIEMPRE genera el PDF además de dar el resumen de precios
- Si hay múltiples coincidencias de cliente en búsquedas, pregunta cuál es el correcto`;
}

/**
 * POST /api/ai-assistant/chat
 * Send a message to the AI assistant
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, images } = req.body;

    if ((!message || !message.trim()) && (!images || images.length === 0)) {
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

    console.log(`🤖 AI Assistant query: "${(message || '').substring(0, 50)}..."${images ? ` [${images.length} image(s)]` : ''}`);

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

    // Build user content (text + optional images)
    let userContent;
    if (images && images.length > 0) {
      userContent = [];
      // Add image blocks first
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType || 'image/png',
            data: img.base64
          }
        });
      }
      // Add text block
      if (message && message.trim()) {
        userContent.push({ type: 'text', text: message });
      } else {
        userContent.push({ type: 'text', text: 'Describe esta imagen.' });
      }
    } else {
      userContent = message;
    }

    // Build messages array with history
    const messages = [
      ...conversation.messages.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: userContent }
    ];

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: (images && images.length > 0) ? 2500 : 1500,
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
        // Track if user explicitly specified labels count (e.g., "son 4 cajas")
        const userSpecifiedLabels = action.labelsCount && action.labelsCount > 1;

        actionData = {
          type: 'create_shipping_labels',
          needsConfirmation: true,
          data: {
            labelsCount: action.labelsCount || 1,
            userSpecifiedLabels // Flag to preserve user's explicit request
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
            // Calculate boxes for this order (as reference)
            const { totalBoxes, breakdown } = await calculateBoxesForOrder(order.id);
            actionData.data.calculatedBoxes = totalBoxes;
            actionData.data.boxBreakdown = breakdown;
            // Only auto-set labelsCount if user didn't explicitly specify
            if (!actionData.data.userSpecifiedLabels) {
              actionData.data.labelsCount = totalBoxes;
            }
          } else {
            actionData.data.orderNotFound = true;
            actionData.data.searchTerm = action.orderNumber;
          }
        }

        // If we have a suggested order, calculate boxes for it (as reference)
        if (actionData.data.suggestedOrder) {
          const { totalBoxes, breakdown } = await calculateBoxesForOrder(actionData.data.suggestedOrder.id);
          actionData.data.calculatedBoxes = totalBoxes;
          actionData.data.boxBreakdown = breakdown;
          // Only auto-set labelsCount if user didn't explicitly specify
          if (!actionData.data.userSpecifiedLabels) {
            actionData.data.labelsCount = totalBoxes;
          }
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
      } else if (action.type === 'generate_quote') {
        // Parse the quote request text to extract items
        // Try action.text first, then original message, pick the one with better price variety
        const actionTextItems = action.text ? parseQuoteRequest(action.text) : [];
        const messageItems = parseQuoteRequest(message);

        // Prefer the result that has more distinct prices (custom per-item pricing)
        let items;
        if (actionTextItems.length === 0) {
          items = messageItems;
        } else if (messageItems.length === 0) {
          items = actionTextItems;
        } else {
          const actionPrices = new Set(actionTextItems.map(i => i.unitPrice));
          const messagePrices = new Set(messageItems.map(i => i.unitPrice));
          // If action.text produced all same price but user message has varied prices, prefer message
          items = (messagePrices.size > actionPrices.size && messageItems.length >= actionTextItems.length)
            ? messageItems : actionTextItems;
        }

        console.log(`📝 Quote parse: action.text=${actionTextItems.length} items, message=${messageItems.length} items, using=${items === messageItems ? 'message' : 'action.text'}`);

        if (items.length > 0) {
          try {
            // Generate the PDF
            const result = await generateQuotePDF({
              clientName: action.clientName || null,
              clientPhone: action.clientPhone || null,
              clientEmail: action.clientEmail || null,
              items,
              notes: action.notes || null,
              validityDays: 3,
              includeShipping: false
            });

            actionData = {
              type: 'generate_quote',
              data: {
                success: true,
                quoteNumber: result.quoteNumber,
                total: result.total,
                subtotal: result.subtotal,
                shipping: result.shipping,
                freeShipping: result.freeShipping,
                totalPieces: result.totalPieces,
                itemCount: result.itemCount,
                validUntil: result.validUntil,
                pdfUrl: getQuoteUrl(result.filepath),
                filename: result.filename,
                items: result.items,
                invalidItems: result.invalidItems,
                clientName: action.clientName
              }
            };

            console.log(`📄 Quote generated: ${result.quoteNumber} - Total: $${result.total}`);
          } catch (quoteError) {
            console.error('Error generating quote PDF:', quoteError);
            actionData = {
              type: 'generate_quote',
              data: {
                success: false,
                error: quoteError.message || 'Error al generar la cotización'
              }
            };
          }
        } else {
          actionData = {
            type: 'generate_quote',
            data: {
              success: false,
              error: 'No se encontraron productos válidos. Intenta especificar cantidades y productos, ejemplo: "50 imanes y 30 llaveros"'
            }
          };
        }
      } else if (action.type === 'generate_multiple_quotes') {
        // Generate multiple separate quotes for comparison
        const quotes = action.quotes || [];
        const results = [];

        for (const quoteSpec of quotes) {
          const quoteText = quoteSpec.text || '';
          const items = parseQuoteRequest(quoteText);

          if (items.length > 0) {
            try {
              const result = await generateQuotePDF({
                clientName: action.clientName || null,
                clientPhone: action.clientPhone || null,
                clientEmail: action.clientEmail || null,
                items,
                notes: quoteSpec.label || null,
                validityDays: 3,
                includeShipping: false
              });

              results.push({
                success: true,
                label: quoteSpec.label || `Opción ${results.length + 1}`,
                quoteNumber: result.quoteNumber,
                total: result.total,
                subtotal: result.subtotal,
                shipping: result.shipping,
                freeShipping: result.freeShipping,
                totalPieces: result.totalPieces,
                itemCount: result.itemCount,
                validUntil: result.validUntil,
                pdfUrl: getQuoteUrl(result.filepath),
                filename: result.filename,
                items: result.items,
                invalidItems: result.invalidItems
              });

              console.log(`📄 Quote generated: ${result.quoteNumber} - Total: $${result.total}`);
            } catch (quoteError) {
              console.error('Error generating quote PDF:', quoteError);
              results.push({
                success: false,
                label: quoteSpec.label || `Opción ${results.length + 1}`,
                error: quoteError.message || 'Error al generar la cotización'
              });
            }
          } else {
            results.push({
              success: false,
              label: quoteSpec.label || `Opción ${results.length + 1}`,
              error: 'No se encontraron productos válidos en: ' + quoteText
            });
          }
        }

        actionData = {
          type: 'generate_multiple_quotes',
          data: {
            success: results.some(r => r.success),
            quotes: results,
            clientName: action.clientName
          }
        };
      } else if (action.type === 'start_order_creation') {
        // Pass the product information to frontend for interactive wizard
        actionData = {
          type: 'start_order_creation',
          data: {
            products: action.products || [],
            needsClientInfo: true
          }
        };
        console.log('🛒 Starting order creation wizard with products:', action.products);
      }

      // Remove the action block from displayed message
      assistantMessage = assistantMessage.replace(/```action\n[\s\S]*?\n```/g, '').trim();
    }

    // FALLBACK: If AI didn't output action block but message clearly indicates order creation
    if (!actionData) {
      const lowerMsg = message.toLowerCase();
      const orderCreationKeywords = [
        'crea una orden', 'crear orden', 'crear pedido', 'crea un pedido',
        'nuevo pedido', 'registra un pedido', 'hazme un pedido', 'hacer pedido',
        'registrar pedido', 'nuevo orden'
      ];

      const isOrderCreation = orderCreationKeywords.some(kw => lowerMsg.includes(kw));

      if (isOrderCreation) {
        console.log('🔧 Fallback: Detecting order creation intent from message');

        // Extract quantity
        const qtyMatch = lowerMsg.match(/(\d+)\s*(imanes?|llaveros?|destapadores?|portallaves?)/i);
        const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 100;

        // Extract product
        let productName = 'Imán MDF Mediano';
        if (lowerMsg.includes('llavero')) productName = 'Llavero MDF';
        else if (lowerMsg.includes('destapador')) productName = 'Destapador MDF';
        else if (lowerMsg.includes('portallaves') || lowerMsg.includes('porta llaves')) productName = 'Portallaves MDF';
        else if (lowerMsg.includes('3d') || lowerMsg.includes('imanes 3d')) productName = 'Imán 3D';
        else if (lowerMsg.includes('chico') || lowerMsg.includes('pequeño')) productName = 'Imán MDF Chico';
        else if (lowerMsg.includes('grande')) productName = 'Imán MDF Grande';

        // Extract price - look for various patterns
        let unitPrice = null;
        const pricePatterns = [
          /precio\s*(?:especial\s*)?(?:de\s*)?\$?(\d+(?:\.\d+)?)/i,
          /\$(\d+(?:\.\d+)?)\s*(?:pesos?|c\/u|cada uno)?/i,
          /a\s*\$?(\d+(?:\.\d+)?)/i,
          /en\s*\$?(\d+(?:\.\d+)?)/i,
          /(\d+(?:\.\d+)?)\s*pesos/i
        ];

        for (const pattern of pricePatterns) {
          const match = lowerMsg.match(pattern);
          if (match) {
            unitPrice = parseFloat(match[1]);
            break;
          }
        }

        // Default prices if not specified
        if (!unitPrice) {
          if (productName.includes('Llavero')) unitPrice = quantity >= 1000 ? 8 : 10;
          else if (productName.includes('Destapador')) unitPrice = quantity >= 1000 ? 15 : quantity >= 500 ? 17 : 20;
          else if (productName.includes('Portallaves')) unitPrice = 40;
          else if (productName.includes('3D')) unitPrice = quantity >= 1000 ? 12 : 15;
          else if (productName.includes('Chico')) unitPrice = quantity >= 1000 ? 6 : 8;
          else if (productName.includes('Grande')) unitPrice = quantity >= 1000 ? 12 : 15;
          else unitPrice = quantity >= 1000 ? 8 : 11; // Mediano default
        }

        actionData = {
          type: 'start_order_creation',
          data: {
            products: [{
              name: productName,
              quantity: quantity,
              unitPrice: unitPrice
            }],
            needsClientInfo: true
          }
        };

        console.log('🛒 Fallback order creation:', actionData.data.products);
      }
    } else if (action.type === 'generate_catalog') {
      try {
        const { generateCatalogPDF, getCatalogUrl } = await import('../services/catalog-generator.js');
        const result = await generateCatalogPDF();

        actionData = {
          type: 'generate_catalog',
          data: {
            success: true,
            pdfUrl: getCatalogUrl(result.filepath),
            filename: result.filename,
            productCount: result.productCount,
            generatedAt: result.generatedAt
          }
        };

        console.log(`📋 Catalog generated: ${result.filename}`);
      } catch (catalogError) {
        console.error('❌ Error generating catalog:', catalogError);
        actionData = {
          type: 'generate_catalog',
          data: {
            success: false,
            error: catalogError.message || 'Error al generar el catálogo'
          }
        };
      }
    }

    // =====================================================
    // FALLBACK: Auto-detect catalog/price list requests
    // even if AI didn't produce the action block
    // =====================================================
    if (!actionData && message) {
      const msgLower = message.toLowerCase();
      const catalogKeywords = [
        'lista de precios', 'catálogo', 'catalogo', 'price list',
        'precios de mayoreo', 'precios mayoreo', 'todos los precios',
        'todos los productos en pdf', 'pdf de precios', 'genera el catálogo',
        'manda el catálogo', 'manda el catalogo', 'dame el catálogo',
        'dame el catalogo', 'catálogo de productos', 'catalogo de productos'
      ];

      const isCatalogRequest = catalogKeywords.some(kw => msgLower.includes(kw));

      if (isCatalogRequest) {
        console.log('📋 Fallback: Detected catalog request from user message');
        try {
          const { generateCatalogPDF, getCatalogUrl } = await import('../services/catalog-generator.js');
          const result = await generateCatalogPDF();

          actionData = {
            type: 'generate_catalog',
            data: {
              success: true,
              pdfUrl: getCatalogUrl(result.filepath),
              filename: result.filename,
              productCount: result.productCount,
              generatedAt: result.generatedAt
            }
          };

          console.log(`📋 Fallback catalog generated: ${result.filename}`);
        } catch (catalogError) {
          console.error('❌ Fallback catalog error:', catalogError);
          actionData = {
            type: 'generate_catalog',
            data: {
              success: false,
              error: catalogError.message || 'Error al generar el catálogo'
            }
          };
        }
      }
    }

    // Store in conversation history (text only - skip image data to save memory)
    const historyUserContent = (images && images.length > 0)
      ? `[${images.length} imagen(es) adjunta(s)] ${message || ''}`
      : message;
    conversation.messages.push({ role: 'user', content: historyUserContent });
    conversation.messages.push({ role: 'assistant', content: assistantMessage });

    // Detect ALL sections mentioned in message or response
    const lowerMessage = (message || '').toLowerCase();
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
