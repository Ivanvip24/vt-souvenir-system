# Inventory

> BOM tracking, material costs, and demand forecasting.

## What it does

1. Tracks raw materials (PVC, imanes, resina, etc.) and their costs
2. Bill of Materials (BOM) for each product type
3. Demand forecasting based on order history
4. Reorder alerts when stock is low
5. Cost sheet (Excel) with 14 SKUs and 15 materials

## Key files

| File | Purpose |
|------|---------|
| `backend/agents/inventory/bom-manager.js` | BOM operations |
| `backend/agents/inventory/material-manager.js` | Material tracking |
| `backend/agents/inventory/forecasting-engine.js` | Demand forecasting |
| `backend/api/inventory-routes.js` | Inventory endpoints |
| `backend/api/bom-routes.js` | BOM endpoints |
| `products/costs.xlsx` | Master cost spreadsheet |
| `products/build-costs-xlsx.js` | Excel builder (ExcelJS) |

## Current state

### What works
1. BOM structure defined for all product types
2. Material cost tracking
3. Cost sheet Excel with 3 sheets (Config, Products, Materials)
4. Admin "Hoja de Costos" tab under Finanzas
5. Baseline: $4.12/pza, capacity 48k/month at 2400 pzas/dia

### What still fails or needs work
1. Inventory levels not actively maintained — no one updates stock counts
2. Forecasting engine built but not tested against real data
3. No automatic reorder flow
4. 4.5mm pricing cost still needs confirmation

### Future plans
1. Automatic stock deduction when orders ship
2. Supplier order generation when stock is low
3. Integration with production tracking
