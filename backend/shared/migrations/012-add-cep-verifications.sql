-- 012-add-cep-verifications.sql
-- Stores Banxico CEP verification results for SPEI transfers

CREATE TABLE IF NOT EXISTS cep_verifications (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id),
  clave_rastreo VARCHAR(100),
  fecha_operacion DATE,
  emisor_code VARCHAR(10),
  emisor_name VARCHAR(100),
  receptor_code VARCHAR(10),
  receptor_name VARCHAR(100),
  monto DECIMAL(12, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  banxico_response JSONB,
  cep_pdf_url VARCHAR(500),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cep_verifications_order ON cep_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_cep_verifications_status ON cep_verifications(status);
CREATE INDEX IF NOT EXISTS idx_cep_verifications_retry ON cep_verifications(status, next_retry_at)
  WHERE status = 'pending_retry';
CREATE INDEX IF NOT EXISTS idx_cep_verifications_clave ON cep_verifications(clave_rastreo);
