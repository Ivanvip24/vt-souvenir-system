import { query, testConnection, closePool } from './database.js';

const createTablesSQL = `
-- =====================================================
-- CLIENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_name ON clients(name);

-- =====================================================
-- PRODUCTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  design_file_path VARCHAR(500),
  base_price DECIMAL(10, 2) NOT NULL,
  production_cost DECIMAL(10, 2) NOT NULL,
  material_cost DECIMAL(10, 2),
  labor_cost DECIMAL(10, 2),
  dimensions VARCHAR(100),
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);

-- =====================================================
-- ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  notion_page_id VARCHAR(100) UNIQUE,
  notion_page_url TEXT,

  client_id INTEGER REFERENCES clients(id),

  -- Order details
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  status VARCHAR(50) DEFAULT 'new',
  department VARCHAR(50) DEFAULT 'design',
  priority VARCHAR(20) DEFAULT 'normal',

  -- Event details (for client orders)
  event_type VARCHAR(100),
  event_date DATE,
  client_notes TEXT,

  -- Financial
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0,
  shipping_cost DECIMAL(10, 2) DEFAULT 0,
  total_price DECIMAL(10, 2) NOT NULL,
  total_production_cost DECIMAL(10, 2) NOT NULL,
  profit DECIMAL(10, 2) GENERATED ALWAYS AS (total_price - total_production_cost) STORED,
  profit_margin DECIMAL(5, 2) GENERATED ALWAYS AS (
    CASE
      WHEN total_price > 0 THEN ((total_price - total_production_cost) / total_price * 100)
      ELSE 0
    END
  ) STORED,

  -- Payment details (for client orders)
  deposit_amount DECIMAL(10, 2),
  deposit_paid BOOLEAN DEFAULT false,
  payment_method VARCHAR(50),
  payment_proof_url TEXT,
  stripe_payment_id TEXT,
  approval_status VARCHAR(50) DEFAULT 'pending_review',

  -- Shipping
  shipping_label_generated BOOLEAN DEFAULT false,
  shipping_label_url TEXT,
  tracking_number VARCHAR(100),

  -- Notes
  notes TEXT,
  internal_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  shipped_at TIMESTAMP
);

CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_notion_page_id ON orders(notion_page_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_department ON orders(department);
CREATE INDEX idx_orders_order_date ON orders(order_date);

-- =====================================================
-- ORDER ITEMS TABLE (Products in each order)
-- =====================================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),

  -- Item details
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(10, 2) NOT NULL,

  -- Calculated totals
  line_total DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_cost DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  line_profit DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * (unit_price - unit_cost)) STORED,

  -- Production tracking
  quantity_printed INTEGER DEFAULT 0,
  quantity_cut INTEGER DEFAULT 0,
  quantity_verified INTEGER DEFAULT 0,
  quantity_shipped INTEGER DEFAULT 0,

  -- Item-level notes and attachments (JSON array of URLs)
  notes TEXT,
  attachments TEXT, -- JSON array of {url, filename, type}

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- =====================================================
-- PRODUCTION TRACKING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS production_tracking (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,

  department VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  quantity_processed INTEGER,

  notes TEXT,
  processed_by VARCHAR(100),

  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_production_order_id ON production_tracking(order_id);
CREATE INDEX idx_production_department ON production_tracking(department);
CREATE INDEX idx_production_status ON production_tracking(status);

-- =====================================================
-- PAYMENTS TABLE (for client order payments)
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,

  payment_type VARCHAR(50) NOT NULL, -- 'deposit', 'final_payment', 'refund'
  amount DECIMAL(10, 2) NOT NULL,

  -- Payment details
  payment_method VARCHAR(50), -- 'stripe', 'bank_transfer', 'cash'
  transaction_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'

  -- Proof (for bank transfers)
  proof_url TEXT,

  -- Timestamps
  payment_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payment_type ON payments(payment_type);

-- =====================================================
-- ORDER FILES TABLE (for reference images and design files)
-- =====================================================
CREATE TABLE IF NOT EXISTS order_files (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,

  file_type VARCHAR(50) NOT NULL, -- 'reference_image', 'design_proof', 'final_design'
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER, -- in bytes
  mime_type VARCHAR(100),

  -- Who uploaded
  uploaded_by VARCHAR(50), -- 'client', 'admin'

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_files_order_id ON order_files(order_id);
CREATE INDEX idx_order_files_type ON order_files(file_type);

-- =====================================================
-- REPORTS HISTORY TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS reports_history (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
  report_period VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Metrics
  total_orders INTEGER,
  total_revenue DECIMAL(12, 2),
  total_profit DECIMAL(12, 2),
  average_profit_margin DECIMAL(5, 2),

  -- Report files
  report_file_path TEXT,
  pdf_file_path TEXT,

  sent_to TEXT,
  sent_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_type ON reports_history(report_type);
CREATE INDEX idx_reports_period ON reports_history(start_date, end_date);

-- =====================================================
-- ANALYTICS CACHE TABLE (for performance)
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_cache (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  period_type VARCHAR(50) NOT NULL,
  period_date DATE NOT NULL,

  metric_value DECIMAL(12, 2),
  metadata JSONB,

  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(metric_name, period_type, period_date)
);

CREATE INDEX idx_analytics_cache_metric ON analytics_cache(metric_name, period_date);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Order summary view
CREATE OR REPLACE VIEW order_summary AS
SELECT
  o.id,
  o.order_number,
  o.order_date,
  o.status,
  o.department,
  c.name as client_name,
  c.phone as client_phone,
  o.total_price,
  o.total_production_cost,
  o.profit,
  o.profit_margin,
  COUNT(oi.id) as item_count,
  SUM(oi.quantity) as total_items
FROM orders o
LEFT JOIN clients c ON o.client_id = c.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, c.name, c.phone;

-- Daily revenue view
CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  order_date,
  COUNT(*) as order_count,
  SUM(total_price) as revenue,
  SUM(total_production_cost) as costs,
  SUM(profit) as profit,
  AVG(profit_margin) as avg_profit_margin
FROM orders
WHERE status != 'cancelled'
GROUP BY order_date
ORDER BY order_date DESC;

-- Top products view
CREATE OR REPLACE VIEW top_products AS
SELECT
  p.id,
  p.name,
  COUNT(DISTINCT oi.order_id) as times_ordered,
  SUM(oi.quantity) as total_quantity_sold,
  SUM(oi.line_total) as total_revenue,
  SUM(oi.line_profit) as total_profit
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
GROUP BY p.id, p.name
ORDER BY total_revenue DESC;

-- Top clients view
CREATE OR REPLACE VIEW top_clients AS
SELECT
  c.id,
  c.name,
  c.phone,
  COUNT(o.id) as order_count,
  SUM(o.total_price) as total_spent,
  SUM(o.profit) as total_profit_generated,
  AVG(o.total_price) as avg_order_value,
  MAX(o.order_date) as last_order_date
FROM clients c
LEFT JOIN orders o ON c.id = o.client_id
WHERE o.status != 'cancelled'
GROUP BY c.id, c.name, c.phone
ORDER BY total_spent DESC;
`;

async function initializeDatabase() {
  console.log('🚀 Initializing database...\n');

  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Failed to connect to database. Check your .env configuration.');
    process.exit(1);
  }

  try {
    // Execute schema creation
    console.log('📝 Creating tables and views...');
    await query(createTablesSQL);
    console.log('✅ Database schema created successfully!\n');

    // Insert sample data
    console.log('📦 Inserting sample data...');
    await insertSampleData();

    console.log('\n✨ Database initialization complete!');
    console.log('\nCreated tables:');
    console.log('  - clients');
    console.log('  - products');
    console.log('  - orders (with client order fields)');
    console.log('  - order_items');
    console.log('  - production_tracking');
    console.log('  - payments');
    console.log('  - order_files');
    console.log('  - reports_history');
    console.log('  - analytics_cache');
    console.log('\nCreated views:');
    console.log('  - order_summary');
    console.log('  - daily_revenue');
    console.log('  - top_products');
    console.log('  - top_clients');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await closePool();
  }
}

async function insertSampleData() {
  // Sample client
  await query(`
    INSERT INTO clients (name, phone, address, city, state)
    VALUES
      ('María González', '5512345678', 'Av. Juárez 123', 'Guadalajara', 'Jalisco'),
      ('Carlos Ramírez', '5587654321', 'Calle Morelos 456', 'Monterrey', 'Nuevo León')
    ON CONFLICT DO NOTHING
  `);

  // Sample products
  await query(`
    INSERT INTO products (name, description, base_price, production_cost, material_cost, labor_cost, category)
    VALUES
      ('Quinceañera Souvenir', 'Custom MDF laser-cut souvenir', 10.00, 2.00, 1.50, 0.50, 'Quinceañera'),
      ('Custom Name Plate', 'Personalized name plate', 5.00, 1.00, 0.70, 0.30, 'General'),
      ('Wedding Favor', 'Elegant wedding favor design', 12.00, 2.50, 1.80, 0.70, 'Wedding')
    ON CONFLICT DO NOTHING
  `);

  console.log('  ✓ Sample data inserted');
}

// Run initialization
initializeDatabase().catch(console.error);
