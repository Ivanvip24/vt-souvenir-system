-- 015-whatsapp-features.sql
-- Adds image_url to products, creates template + broadcast tables

-- 1. Fix missing products.image_url column
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Template messages table
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL,
  language VARCHAR(10) DEFAULT 'es_MX',
  status VARCHAR(50) DEFAULT 'pending',
  meta_template_id VARCHAR(100),
  header_type VARCHAR(20),
  body_text TEXT NOT NULL,
  footer_text TEXT,
  variables JSONB,
  buttons JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Broadcast tracking table
CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES whatsapp_templates(id),
  sent_by VARCHAR(100),
  recipients JSONB NOT NULL,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
