# Inventory-to-BOM Cost Sync Integration

## Overview

Your inventory purchase system now automatically updates your Bill of Materials (BOM) pricing system. When you record a material purchase, the cost automatically flows through to update product prices.

## How It Works

```
Purchase Flow:
1. Record purchase in inventory → /api/inventory/materials/:id/purchase
2. Trigger automatically converts unit cost using conversion factor
3. BOM raw_materials cost updates immediately
4. Products using that material recalculate costs automatically
5. Frontend displays updated prices in real-time
```

## Material Linking Status

### ✅ Linked Materials (Auto-Sync Enabled)

| Inventory Material | BOM Material | Conversion | How It Works |
|-------------------|--------------|------------|--------------|
| MDF Board 1.22x2.44m | MDF 3mm Sheet | 1 sheet = 297,680 cm² | Buy 1 sheet for $150 → $0.000504/cm² in BOM |
| Circular Black Magnets | Circular Magnet 2cm | 1 unit = 1 pieza | Buy 100 units at $0.50 each → $0.50/pieza in BOM |

### ⚠️ Unlinked Materials (No Auto-Sync)

- **Industrial Glue** - Not linked to BOM yet (need bottle size in grams)
- **Transparent Protective Backs** - Not in BOM system

## Usage Examples

### Example 1: Buying MDF Sheets

**Scenario:** You buy 5 MDF sheets for $750 total

**Steps:**
1. Go to Inventory → MDF Board
2. Record purchase: 5 sheets, $750 total ($150 per sheet)
3. System automatically updates BOM to $0.000504 per cm²
4. All products using MDF (Imanes de MDF, Llaveros, etc.) recalculate instantly

**Result:**
- Product "Imanes de MDF" goes from $2.16 → $2.19 (reflecting new material cost)
- Product pages show updated costs immediately
- No manual updates needed!

### Example 2: Buying Magnets

**Scenario:** You buy 500 magnets for $250 total

**Steps:**
1. Go to Inventory → Circular Black Magnets
2. Record purchase: 500 units, $250 total ($0.50 per unit)
3. System updates BOM to $0.50 per pieza
4. Products using magnets recalculate automatically

### Example 3: Viewing Current Costs

**In Prices Tab → BOM:**
- See all raw materials with current costs
- Costs reflect latest purchase prices
- Click any product to see component breakdown

## Adding New Material Links

### If Names Match Automatically:

When you add new materials to both systems with similar names, run:
```bash
cd backend
node shared/run-sync-migration.js
```

This will attempt to auto-link materials by name.

### Manual Linking:

For materials that don't auto-match or need custom conversion factors:

1. Find material IDs:
```bash
node shared/check-materials.js
```

2. Link manually in database:
```sql
-- Simple 1:1 link (no conversion)
UPDATE materials
SET raw_material_id = <bom_material_id>,
    conversion_factor = 1.0
WHERE id = <inventory_material_id>;

-- With conversion (e.g., glue bottle)
UPDATE materials
SET raw_material_id = <bom_material_id>,
    conversion_factor = 500.0  -- 1 bottle = 500 grams
WHERE id = <inventory_material_id>;
```

### Conversion Factor Examples:

- **No conversion:** 1.0 (e.g., 1 magnet = 1 pieza)
- **Sheet to area:** 297680 (1 sheet 1.22m × 2.44m = 297,680 cm²)
- **Bottle to grams:** 500 (1 bottle = 500 grams)
- **Roll to meters:** 100 (1 roll = 100 meters)

## Database Schema

### New Columns Added:

**materials table:**
- `raw_material_id` - Links to BOM raw_materials table
- `conversion_factor` - Multiplier for unit conversion (default: 1.0)

### Precision Updates:

- `raw_materials.cost_per_unit`: DECIMAL(12, 8) - Supports tiny costs like $0.00050403
- `products.production_cost`: DECIMAL(12, 8) - Matches material precision

## Triggers Created

### 1. sync_purchase_to_bom_cost
**Fires:** After inserting a purchase transaction
**Action:** Updates BOM raw_material cost with conversion
**Logic:** `new_bom_cost = purchase_unit_cost ÷ conversion_factor`

### 2. update_products_using_material
**Fires:** After raw_material cost changes
**Action:** Recalculates all products using that material

### 3. update_product_cost_from_bom
**Fires:** After product_components change
**Action:** Recalculates single product cost

## Migration Files Applied

1. `004-sync-inventory-to-bom.sql` - Initial sync system
2. `005-add-conversion-factor.sql` - Added conversion support
3. `006-fix-trigger-functions.sql` - Fixed trigger function calls
4. `007-increase-cost-precision.sql` - Increased decimal precision

## Testing

### Run Full Test Suite:
```bash
cd backend
node shared/test-sync.js
```

**Expected Results:**
- ✅ MDF test passes with conversion
- ✅ Magnet test passes without conversion
- ✅ Product costs update automatically

### View Material Status:
```bash
node shared/check-materials.js
```

Shows all materials and their linking status.

## Troubleshooting

### Problem: Costs not updating

**Check:**
1. Is material linked? `node shared/check-materials.js`
2. Is conversion factor correct? Check `materials.conversion_factor`
3. Are purchases recording unit_cost? Check `material_transactions` table

### Problem: Wrong costs after purchase

**Likely cause:** Incorrect conversion factor

**Fix:**
```sql
UPDATE materials
SET conversion_factor = <correct_value>
WHERE name = '<material_name>';
```

Then record a new purchase to update BOM.

### Problem: Need to unlink materials

```sql
UPDATE materials
SET raw_material_id = NULL,
    conversion_factor = 1.0
WHERE id = <material_id>;
```

## Benefits

### ✅ Automatic Cost Updates
- No manual price entry in BOM system
- Purchase receipts drive all pricing
- Real-world costs always reflected

### ✅ Accurate Product Pricing
- Product costs update instantly
- Margins calculated on actual purchase prices
- No stale pricing data

### ✅ Single Source of Truth
- Record purchase once
- Flows everywhere automatically
- Eliminates data sync issues

### ✅ Audit Trail
- All cost changes tracked via material_transactions
- See cost history over time
- Understand margin changes

## Next Steps

### Recommended:

1. **Link remaining materials:**
   - Determine glue bottle size (grams)
   - Add protective backs to BOM if needed
   - Run linking script

2. **Test with real purchases:**
   - Record actual purchases
   - Verify costs update correctly
   - Check product price changes

3. **Monitor accuracy:**
   - Compare product costs to actual
   - Adjust waste percentages if needed
   - Fine-tune conversion factors

4. **Set up notifications (future):**
   - Alert when costs increase significantly
   - Track margin erosion
   - Optimize purchasing decisions

## Support

### Scripts Available:

- `run-sync-migration.js` - Initial setup + auto-link materials
- `check-materials.js` - View all materials and link status
- `link-materials.js` - Link specific materials with conversions
- `test-sync.js` - Test the integration
- `cleanup-test.js` - Remove test transactions

### Questions?

- Check backend server logs for trigger notifications
- Review material_transactions for purchase history
- Verify raw_materials costs in database
- Check products.updated_at for recent cost changes

---

**Integration completed:** 2025-01-05
**Status:** ✅ Fully Operational
**Test Results:** All tests passing
