-- =====================================================
-- Migration 010: Automatic Cost Calculations
-- =====================================================
-- This migration creates database triggers and functions to automatically
-- calculate production costs, material costs, labor costs, and profit margins
-- based on Bill of Materials (BOM) components.
-- =====================================================

-- =====================================================
-- FUNCTION: Calculate Product Cost from BOM
-- =====================================================
-- This function calculates the total production cost of a product
-- by summing up all its component costs (materials + waste)
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_product_cost_from_bom(p_product_id INTEGER)
RETURNS TABLE (
  materials_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(
      pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100.0)
    ), 0)::DECIMAL(10,2) AS materials_cost,
    COALESCE(SUM(
      pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100.0)
    ), 0)::DECIMAL(10,2) + COALESCE((SELECT labor_cost FROM products WHERE id = p_product_id), 0)::DECIMAL(10,2) AS total_cost
  FROM product_components pc
  JOIN raw_materials rm ON pc.raw_material_id = rm.id
  WHERE pc.product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Update Product Costs
-- =====================================================
-- This function updates a product's production_cost and material_cost
-- based on its BOM components
-- =====================================================

CREATE OR REPLACE FUNCTION update_product_costs(p_product_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_materials_cost DECIMAL(10,2);
  v_total_cost DECIMAL(10,2);
  v_labor_cost DECIMAL(10,2);
BEGIN
  -- Calculate costs from BOM
  SELECT materials_cost, total_cost
  INTO v_materials_cost, v_total_cost
  FROM calculate_product_cost_from_bom(p_product_id);

  -- Get current labor cost
  SELECT COALESCE(labor_cost, 0) INTO v_labor_cost
  FROM products
  WHERE id = p_product_id;

  -- Update product table
  UPDATE products
  SET
    material_cost = v_materials_cost,
    production_cost = v_total_cost,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_product_id;

  RAISE NOTICE 'Updated product % costs: materials=$%, total=$%',
    p_product_id, v_materials_cost, v_total_cost;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Auto-update costs when components change
-- =====================================================
-- Automatically recalculate product costs when:
-- - A component is added
-- - A component is updated
-- - A component quantity/waste changes
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_product_costs()
RETURNS TRIGGER AS $$
BEGIN
  -- For INSERT and UPDATE, use NEW.product_id
  -- For DELETE, use OLD.product_id
  IF (TG_OP = 'DELETE') THEN
    PERFORM update_product_costs(OLD.product_id);
    RETURN OLD;
  ELSE
    PERFORM update_product_costs(NEW.product_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_component_change_update_cost ON product_components;

CREATE TRIGGER trg_component_change_update_cost
AFTER INSERT OR UPDATE OR DELETE ON product_components
FOR EACH ROW
EXECUTE FUNCTION trigger_update_product_costs();

-- =====================================================
-- TRIGGER: Auto-update costs when material prices change
-- =====================================================
-- Automatically recalculate ALL product costs that use a material
-- when that material's cost_per_unit changes
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_products_on_material_cost_change()
RETURNS TRIGGER AS $$
DECLARE
  affected_product RECORD;
BEGIN
  -- Only proceed if cost_per_unit actually changed
  IF (NEW.cost_per_unit IS DISTINCT FROM OLD.cost_per_unit) THEN
    -- Update all products that use this material
    FOR affected_product IN
      SELECT DISTINCT product_id
      FROM product_components
      WHERE raw_material_id = NEW.id
    LOOP
      PERFORM update_product_costs(affected_product.product_id);
    END LOOP;

    RAISE NOTICE 'Updated costs for all products using material: %', NEW.name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_material_cost_change_update_products ON raw_materials;

CREATE TRIGGER trg_material_cost_change_update_products
AFTER UPDATE ON raw_materials
FOR EACH ROW
WHEN (OLD.cost_per_unit IS DISTINCT FROM NEW.cost_per_unit)
EXECUTE FUNCTION trigger_update_products_on_material_cost_change();

-- =====================================================
-- TRIGGER: Auto-update costs when labor cost changes
-- =====================================================
-- Automatically recalculate product cost when labor_cost is updated
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_update_cost_on_labor_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if labor_cost actually changed
  IF (NEW.labor_cost IS DISTINCT FROM OLD.labor_cost) THEN
    -- Recalculate total production cost
    PERFORM update_product_costs(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_labor_cost_change_update_product ON products;

CREATE TRIGGER trg_labor_cost_change_update_product
AFTER UPDATE ON products
FOR EACH ROW
WHEN (OLD.labor_cost IS DISTINCT FROM NEW.labor_cost)
EXECUTE FUNCTION trigger_update_cost_on_labor_change();

-- =====================================================
-- VIEW: Enhanced Cost Analysis
-- =====================================================
-- Provides comprehensive cost analysis with BOM breakdown
-- =====================================================

CREATE OR REPLACE VIEW cost_analysis AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.category,
  p.base_price AS current_price,
  p.production_cost AS current_cost,
  p.material_cost,
  p.labor_cost,

  -- Margin calculations
  (p.base_price - p.production_cost) AS profit_per_unit,
  CASE
    WHEN p.base_price > 0 THEN ((p.base_price - p.production_cost) / p.base_price * 100)
    ELSE 0
  END AS margin_pct,

  -- BOM component count
  COALESCE(bom.component_count, 0) AS component_count,

  -- Sales data (last 30 days)
  COALESCE(sales.units_sold_30d, 0) AS units_sold_30d,
  COALESCE(sales.revenue_30d, 0) AS revenue_30d,
  COALESCE(sales.profit_30d, 0) AS total_profit_30d,

  -- Cost breakdown percentages
  CASE
    WHEN p.production_cost > 0 THEN (p.material_cost / p.production_cost * 100)
    ELSE 0
  END AS materials_pct,
  CASE
    WHEN p.production_cost > 0 THEN (COALESCE(p.labor_cost, 0) / p.production_cost * 100)
    ELSE 0
  END AS labor_pct,

  -- Avg historical prices (last 30 days)
  COALESCE(hist.avg_price_30d, p.base_price) AS avg_price_30d,
  COALESCE(hist.price_changes_30d, 0) AS price_changes_30d,

  p.is_active,
  p.updated_at
FROM products p

-- BOM component summary
LEFT JOIN (
  SELECT
    product_id,
    COUNT(*) AS component_count
  FROM product_components
  GROUP BY product_id
) bom ON p.id = bom.product_id

-- Sales summary (last 30 days)
LEFT JOIN (
  SELECT
    oi.product_id,
    SUM(oi.quantity) AS units_sold_30d,
    SUM(oi.line_total) AS revenue_30d,
    SUM(oi.line_profit) AS profit_30d
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
    AND o.status != 'cancelled'
  GROUP BY oi.product_id
) sales ON p.id = sales.product_id

-- Historical pricing (last 30 days)
LEFT JOIN (
  SELECT
    product_id,
    AVG(base_price) AS avg_price_30d,
    COUNT(*) AS price_changes_30d
  FROM product_price_history
  WHERE effective_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY product_id
) hist ON p.id = hist.product_id

ORDER BY p.name;

-- =====================================================
-- VIEW: Product BOM Costs Detail
-- =====================================================
-- Shows detailed breakdown of each product's BOM with costs
-- =====================================================

CREATE OR REPLACE VIEW product_bom_costs AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  rm.id AS material_id,
  rm.name AS material_name,
  rm.sku AS material_sku,
  rm.unit_label,
  rm.cost_per_unit,
  pc.quantity_needed,
  pc.waste_percentage,

  -- Cost calculations
  (pc.quantity_needed * rm.cost_per_unit) AS base_cost,
  (pc.quantity_needed * rm.cost_per_unit * pc.waste_percentage / 100.0) AS waste_cost,
  (pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100.0)) AS total_component_cost,

  pc.piece_width,
  pc.piece_height,
  pc.notes,
  pc.created_at
FROM products p
JOIN product_components pc ON p.id = pc.product_id
JOIN raw_materials rm ON pc.raw_material_id = rm.id
ORDER BY p.name, rm.name;

-- =====================================================
-- INDEX: Optimize cost calculation queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_product_components_product_id ON product_components(product_id);
CREATE INDEX IF NOT EXISTS idx_product_components_material_id ON product_components(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Print success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 010 completed successfully!';
  RAISE NOTICE '📊 Created automatic cost calculation system:';
  RAISE NOTICE '   - Products costs now auto-update when BOM components change';
  RAISE NOTICE '   - Products costs now auto-update when material prices change';
  RAISE NOTICE '   - Products costs now auto-update when labor costs change';
  RAISE NOTICE '   - New cost_analysis view with comprehensive metrics';
  RAISE NOTICE '   - New product_bom_costs view for detailed BOM breakdown';
END $$;
