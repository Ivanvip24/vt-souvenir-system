-- =====================================================
-- MIGRATION: Add Archive Status
-- Adds archive_status column to orders table
-- =====================================================

-- Add archive_status column to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS archive_status VARCHAR(50) DEFAULT 'active';

-- Create index for archive_status
CREATE INDEX IF NOT EXISTS idx_orders_archive_status ON orders(archive_status);

-- Update comment
COMMENT ON COLUMN orders.archive_status IS 'Archive status: active, completo, cancelado';
