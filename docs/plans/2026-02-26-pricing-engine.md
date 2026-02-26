# Pricing Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pricing engine that calculates accurate per-piece pricing for any quantity (below-MOQ, standard, high-volume) using real BOM data, and integrate it into the AI assistant.

**Architecture:** New `pricing-engine.js` service reads BOM costs from DB + config from a new `pricing_config` table. Two new API endpoints expose it. The AI assistant's system prompt gets a new `calculate_price` action type, and the backend handler calls the engine to return structured breakdowns. The frontend gets a display function for pricing results.

**Tech Stack:** Node.js/Express, PostgreSQL (JSONB), existing shared `query()` pool

**Design doc:** `docs/plans/2026-02-26-pricing-engine-design.md`

---

### Task 1: Create `pricing_config` migration

**Files:**
- Create: `backend/shared/migrations/013-add-pricing-config.sql`
- Modify: `backend/shared/run-migration.js:40` (add new migration call)

**Step 1: Write migration SQL**

Create `backend/shared/migrations/013-add-pricing-config.sql`:

```sql
-- Pricing configuration table for dynamic pricing engine
CREATE TABLE IF NOT EXISTS pricing_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Seed default configuration
INSERT INTO pricing_config (config_key, config_value, description) VALUES
  ('setup_cost_per_run', '{"default": 150, "by_product": {"portallaves de mdf": 200, "portarretratos de mdf": 200}}', 'Fixed cost per production run, divided by quantity for below-MOQ orders'),
  ('target_margins', '{"default": 70, "below_moq": 60, "high_volume": 50}', 'Target margin percentage for different order scenarios'),
  ('floor_prices', '{"imanes de mdf": 5.00, "llaveros de mdf": 4.50, "destapador de mdf": 10.00, "imán 3d mdf 3mm": 7.00, "imán de mdf con foil": 7.00, "botones metálicos": 3.00, "portallaves de mdf": 20.00, "portarretratos de mdf": 20.00, "souvenir box": 1500.00}', 'Absolute minimum price per piece — engine never goes below this'),
  ('below_moq_enabled', '{"enabled": true}', 'Global toggle for accepting below-MOQ pricing calculations')
ON CONFLICT (config_key) DO NOTHING;
```

**Step 2: Register migration in run-migration.js**

In `backend/shared/run-migration.js`, after line 40 (`await runMigration('012-add-cep-verifications.sql');`), add:

```javascript
    await runMigration('013-add-pricing-config.sql');
```

**Step 3: Run migration**

```bash
node backend/shared/run-migration.js
```

Expected: `✅ Migration 013-add-pricing-config.sql completed successfully`

**Step 4: Verify table exists**

```bash
node -e "import('./backend/shared/database.js').then(async ({query}) => { const r = await query('SELECT config_key, config_value FROM pricing_config ORDER BY id'); console.log(JSON.stringify(r.rows, null, 2)); process.exit(0); })"
```

Expected: 4 rows with the seeded config values.

**Step 5: Commit**

```bash
git add -f backend/shared/migrations/013-add-pricing-config.sql backend/shared/run-migration.js
git commit -m "feat: add pricing_config table with seed data for pricing engine"
```

---

### Task 2: Create pricing engine service

**Files:**
- Create: `backend/services/pricing-engine.js`

**Step 1: Write the pricing engine**

Create `backend/services/pricing-engine.js`:

```javascript
import { query } from '../shared/database.js';
import { PRICING_TIERS, MOQ, calculateTieredPrice } from '../shared/pricing.js';

/**
 * Load a config value from pricing_config table
 */
async function getConfig(configKey) {
  const result = await query(
    'SELECT config_value FROM pricing_config WHERE config_key = $1',
    [configKey]
  );
  return result.rows.length > 0 ? result.rows[0].config_value : null;
}

/**
 * Load all pricing config as a flat object
 */
export async function getAllConfig() {
  const result = await query('SELECT config_key, config_value, description FROM pricing_config ORDER BY id');
  const config = {};
  for (const row of result.rows) {
    config[row.config_key] = { value: row.config_value, description: row.description };
  }
  return config;
}

/**
 * Get BOM cost for a product by matching product name
 * Returns { materialCost, laborCost, totalCost } per piece
 */
async function getBomCost(productName) {
  const nameLower = productName.toLowerCase();

  // Find the product by name (fuzzy match)
  const productResult = await query(
    `SELECT id, name, base_price, production_cost, labor_cost
     FROM products
     WHERE LOWER(name) LIKE $1 OR LOWER(name) LIKE $2
     LIMIT 1`,
    [`%${nameLower}%`, `%${nameLower.replace(/\s+/g, '%')}%`]
  );

  if (productResult.rows.length === 0) {
    return { materialCost: 0, laborCost: 0, totalCost: 0, productId: null, productName: productName };
  }

  const product = productResult.rows[0];

  // Get BOM components cost
  const componentsResult = await query(
    `SELECT
      rm.name as material_name,
      rm.cost_per_unit,
      pc.quantity_needed,
      pc.waste_percentage,
      pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100) as total_cost
    FROM product_components pc
    JOIN raw_materials rm ON pc.raw_material_id = rm.id
    WHERE pc.product_id = $1`,
    [product.id]
  );

  const materialCost = componentsResult.rows.reduce(
    (sum, c) => sum + parseFloat(c.total_cost || 0), 0
  );
  const laborCost = parseFloat(product.labor_cost || 0);

  return {
    materialCost: Math.round(materialCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    totalCost: Math.round((materialCost + laborCost) * 100) / 100,
    productId: product.id,
    productName: product.name,
    basePrice: parseFloat(product.base_price || 0),
    components: componentsResult.rows.map(c => ({
      name: c.material_name,
      costPerUnit: parseFloat(c.cost_per_unit),
      quantity: parseFloat(c.quantity_needed),
      waste: parseFloat(c.waste_percentage),
      total: Math.round(parseFloat(c.total_cost) * 100) / 100
    }))
  };
}

/**
 * Find the matching product key in PRICING_TIERS
 */
function findTierKey(productName) {
  const nameLower = productName.toLowerCase();
  for (const key of Object.keys(PRICING_TIERS)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return key;
    }
  }
  return null;
}

/**
 * Main pricing calculation function
 * Handles below-MOQ, standard, and high-volume scenarios
 */
export async function calculateCustomPrice({ productName, quantity }) {
  if (!productName || !quantity || quantity < 1) {
    return { error: 'Se requiere nombre de producto y cantidad válida' };
  }

  // 1. Get BOM cost
  const bom = await getBomCost(productName);

  // 2. Get config
  const [setupConfig, marginConfig, floorConfig, belowMoqConfig] = await Promise.all([
    getConfig('setup_cost_per_run'),
    getConfig('target_margins'),
    getConfig('floor_prices'),
    getConfig('below_moq_enabled')
  ]);

  // 3. Determine product key and MOQ
  const tierKey = findTierKey(productName);
  const moq = MOQ[tierKey] || MOQ.default;

  // 4. Get tier price for comparison
  const tierResult = calculateTieredPrice(productName, Math.max(quantity, moq), bom.basePrice);
  const tierPrice = tierResult.unitPrice || bom.basePrice;

  // 5. Determine scenario
  let scenario;
  if (quantity < moq) {
    scenario = 'below_moq';
  } else if (quantity >= 1000) {
    scenario = 'high_volume';
  } else {
    scenario = 'standard';
  }

  // 6. For standard orders, just return tier pricing
  if (scenario === 'standard') {
    const standardResult = calculateTieredPrice(productName, quantity, bom.basePrice);
    const unitPrice = standardResult.unitPrice || bom.basePrice;
    const margin = bom.totalCost > 0 ? ((unitPrice - bom.totalCost) / unitPrice * 100) : 0;

    return {
      productName: bom.productName || productName,
      quantity,
      bomCost: bom.totalCost,
      setupCostPerPiece: 0,
      totalCostPerPiece: bom.totalCost,
      suggestedPrice: unitPrice,
      floorPrice: null,
      finalPrice: unitPrice,
      margin: Math.round(margin * 10) / 10,
      tierPrice: unitPrice,
      tierInfo: standardResult.tierInfo,
      scenario,
      orderTotal: Math.round(unitPrice * quantity * 100) / 100,
      breakdown: [
        `Producto: ${bom.productName || productName}`,
        `Cantidad: ${quantity} pzas (dentro de MOQ: ${moq})`,
        `Precio por volumen: $${unitPrice.toFixed(2)}/pza (${standardResult.tierInfo})`,
        bom.totalCost > 0 ? `Costo de producción: $${bom.totalCost.toFixed(2)}/pza` : 'Costo BOM: no registrado',
        bom.totalCost > 0 ? `Margen: ${Math.round(margin * 10) / 10}%` : '',
        `Total pedido: $${(unitPrice * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
      ].filter(Boolean)
    };
  }

  // 7. Below-MOQ or high-volume: use cost-based pricing
  if (!belowMoqConfig?.enabled && scenario === 'below_moq') {
    return {
      error: `Pedidos por debajo del mínimo (${moq} pzas) no están habilitados actualmente`,
      moq,
      scenario
    };
  }

  // Setup cost (only for below-MOQ)
  const setupCostTotal = scenario === 'below_moq'
    ? (setupConfig?.by_product?.[tierKey] || setupConfig?.default || 150)
    : 0;
  const setupCostPerPiece = setupCostTotal > 0 ? Math.round(setupCostTotal / quantity * 100) / 100 : 0;

  // Target margin
  const targetMargin = marginConfig?.[scenario] || marginConfig?.default || 60;

  // Total cost per piece
  const totalCostPerPiece = Math.round((bom.totalCost + setupCostPerPiece) * 100) / 100;

  // Suggested price based on target margin: cost / (1 - margin/100)
  const suggestedPrice = totalCostPerPiece > 0
    ? Math.round(totalCostPerPiece / (1 - targetMargin / 100) * 100) / 100
    : tierPrice;

  // Floor price
  const floorPrice = floorConfig?.[tierKey] || 0;

  // Final price = max(suggested, floor)
  const finalPrice = Math.max(suggestedPrice, floorPrice);

  // Actual margin at final price
  const actualMargin = finalPrice > 0 && totalCostPerPiece > 0
    ? Math.round((finalPrice - totalCostPerPiece) / finalPrice * 1000) / 10
    : 0;

  const orderTotal = Math.round(finalPrice * quantity * 100) / 100;

  // Build breakdown
  const breakdown = [
    `Producto: ${bom.productName || productName}`,
    `Cantidad: ${quantity} pzas ${scenario === 'below_moq' ? `(por debajo del mínimo: ${moq})` : `(volumen alto)`}`,
  ];

  if (bom.totalCost > 0) {
    if (bom.materialCost > 0) breakdown.push(`Costo material: $${bom.materialCost.toFixed(2)}/pza`);
    if (bom.laborCost > 0) breakdown.push(`Costo mano de obra: $${bom.laborCost.toFixed(2)}/pza`);
  } else {
    breakdown.push('⚠️ Costo BOM no registrado — usando solo setup cost');
  }

  if (setupCostPerPiece > 0) {
    breakdown.push(`Costo setup ($${setupCostTotal} ÷ ${quantity} pzas): $${setupCostPerPiece.toFixed(2)}/pza`);
  }

  breakdown.push(`Costo total: $${totalCostPerPiece.toFixed(2)}/pza`);
  breakdown.push(`Margen objetivo: ${targetMargin}%`);
  breakdown.push(`Precio sugerido: $${suggestedPrice.toFixed(2)}/pza`);

  if (floorPrice > 0) {
    breakdown.push(`Precio piso: $${floorPrice.toFixed(2)}/pza`);
  }

  if (finalPrice !== suggestedPrice) {
    breakdown.push(`Precio final (ajustado a piso): $${finalPrice.toFixed(2)}/pza`);
  } else {
    breakdown.push(`Precio final: $${finalPrice.toFixed(2)}/pza`);
  }

  breakdown.push(`Margen real: ${actualMargin}%`);
  breakdown.push(`Total pedido: $${orderTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

  // Add comparison with standard pricing
  if (scenario === 'below_moq') {
    breakdown.push(`---`);
    breakdown.push(`Comparación: precio estándar (${moq}+ pzas) sería $${tierPrice.toFixed(2)}/pza`);
    const moqTotal = tierPrice * moq;
    breakdown.push(`Alternativa: ${moq} pzas a $${tierPrice.toFixed(2)} = $${moqTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
  } else if (scenario === 'high_volume') {
    breakdown.push(`---`);
    breakdown.push(`Comparación: precio estándar de lista sería $${tierPrice.toFixed(2)}/pza`);
    breakdown.push(`Ahorro vs lista: $${((tierPrice - finalPrice) * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
  }

  return {
    productName: bom.productName || productName,
    quantity,
    bomCost: bom.totalCost,
    materialCost: bom.materialCost,
    laborCost: bom.laborCost,
    setupCostTotal,
    setupCostPerPiece,
    totalCostPerPiece,
    suggestedPrice,
    floorPrice,
    finalPrice,
    margin: actualMargin,
    tierPrice,
    scenario,
    moq,
    orderTotal,
    breakdown,
    components: bom.components
  };
}
```

**Step 2: Verify syntax**

```bash
node -e "import('./backend/services/pricing-engine.js').then(m => { console.log('Exports:', Object.keys(m)); process.exit(0); })"
```

Expected: `Exports: [ 'getAllConfig', 'calculateCustomPrice' ]`

**Step 3: Commit**

```bash
git add backend/services/pricing-engine.js
git commit -m "feat: add pricing engine service with cost-based calculations"
```

---

### Task 3: Add API endpoints to quote-routes.js

**Files:**
- Modify: `backend/api/quote-routes.js:354` (before `export default router`)

**Step 1: Add import at top of quote-routes.js**

At the imports section (near line 7), add:

```javascript
import { calculateCustomPrice, getAllConfig } from '../services/pricing-engine.js';
```

**Step 2: Add two new routes before `export default router` (line 356)**

Insert before the `export default router;` line:

```javascript
// Calculate custom price (below-MOQ, standard, high-volume)
router.post('/calculate-price', async (req, res) => {
  try {
    const { productName, quantity } = req.body;

    if (!productName || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere productName y quantity'
      });
    }

    const result = await calculateCustomPrice({
      productName,
      quantity: parseInt(quantity)
    });

    if (result.error) {
      return res.json({ success: false, error: result.error, ...result });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ success: false, error: 'Error al calcular precio' });
  }
});

// Get pricing configuration
router.get('/pricing-config', async (req, res) => {
  try {
    const config = await getAllConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching pricing config:', error);
    res.status(500).json({ success: false, error: 'Error al obtener configuración' });
  }
});
```

**Step 3: Verify server starts**

```bash
cd /Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan_brain_system && timeout 5 node backend/api/server.js || true
```

Expected: Server starts without import errors.

**Step 4: Commit**

```bash
git add backend/api/quote-routes.js
git commit -m "feat: add /calculate-price and /pricing-config API endpoints"
```

---

### Task 4: Update AI assistant backend — system prompt + action handler

**Files:**
- Modify: `backend/api/ai-assistant-routes.js`

This is the most involved task. Two changes:

**Step 1: Add import at top of ai-assistant-routes.js**

Add near the other imports:

```javascript
import { calculateCustomPrice } from '../services/pricing-engine.js';
```

**Step 2: Add `calculate_price` action instructions to system prompt**

In `buildSystemPrompt()` (starts at line 455), find the quote generation instructions section (around line 719 where the `generate_quote` action block is documented). Add the following **before** the `generate_quote` section (before the line that starts with `**Ejemplos de solicitudes de cotización:**`):

```
## CALCULADORA DE PRECIOS INTELIGENTE

Cuando el usuario pregunte sobre precios para cantidades FUERA de lo estándar (por debajo del mínimo, o volúmenes muy altos como 5000+ piezas), o cuando pida que CALCULES un precio justo/competitivo, usa la acción calculate_price.

**Detectar solicitudes de cálculo de precio:**
- "Cuánto debería cobrar por 30 imanes?" → calculate_price
- "Precio justo para 30 piezas" → calculate_price
- "Si alguien quiere 5000 imanes, a cuánto?" → calculate_price
- "Cuánto es lo mínimo que puedo cobrar por 20 llaveros?" → calculate_price
- "Dame un precio para un pedido especial de 15 destapadores" → calculate_price
- "A qué precio puedo vender 10,000 imanes?" → calculate_price

**REGLA:** Si la cantidad es menor al MOQ o mayor a 1000 piezas, SIEMPRE usa calculate_price en vez de generate_quote. Para cantidades estándar (50-999), puedes usar generate_quote normalmente.

**Para calcular precio, incluye este bloque:**

\`\`\`action
{
  "type": "calculate_price",
  "productName": "nombre del producto (ej: imanes de mdf, llaveros de mdf)",
  "quantity": 30
}
\`\`\`

Después de recibir el resultado del cálculo, explica el desglose de forma conversacional:
- Muestra cada paso del cálculo
- Compara con el precio estándar
- Si es por debajo del mínimo, sugiere la alternativa de completar al MOQ
- Si es volumen alto, destaca el ahorro vs precio de lista
- Sé transparente con los números — muestra costos, márgenes, y lógica
```

**Step 3: Add action handler for `calculate_price`**

In the action processing section (around line 954 where `if (action.type === 'create_shipping_labels')` starts), add a new `else if` block. Find the `} else if (action.type === 'generate_quote')` block (line 1051) and add **before** it:

```javascript
      } else if (action.type === 'calculate_price') {
        try {
          const result = await calculateCustomPrice({
            productName: action.productName,
            quantity: parseInt(action.quantity)
          });

          actionData = {
            type: 'calculate_price',
            data: result
          };

          if (result.error) {
            console.log(`⚠️ Price calculation issue: ${result.error}`);
          } else {
            console.log(`🧮 Price calculated: ${result.productName} x${result.quantity} = $${result.finalPrice}/pza (${result.scenario})`);
          }
        } catch (calcError) {
          console.error('Error calculating price:', calcError);
          actionData = {
            type: 'calculate_price',
            data: {
              error: 'Error al calcular precio: ' + (calcError.message || 'Error interno')
            }
          };
        }
```

**Step 4: Commit**

```bash
git add backend/api/ai-assistant-routes.js
git commit -m "feat: add calculate_price action to AI assistant with pricing engine"
```

---

### Task 5: Update AI assistant frontend — display pricing results

**Files:**
- Modify: `frontend/admin-dashboard/ai-assistant.js`

**Step 1: Add `calculate_price` to `handleAiAction()` switch**

In `handleAiAction()` (line 526 area), after the `generate_quote` handler (`} else if (action.type === 'generate_quote') {`), add:

```javascript
    } else if (action.type === 'calculate_price') {
        showPriceCalculation(action.data);
```

**Step 2: Add `showPriceCalculation()` function**

Add after the `showQuoteResult()` function (after line ~643):

```javascript
function showPriceCalculation(data) {
    if (!data) return;

    let html = '';

    if (data.error) {
        html = `
            <div class="ai-quote-result" style="border-left: 3px solid #f39223;">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">⚠️</span>
                    <div>
                        <div class="ai-quote-title">Cálculo de Precio</div>
                        <div class="ai-quote-number">${escapeHtml(data.error)}</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        const scenarioLabels = {
            'below_moq': '📦 Pedido Especial (bajo mínimo)',
            'standard': '📊 Precio Estándar',
            'high_volume': '🏭 Volumen Alto'
        };

        const scenarioColors = {
            'below_moq': '#f39223',
            'standard': '#8ab73b',
            'high_volume': '#09adc2'
        };

        const color = scenarioColors[data.scenario] || '#8ab73b';

        html = `
            <div class="ai-quote-result" style="border-left: 3px solid ${color};">
                <div class="ai-quote-header">
                    <span class="ai-quote-icon">🧮</span>
                    <div>
                        <div class="ai-quote-title">${scenarioLabels[data.scenario] || 'Cálculo de Precio'}</div>
                        <div class="ai-quote-number">${escapeHtml(data.productName)} — ${data.quantity.toLocaleString('es-MX')} pzas</div>
                    </div>
                </div>

                <div class="ai-quote-details">
                    <div class="ai-quote-items" style="font-family: monospace; font-size: 0.85em;">
                        ${(data.breakdown || []).map(line => {
                            if (line === '---') {
                                return '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;">';
                            }
                            const isHighlight = line.includes('Precio final') || line.includes('Total pedido');
                            return `<div style="${isHighlight ? 'font-weight: bold; color: ' + color + ';' : ''} padding: 2px 0;">${escapeHtml(line)}</div>`;
                        }).join('')}
                    </div>

                    <div class="ai-quote-total">
                        <span>PRECIO/PZA:</span>
                        <span class="ai-quote-total-amount" style="color: ${color};">$${data.finalPrice?.toFixed(2) || '0.00'}</span>
                    </div>

                    <div class="ai-quote-total" style="font-size: 0.9em; opacity: 0.8;">
                        <span>TOTAL PEDIDO:</span>
                        <span>$${data.orderTotal?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}</span>
                    </div>

                    ${data.margin ? `
                        <div style="text-align: center; margin-top: 8px; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; font-size: 0.85em;">
                            Margen: ${data.margin}% · Costo: $${data.totalCostPerPiece?.toFixed(2)}/pza
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Append to last assistant message
    const messages = document.querySelectorAll('.ai-chat-message.assistant');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const contentDiv = lastMessage.querySelector('.ai-chat-message-content');
        if (contentDiv) {
            contentDiv.insertAdjacentHTML('beforeend', html);
        }
    }
}
```

**Step 3: Commit**

```bash
git add frontend/admin-dashboard/ai-assistant.js
git commit -m "feat: add pricing calculation display to AI assistant frontend"
```

---

### Task 6: End-to-end test

**Files:** None (manual verification)

**Step 1: Start the server**

```bash
npm run dev
```

**Step 2: Test API endpoint directly**

```bash
# Below MOQ
curl -X POST http://localhost:3000/api/quotes/calculate-price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"productName": "imanes de mdf", "quantity": 30}'

# Standard
curl -X POST http://localhost:3000/api/quotes/calculate-price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"productName": "imanes de mdf", "quantity": 100}'

# High volume
curl -X POST http://localhost:3000/api/quotes/calculate-price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"productName": "imanes de mdf", "quantity": 5000}'

# Config endpoint
curl http://localhost:3000/api/quotes/pricing-config \
  -H "Authorization: Bearer <your-token>"
```

Expected:
- 30 imanes: `scenario: "below_moq"`, price around $14/pc with breakdown
- 100 imanes: `scenario: "standard"`, price $11/pc
- 5000 imanes: `scenario: "high_volume"`, price at or near floor $5/pc

**Step 3: Test via AI chat**

Open admin dashboard, open AI chat, type: "Si alguien quiere 30 imanes cuánto debería cobrar?"

Expected: AI returns a structured breakdown with real BOM costs, setup cost, and suggested price. The pricing card should appear below the message.

**Step 4: Test edge cases**

- "Precio para 10000 llaveros" → high volume calculation
- "Cuánto cuesta hacer 5 destapadores?" → below MOQ
- "Cotiza 200 imanes" → should still use regular quote (standard scenario)

**Step 5: Commit any fixes if needed**

```bash
git add -A && git commit -m "fix: pricing engine adjustments from e2e testing"
```
