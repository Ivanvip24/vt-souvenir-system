# Order Form Multi-Variant Redesign

**Date**: 2026-03-18
**Status**: Approved
**Effort**: High

## Problem

When clients want to order multiple sizes of the same product (e.g., 200 imanes medianos + 100 imanes chicos), the cart only keeps one size because all magnet sizes share the same product ID. The system needs to support any product having variants as the catalog grows.

## Solution

### 1. Product Card Redesign

Each product card shows ALL its variants as separate quantity rows. Products without variants show a single row.

```
┌─────────────────────────────────────────┐
│ [IMG]  Imanes de MDF                    │
│                                         │
│  Chico    $8 c/u     [−] [ 0  ] [+]    │
│  Mediano  $11 c/u    [−] [200 ] [+]    │
│  Grande   $15 c/u    [−] [100 ] [+]    │
│                                         │
│  1000+ pzas: Chico $6, Med $8...        │
│  Subtotal          $3,700               │
└─────────────────────────────────────────┘
```

- Display MOQ: 100 pzas (system accepts 50 internally)
- Prices update automatically when qty hits 1000+ tier
- Subtotal only shows when at least one variant has qty > 0

### 2. Category Tabs

Top of products step:

```
🔍 [Buscar producto...]
[Todos] [Imanes] [Llaveros] [Destapadores] [Especiales]
```

- "Todos" default, shows everything
- Categories from product `category` field in DB (dynamic)
- Search filters across all categories
- Mobile: horizontal scroll on tabs
- Active tab gets rosa mexicano underline

### 3. Sticky Bottom Cart Bar

Always visible when cart has items:

```
┌─────────────────────────────────────────────────┐
│  🛒 4 productos  •  650 pzas       $6,350 MXN  │
│                                    [Continuar →]│
└─────────────────────────────────────────────────┘
```

Tap to expand drawer with full breakdown:

```
┌─────────────────────────────────────────────────┐
│  Tu Pedido                              [✕]     │
│─────────────────────────────────────────────────│
│  Imanes MDF Chico      100 pzas    $800         │
│  Imanes MDF Mediano    200 pzas    $2,200       │
│  Imanes MDF Grande     100 pzas    $1,500       │
│  Llaveros MDF          250 pzas    $2,500       │
│─────────────────────────────────────────────────│
│  Subtotal                          $7,000       │
│  Envío (650+ pzas)                 GRATIS       │
│─────────────────────────────────────────────────│
│  Total                             $7,000       │
└─────────────────────────────────────────────────┘
```

- Hidden when cart empty, slides in on first item added
- Free shipping badge at 300+ total pieces
- Mobile: full width bar, drawer 70% max height

### 4. Data Architecture

Cart keyed by `productId + variantKey`:

```javascript
state.cart = {
  "product-1__imanes_m": { product, quantity: 200, variantKey: "imanes_m", variantLabel: "Mediano", unitPrice: 11 },
  "product-1__imanes_ch": { product, quantity: 100, variantKey: "imanes_ch", variantLabel: "Chico", unitPrice: 8 },
  "product-2": { product, quantity: 250, variantKey: null, variantLabel: null, unitPrice: 10 }
}
```

Order submission format unchanged — backend already accepts multiple items with same productId:

```javascript
items: [
  { productId: 1, productName: "Imanes de MDF (Mediano)", quantity: 200, unitPrice: 11 },
  { productId: 1, productName: "Imanes de MDF (Chico)", quantity: 100, unitPrice: 8 },
  { productId: 2, productName: "Llaveros de MDF", quantity: 250, unitPrice: 10 }
]
```

## Scope

**Changes**:
- `frontend/client-order-form-v2/order-form.js` — card rendering, cart state, quantity handlers, category tabs, sticky bar
- `frontend/client-order-form-v2/index.html` — sticky bar container, category tabs, cart drawer markup

**No changes**:
- Backend API
- `backend/shared/pricing.js`
- Database schema
- Payment flow
- Quote generator

**Removed**:
- `state.magnetSizes` object
- `selectMagnetSize()` function
- Ch/M/G toggle buttons

## Edge Cases

- qty 0 for all variants → item removed from cart
- qty below 100 (display MOQ) → red warning on that row only
- Volume discount: each variant priced independently
- Promo codes: custom prices override per-variant by `pricingKey`
