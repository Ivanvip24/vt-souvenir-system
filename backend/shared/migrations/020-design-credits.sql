-- 020: Design Credits — switch from subscription model to credit-based purchases

-- Add credits_balance to subscribers
ALTER TABLE design_subscribers
ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;

-- Create credit_purchases table
CREATE TABLE IF NOT EXISTS credit_purchases (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER REFERENCES design_subscribers(id) ON DELETE SET NULL,
  credits INTEGER NOT NULL,
  amount_mxn NUMERIC(10,2) NOT NULL,
  pack_key VARCHAR(50) NOT NULL,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_subscriber ON credit_purchases(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_stripe ON credit_purchases(stripe_session_id);

-- Add credits_spent column to download log for auditing
ALTER TABLE design_download_log
ADD COLUMN IF NOT EXISTS credits_spent INTEGER DEFAULT 1;
