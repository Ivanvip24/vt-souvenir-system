-- =====================================================
-- Migration 011: Add Production Sheet URL Column
-- =====================================================
-- This migration adds a column to store the reference sheet PDF
-- (AXKAN ORDEN DE COMPRA) as a base64 data URL
-- =====================================================

-- Add production_sheet_url column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_sheet_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN orders.production_sheet_url IS 'Stores the production reference sheet PDF as a base64 data URL';
