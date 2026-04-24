# Automatic Cost Calculation System

## Overview

This system automatically calculates product costs, material costs, labor costs, profit margins, and other financial metrics based on your Bill of Materials (BOM) configuration. All calculations happen in real-time using database triggers.

## 🚀 Features

### Automatic Calculations
- ✅ **Material Costs**: Automatically calculated from BOM components
- ✅ **Production Costs**: Sum of material costs + labor costs
- ✅ **Profit & Margins**: Auto-calculated based on base price and production cost
- ✅ **Real-time Updates**: Costs update immediately when:
  - BOM components are added, changed, or removed
  - Material prices are updated
  - Labor costs are modified

### Database Triggers

The system uses PostgreSQL triggers to ensure data accuracy:

1. **Component Change Trigger** (`trg_component_change_update_cost`)
   - Fires when product_components table changes
   - Recalculates costs for affected product

2. **Material Price Change Trigger** (`trg_material_cost_change_update_products`)
   - Fires when raw_materials.cost_per_unit changes
   - Updates ALL products using that material

3. **Labor Cost Change Trigger** (`trg_labor_cost_change_update_product`)
   - Fires when products.labor_cost changes
   - Recalculates total production cost

## 📦 Installation

### 1. Run the Migration

```bash
cd backend
node shared/run-cost-automation.js
```

This will create:
- Database functions for cost calculations
- Automatic triggers
- Enhanced views (cost_analysis, product_bom_costs)

### 2. Verify Installation

Check that triggers were created:

```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgname LIKE '%cost%'
  AND tgrelid::regclass::text IN ('product_components', 'raw_materials', 'products');
```

## 📝 How It Works

### Cost Calculation Flow

```
1. BOM Component Added/Changed
   ↓
2. Trigger: trg_component_change_update_cost
   ↓
3. Function: calculate_product_cost_from_bom()
   ↓
4. Function: update_product_costs()
   ↓
5. products.material_cost & production_cost updated
   ↓
6. products.profit & profit_margin auto-calculated (GENERATED columns)
```

### Example Scenario

**Product: Custom Magnet Souvenir**

1. **Add BOM Components:**
   ```sql
   -- MDF Base: 64cm² @ $0.05/cm² + 5% waste
   INSERT INTO product_components (product_id, raw_material_id, quantity_needed, waste_percentage)
   VALUES (1, 1, 64, 5.0);

   -- Magnet: 1 piece @ $0.15/piece + 2% waste
   INSERT INTO product_components (product_id, raw_material_id, quantity_needed, waste_percentage)
   VALUES (1, 2, 1, 2.0);

   -- Bag: 1 piece @ $0.08/piece + 0% waste
   INSERT INTO product_components (product_id, raw_material_id, quantity_needed, waste_percentage)
   VALUES (1, 3, 1, 0.0);
   ```

2. **Automatic Calculation:**
   ```
   Material Costs:
   - MDF: 64 × $0.05 × 1.05 = $3.36
   - Magnet: 1 × $0.15 × 1.02 = $0.15
   - Bag: 1 × $0.08 × 1.00 = $0.08

   Total Material Cost = $3.59
   Labor Cost = $1.00 (set manually)
   Production Cost = $4.59

   Base Price = $8.00 (set manually)
   Profit = $8.00 - $4.59 = $3.41
   Margin = ($3.41 / $8.00) × 100 = 42.6%
   ```

3. **What Gets Updated Automatically:**
   ```sql
   UPDATE products
   SET
     material_cost = 3.59,      -- ✅ Auto-calculated
     production_cost = 4.59,    -- ✅ Auto-calculated
     profit = 3.41,             -- ✅ Auto-calculated (GENERATED column)
     profit_margin = 42.6       -- ✅ Auto-calculated (GENERATED column)
   WHERE id = 1;
   ```

### When Material Price Changes

If the price of MDF changes from $0.05/cm² to $0.06/cm²:

```sql
UPDATE raw_materials
SET cost_per_unit = 0.06
WHERE id = 1;  -- MDF material
```

**Automatic Updates:**
- Trigger detects the price change
- Finds ALL products using MDF
- Recalculates costs for each product
- Updates production_cost, profit, and margins automatically

## 🎨 Frontend Integration

The admin dashboard (`frontend/admin-dashboard/prices.js`) already displays these metrics:

### Prices & Margins View

Shows in real-time:
- **Total Products** with calculated margins
- **Average Profit Margin** across all products
- **Margin Alerts** for products with low margins (<20%)
- **Product Table** with:
  - Current price
  - Production cost (auto-calculated)
  - Profit margin (auto-calculated)
  - Color-coded margins (red <10%, yellow 10-20%, green ≥20%)

### Product Detail Modal

When you click a product, you see:
- **Cost Breakdown**: Materials vs Labor
- **BOM Components**: Each material with costs
- **Component Cost with Waste**: Shows waste impact
- **Historical Pricing**: Track changes over time

## 📊 Database Views

### cost_analysis

Comprehensive view with all financial metrics:

```sql
SELECT * FROM cost_analysis
WHERE product_name = 'Custom Magnet Souvenir';
```

Returns:
- Current price & cost
- Material cost breakdown
- Labor cost
- Profit per unit
- Margin percentage
- Component count
- Sales data (last 30 days)
- Historical averages

### product_bom_costs

Detailed BOM cost breakdown:

```sql
SELECT * FROM product_bom_costs
WHERE product_name = 'Custom Magnet Souvenir';
```

Returns for each component:
- Material name & SKU
- Quantity needed
- Waste percentage
- Base cost (quantity × cost_per_unit)
- Waste cost
- Total component cost

## 🔧 Manual Operations

### Recalculate a Single Product

```sql
SELECT update_product_costs(1);  -- Product ID = 1
```

### Recalculate All Products

```sql
DO $$
DECLARE
  product RECORD;
BEGIN
  FOR product IN SELECT id FROM products WHERE is_active = true
  LOOP
    PERFORM update_product_costs(product.id);
  END LOOP;
END $$;
```

### Check Cost Accuracy

Compare BOM-calculated cost vs stored cost:

```sql
SELECT
  p.id,
  p.name,
  p.production_cost AS stored_cost,
  calc.total_cost AS calculated_cost,
  (p.production_cost - calc.total_cost) AS variance
FROM products p
CROSS JOIN LATERAL calculate_product_cost_from_bom(p.id) calc
WHERE ABS(p.production_cost - calc.total_cost) > 0.01;
```

## ⚙️ Configuration

### Setting Labor Costs

Labor costs are set manually per product:

```sql
UPDATE products
SET labor_cost = 1.50
WHERE id = 1;
```

This will trigger automatic recalculation of production_cost.

### Setting Base Prices

Base prices are set manually:

```sql
UPDATE products
SET base_price = 10.00
WHERE id = 1;
```

Profit and margin will auto-recalculate from GENERATED columns.

## 🎯 Best Practices

### 1. Define BOM Components First

Before relying on auto-calculations:
1. Add all raw materials to `raw_materials` table
2. Set accurate `cost_per_unit` for each material
3. Define components in `product_components` for each product
4. Set realistic `waste_percentage` (1-5% for pieces, 5-10% for sheets)

### 2. Update Material Prices Regularly

When you receive new invoices:
```sql
UPDATE raw_materials
SET cost_per_unit = 0.065,
    updated_at = CURRENT_TIMESTAMP
WHERE sku = 'MDF-3MM-SHEET';
```

All products using this material will auto-update.

### 3. Review Margins Regularly

Check the Prices & Margins dashboard weekly:
- Look for red/yellow margin alerts
- Adjust prices for low-margin products
- Optimize component quantities to reduce waste

### 4. Track Price History

The system automatically tracks all price changes in `product_price_history`:

```sql
SELECT * FROM product_price_history
WHERE product_id = 1
ORDER BY effective_date DESC
LIMIT 10;
```

## 🐛 Troubleshooting

### Costs Not Updating?

**Check if triggers are enabled:**
```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid::regclass::text = 'product_components';
```

**Manually trigger update:**
```sql
SELECT update_product_costs(YOUR_PRODUCT_ID);
```

### Costs Don't Match BOM?

**Check for missing labor cost:**
```sql
SELECT id, name, labor_cost, material_cost, production_cost
FROM products
WHERE labor_cost IS NULL;
```

**Verify component data:**
```sql
SELECT * FROM product_bom_costs
WHERE product_id = YOUR_PRODUCT_ID;
```

### Performance Issues?

**Check index usage:**
```sql
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename IN ('product_components', 'raw_materials', 'products');
```

## 📈 Monitoring

### Daily Health Check

```sql
-- Products with negative margins
SELECT name, base_price, production_cost, profit_margin
FROM products
WHERE profit_margin < 0 AND is_active = true;

-- Products without BOM components
SELECT p.id, p.name
FROM products p
LEFT JOIN product_components pc ON p.id = pc.product_id
WHERE pc.id IS NULL AND p.is_active = true;

-- Material costs updated in last 7 days
SELECT name, cost_per_unit, updated_at
FROM raw_materials
WHERE updated_at >= CURRENT_DATE - INTERVAL '7 days';
```

## 🎉 Benefits

1. **Accuracy**: No manual calculation errors
2. **Real-time**: Costs update immediately
3. **Transparency**: Full BOM visibility
4. **Scalability**: Works for 10 or 10,000 products
5. **Audit Trail**: All changes tracked in history
6. **Performance**: Database-level calculations are fast

## 📚 Related Documentation

- [Bill of Materials System](./BOM-SYSTEM.md) - How to set up BOM components
- [API Reference](./API_REFERENCE.md) - API endpoints for pricing
- [Setup Guide](./SETUP_GUIDE.md) - Initial system setup

---

**Questions?** Check the main `CLAUDE.md` file or review the database schema in `backend/shared/init-database.js`.
