-- 018: Design Subscriptions — subscriber accounts, download logging, public flag

ALTER TABLE design_gallery
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_design_gallery_public ON design_gallery(is_public);

CREATE TABLE IF NOT EXISTS design_subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_subscribers_email ON design_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_design_subscribers_stripe ON design_subscribers(stripe_customer_id);

CREATE TABLE IF NOT EXISTS design_download_log (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
  design_id INTEGER REFERENCES design_gallery(id) ON DELETE SET NULL,
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_download_log_subscriber ON design_download_log(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_download_log_design ON design_download_log(design_id);
CREATE INDEX IF NOT EXISTS idx_download_log_date ON design_download_log(downloaded_at);
