# Setup Guide: Automatic Cost Calculations

## 🎯 Quick Start

This guide will help you enable automatic cost calculations for your souvenir management system.

## Prerequisites

- PostgreSQL database configured
- Node.js installed
- Database connection working

## Step-by-Step Setup

### Step 1: Configure Database Connection

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your database credentials:

```env
# Database Configuration
DB_TYPE=postgres
DATABASE_URL=postgresql://username:password@host:port/database_name

# Or individual components:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=souvenir_management
DB_USER=your_username
DB_PASSWORD=your_password
```

### Step 2: Run the Migration

Execute the automatic cost calculation migration:

```bash
cd backend
node shared/run-cost-automation.js
```

You should see output like:

```
🚀 Running Automatic Cost Calculation Migration...

✅ Automatic cost calculation migration completed successfully!

🔄 Created Functions:
   - calculate_product_cost_from_bom()
   - update_product_costs()

⚡ Created Triggers:
   - trg_component_change_update_cost
   - trg_material_cost_change_update_products
   - trg_labor_cost_change_update_product

📊 Created Views:
   - cost_analysis
   - product_bom_costs
```

### Step 3: Verify Installation

Connect to your database and check that triggers were created:

```sql
\c your_database_name

-- Check triggers
SELECT
  tgname AS trigger_name,
  tgenabled AS enabled
FROM pg_trigger
WHERE tgname LIKE '%cost%';

-- Check functions
SELECT
  proname AS function_name
FROM pg_proc
WHERE proname LIKE '%cost%';

-- Check views
SELECT
  table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('cost_analysis', 'product_bom_costs');
```

## Usage

### 1. Add Raw Materials

First, add your raw materials with accurate costs:

```sql
INSERT INTO raw_materials (
  name,
  sku,
  unit_type,
  unit_label,
  cost_per_unit,
  current_stock,
  min_stock_level
) VALUES
  ('MDF 3mm Sheet', 'MDF-3MM', 'area', 'cm²', 0.05, 10, 5),
  ('Circular Magnet 1.5cm', 'MAG-15', 'piece', 'pcs', 0.15, 500, 100),
  ('Transparent Bag 10x15cm', 'BAG-1015', 'piece', 'pcs', 0.08, 1000, 200);
```

Or use the admin UI:
1. Go to Prices & Margins → BOM tab
2. Click "Add Material"
3. Fill in the form

### 2. Define Product BOM

Add components to your products:

```sql
-- Example: Custom Magnet Souvenir
-- Product ID = 1 (your actual product)

-- Component 1: MDF base (8cm × 8cm = 64 cm²)
INSERT INTO product_components (
  product_id,
  raw_material_id,
  quantity_needed,
  unit_type,
  piece_width,
  piece_height,
  waste_percentage,
  notes
) VALUES (
  1,
  (SELECT id FROM raw_materials WHERE sku = 'MDF-3MM'),
  64,
  'area',
  8.0,
  8.0,
  5.0,
  '1 piece per product, 8x8cm square'
);

-- Component 2: Magnet
INSERT INTO product_components (
  product_id,
  raw_material_id,
  quantity_needed,
  unit_type,
  waste_percentage,
  notes
) VALUES (
  1,
  (SELECT id FROM raw_materials WHERE sku = 'MAG-15'),
  1,
  'piece',
  2.0,
  '1 magnet per product'
);

-- Component 3: Bag
INSERT INTO product_components (
  product_id,
  raw_material_id,
  quantity_needed,
  unit_type,
  waste_percentage,
  notes
) VALUES (
  1,
  (SELECT id FROM raw_materials WHERE sku = 'BAG-1015'),
  1,
  'piece',
  0.0,
  '1 bag for packaging'
);
```

Or use the admin UI:
1. Go to Prices & Margins → Overview
2. Click on a product
3. In the modal, click "Add Component"
4. Select material, quantity, and waste percentage

### 3. Set Labor Cost

Labor costs are set manually per product:

```sql
UPDATE products
SET labor_cost = 1.50
WHERE id = 1;
```

**Automatic Calculation Happens:**
- Material cost calculated from BOM components
- Production cost = Material cost + Labor cost
- Profit and margin auto-calculated from price

### 4. Set Base Price

Set your selling price:

```sql
UPDATE products
SET base_price = 8.00
WHERE id = 1;
```

**Automatic Calculation Happens:**
- Profit = Base price - Production cost
- Margin = (Profit / Base price) × 100

### 5. View Results

Check the auto-calculated values:

```sql
SELECT
  name,
  base_price,
  material_cost,     -- ✅ Auto-calculated from BOM
  labor_cost,        -- ⚙️ Set manually
  production_cost,   -- ✅ Auto-calculated (material + labor)
  profit,            -- ✅ Auto-calculated (price - cost)
  profit_margin      -- ✅ Auto-calculated percentage
FROM products
WHERE id = 1;
```

Or view in the admin UI:
1. Go to Prices & Margins
2. See the calculated margins in the product table
3. Click on a product to see detailed cost breakdown

## Examples

### Example 1: Simple Product

**Product**: Wooden Keychain
- **Base Price**: $5.00
- **Components**:
  - Wood piece: 10cm² @ $0.03/cm² + 3% waste = $0.31
  - Keyring: 1 piece @ $0.20 + 0% waste = $0.20
  - Varnish: 5ml @ $0.02/ml + 5% waste = $0.11
- **Labor**: $1.00
- **Auto-Calculated**:
  - Material Cost: $0.62
  - Production Cost: $1.62
  - Profit: $3.38
  - Margin: 67.6%

### Example 2: Complex Product

**Product**: Custom Photo Frame
- **Base Price**: $15.00
- **Components**:
  - MDF frame: 200cm² @ $0.05/cm² + 5% waste = $10.50
  - Acrylic sheet: 150cm² @ $0.08/cm² + 3% waste = $12.36
  - Backing board: 150cm² @ $0.02/cm² + 2% waste = $3.06
  - Stand: 1 piece @ $0.50 + 0% waste = $0.50
- **Labor**: $2.50
- **Auto-Calculated**:
  - Material Cost: $26.42
  - Production Cost: $28.92
  - **Profit: -$13.92 ❌**
  - **Margin: -92.8% ❌**

**Action**: Increase price to $35.00 or reduce material costs!

## Monitoring & Maintenance

### Daily Checks

Run these queries daily to monitor your costs:

```sql
-- Products with negative margins
SELECT name, base_price, production_cost, profit_margin
FROM products
WHERE profit_margin < 0 AND is_active = true;

-- Products with low margins (<20%)
SELECT name, base_price, production_cost, profit_margin
FROM products
WHERE profit_margin < 20 AND profit_margin >= 0 AND is_active = true
ORDER BY profit_margin ASC;

-- Products without BOM (costs not auto-calculated)
SELECT p.name
FROM products p
LEFT JOIN product_components pc ON p.id = pc.product_id
WHERE pc.id IS NULL AND p.is_active = true;
```

### Weekly Checks

Update material prices based on recent purchases:

```sql
-- Example: Update MDF price after new purchase
UPDATE raw_materials
SET cost_per_unit = 0.055,  -- New price
    updated_at = CURRENT_TIMESTAMP
WHERE sku = 'MDF-3MM';

-- This will automatically update ALL products using MDF!
```

### Monthly Review

Check the cost analysis view:

```sql
SELECT
  product_name,
  current_price,
  current_cost,
  margin_pct,
  units_sold_30d,
  profit_30d
FROM cost_analysis
ORDER BY profit_30d DESC
LIMIT 20;
```

## Troubleshooting

### Costs Not Updating

**Problem**: Added components but costs didn't change

**Solutions**:

1. Check if triggers are enabled:
   ```sql
   SELECT tgname, tgenabled
   FROM pg_trigger
   WHERE tgrelid::regclass::text = 'product_components';
   ```

2. Manually trigger update:
   ```sql
   SELECT update_product_costs(YOUR_PRODUCT_ID);
   ```

3. Check for errors in component data:
   ```sql
   SELECT * FROM product_bom_costs
   WHERE product_id = YOUR_PRODUCT_ID;
   ```

### Incorrect Calculations

**Problem**: Costs don't match expectations

**Solutions**:

1. Verify material prices:
   ```sql
   SELECT name, cost_per_unit FROM raw_materials;
   ```

2. Check component quantities:
   ```sql
   SELECT * FROM product_bom_costs WHERE product_id = YOUR_PRODUCT_ID;
   ```

3. Verify labor cost is set:
   ```sql
   SELECT name, labor_cost FROM products WHERE id = YOUR_PRODUCT_ID;
   ```

### Migration Errors

**Problem**: Migration script fails

**Solutions**:

1. Check database connection:
   ```bash
   node -e "import('./backend/shared/database.js').then(db => db.testConnection())"
   ```

2. Verify PostgreSQL version (requires 12+):
   ```sql
   SELECT version();
   ```

3. Check if migration already ran:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'update_product_costs';
   ```

## Alternative: Manual SQL Migration

If the Node.js script doesn't work, you can run the SQL directly:

```bash
psql -U your_username -d your_database -f backend/shared/migrations/010-automatic-cost-calculations.sql
```

Or copy-paste the SQL content into your database client (pgAdmin, DBeaver, etc.)

## Next Steps

1. ✅ Migration complete
2. ✅ Add raw materials
3. ✅ Define product BOMs
4. ✅ Set labor costs
5. ✅ Set base prices
6. 📊 Monitor margins in the admin dashboard
7. 💰 Optimize pricing based on calculated costs

## Support

For more information:
- See [AUTOMATIC-COST-CALCULATIONS.md](docs/AUTOMATIC-COST-CALCULATIONS.md) for detailed documentation
- See [CLAUDE.md](CLAUDE.md) for system architecture
- Check [API_REFERENCE.md](docs/API_REFERENCE.md) for API endpoints

---

**Need Help?** Check the database logs or review the migration SQL file at:
`backend/shared/migrations/010-automatic-cost-calculations.sql`
