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
