# Pricing Engine — AI Assistant Enhancement

**Date:** 2026-02-26
**Status:** Approved
**Approach:** Pricing Engine API (Approach 1)

## Problem

The AI assistant cannot calculate prices for:
- Orders below MOQ (e.g., 30 imanes when minimum is 50)
- High-volume orders where aggressive discounts are viable
- Any scenario requiring real cost data (BOM, setup costs, margins)

It currently guesses, producing inaccurate numbers with no math backing.

## Solution

Build a backend pricing engine that uses real BOM data, configurable setup costs, target margins, and floor prices to calculate accurate per-piece pricing for any quantity. The AI assistant calls this engine and presents the results conversationally.

## Design

### 1. Database: `pricing_config` table

```sql
CREATE TABLE pricing_config (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
);
```

Seed data:

| config_key | config_value | description |
|---|---|---|
| `setup_cost_per_run` | `{ "default": 150, "by_product": { "portallaves de mdf": 200 } }` | Fixed cost per production run, divided by quantity |
| `target_margins` | `{ "default": 70, "below_moq": 60, "high_volume": 50 }` | Target margin % for different scenarios |
| `floor_prices` | `{ "imanes de mdf": 5.00, "llaveros de mdf": 4.50, "destapador de mdf": 10.00, "imán 3d mdf 3mm": 7.00, "imán de mdf con foil": 7.00, "botones metálicos": 3.00, "portallaves de mdf": 20.00, "portarretratos de mdf": 20.00 }` | Absolute minimum price per piece |
| `below_moq_enabled` | `{ "enabled": true }` | Global toggle for accepting below-MOQ orders |

### 2. Pricing Engine Service: `pricing-engine.js`

Location: `/backend/services/pricing-engine.js`

Main function signature:

```
calculateCustomPrice({ productName, quantity })
```

Returns:
```javascript
{
  bomCost,           // per-piece material + labor from BOM
  setupCostPerPiece, // setup_cost_per_run ÷ quantity
  totalCostPerPiece, // bomCost + setupCostPerPiece
  suggestedPrice,    // totalCostPerPiece ÷ (1 - targetMargin/100)
  floorPrice,        // absolute minimum from pricing_config
  finalPrice,        // max(suggestedPrice, floorPrice)
  margin,            // actual margin % at finalPrice
  tierPrice,         // normal tier price for comparison
  scenario,          // "below_moq" | "standard" | "high_volume"
  breakdown          // array of human-readable math steps
}
```

Logic:
1. Look up BOM cost from `product_components` + `raw_materials`
2. Look up setup cost, target margin, floor price from `pricing_config`
3. If quantity < MOQ → use `below_moq` margin, add setup cost spread across pieces
4. If quantity >= 1000 → use `high_volume` margin, no setup cost
5. Otherwise → use standard tier pricing (existing behavior)
6. Clamp final price to floor price minimum
7. Build breakdown array with each calculation step

The `breakdown` array enables the AI to explain the math:
```
[
  "Costo material: $0.45/pza",
  "Costo mano de obra: $0.18/pza",
  "Costo setup ($150 ÷ 30 pzas): $5.00/pza",
  "Costo total: $5.63/pza",
  "Margen objetivo: 60%",
  "Precio sugerido: $14.08/pza",
  "Precio piso: $5.00/pza",
  "Precio final: $14.08/pza",
  "Total pedido: $422.40"
]
```

### 3. API Endpoint

Add to `quote-routes.js`:

```
POST /api/quotes/calculate-price
Body: { productName, quantity }
Returns: full pricing engine result

GET /api/quotes/pricing-config
Returns: current pricing_config values (for AI context)
```

Same auth middleware as existing quote routes.

### 4. AI Assistant Integration

Update `ai-assistant.js`:

- New action type: `calculate_price`
- Trigger: user asks about pricing for any quantity
- Flow: AI calls `/api/quotes/calculate-price`, receives structured result, presents breakdown conversationally
- AI can also suggest alternatives (e.g., "bumping to 50 pieces drops the price from $14 to $11 because setup cost spreads further")
- AI reads `/api/quotes/pricing-config` for general pricing questions

### 5. Scope — What Changes

| Component | Changes? |
|---|---|
| Existing tier pricing (`calculateTieredPrice`) | No |
| Quote PDF generation | No |
| Order validation (`validateOrderPricing`) | No |
| AI assistant (`ai-assistant.js`) | Yes — new action + updated prompt |
| `quote-routes.js` | Yes — 2 new endpoints |
| `pricing.js` | No |
| New: `pricing-engine.js` | Yes — new service |
| New: migration SQL | Yes — `pricing_config` table |

### 6. Pricing Scenarios

**Below MOQ (30 imanes):**
- BOM cost: ~$0.63/pc
- Setup: $150 ÷ 30 = $5.00/pc
- Total cost: $5.63/pc
- At 60% margin: $14.08/pc
- Floor price: $5.00 → final: $14.08/pc
- Order total: $422.40

**Standard (100 imanes):**
- Uses existing tier: $11.00/pc (no change)

**High volume (5,000 imanes):**
- BOM cost: ~$0.63/pc
- No setup cost at volume
- At 50% margin: $1.26/pc
- Floor price: $5.00 → final: $5.00/pc
- Order total: $25,000
- Comparison: tier price would be $8.00/pc = $40,000
