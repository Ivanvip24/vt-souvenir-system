# Pricing Engine

> Tiered pricing, MOQ rules, and cost calculations.

## What it does

1. Tiered pricing based on quantity (higher quantity = lower price per piece)
2. Minimum order quantities (MOQ) per product type
3. BOM-based cost calculation
4. Cost sheet management via Excel + API

## Key files

| File | Purpose |
|------|---------|
| `backend/services/pricing-engine.js` | Tiered pricing logic |
| `backend/api/price-routes.js` | Pricing config endpoints |
| `products/costs.xlsx` | Master cost spreadsheet |
| `products/build-costs-xlsx.js` | Excel builder |

## Current state

### What works
1. Tiered pricing with configurable breakpoints
2. Cost-based margin calculations
3. Excel cost sheet readable by backend (SheetJS)
4. Admin pricing tab in dashboard

### What still fails or needs work
1. Pricing tiers hardcoded in some places, configurable in others
2. No automatic price sync to WhatsApp bot catalog
3. Discount interaction with tiered pricing not fully tested

### Future plans
1. Dynamic pricing based on material cost changes
2. Volume discount automation
3. Price comparison with marketplace listings
