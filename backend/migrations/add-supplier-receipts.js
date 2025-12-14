/**
 * Migration: Add Supplier Receipts System
 * Creates tables for tracking supplier receipts and purchase history
 */

import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running supplier receipts migration...');

  try {
    // Create suppliers table
    await query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        contact_name VARCHAR(255),
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created suppliers table');

    // Create supplier_receipts table
    await query(`
      CREATE TABLE IF NOT EXISTS supplier_receipts (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        folio VARCHAR(100),
        receipt_date DATE,
        subtotal DECIMAL(12, 2),
        discount DECIMAL(12, 2) DEFAULT 0,
        grand_total DECIMAL(12, 2) NOT NULL,
        image_url TEXT,
        image_public_id VARCHAR(255),
        notes TEXT,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created supplier_receipts table');

    // Check if raw_materials table exists
    const rawMaterialsExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'raw_materials'
      ) as exists
    `);
    const hasRawMaterials = rawMaterialsExists.rows[0].exists;
    console.log(`📦 raw_materials table exists: ${hasRawMaterials}`);

    // Create supplier_receipt_items table - with or without FK depending on raw_materials
    if (hasRawMaterials) {
      await query(`
        CREATE TABLE IF NOT EXISTS supplier_receipt_items (
          id SERIAL PRIMARY KEY,
          receipt_id INTEGER NOT NULL REFERENCES supplier_receipts(id) ON DELETE CASCADE,
          raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE SET NULL,
          quantity DECIMAL(12, 4) NOT NULL,
          description TEXT,
          dimensions VARCHAR(100),
          unit_price DECIMAL(12, 4),
          total DECIMAL(12, 2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      await query(`
        CREATE TABLE IF NOT EXISTS supplier_receipt_items (
          id SERIAL PRIMARY KEY,
          receipt_id INTEGER NOT NULL REFERENCES supplier_receipts(id) ON DELETE CASCADE,
          raw_material_id INTEGER,
          quantity DECIMAL(12, 4) NOT NULL,
          description TEXT,
          dimensions VARCHAR(100),
          unit_price DECIMAL(12, 4),
          total DECIMAL(12, 2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
    console.log('✅ Created supplier_receipt_items table');

    if (hasRawMaterials) {
      // Check if material_cost_history table exists and has raw_material_id column
      const mchExists = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'material_cost_history'
          AND column_name = 'raw_material_id'
        ) as exists
      `);

      if (!mchExists.rows[0].exists) {
        // Drop and recreate if table exists without the column
        await query(`DROP TABLE IF EXISTS material_cost_history CASCADE;`);
        await query(`
          CREATE TABLE material_cost_history (
            id SERIAL PRIMARY KEY,
            raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
            old_cost DECIMAL(12, 4),
            new_cost DECIMAL(12, 4) NOT NULL,
            source VARCHAR(50),
            source_reference VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Created material_cost_history table');
      } else {
        console.log('✅ material_cost_history table already exists');
      }

      // Add index for material_cost_history
      await query(`
        CREATE INDEX IF NOT EXISTS idx_material_cost_history_material ON material_cost_history(raw_material_id);
      `);
    } else {
      console.log('⚠️ Skipped material_cost_history (raw_materials table not found)');
    }

    // Add indexes for performance (only for tables we created)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_supplier_receipts_supplier ON supplier_receipts(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_supplier_receipts_date ON supplier_receipts(receipt_date DESC);
      CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt ON supplier_receipt_items(receipt_id);
    `);

    // Only add this index if raw_materials exists
    if (hasRawMaterials) {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_receipt_items_material ON supplier_receipt_items(raw_material_id);
      `);
    }
    console.log('✅ Created indexes');

    // Create view for supplier purchase summary
    await query(`
      CREATE OR REPLACE VIEW supplier_purchase_summary AS
      SELECT
        s.id as supplier_id,
        s.name as supplier_name,
        s.phone as supplier_phone,
        COUNT(sr.id) as receipt_count,
        COALESCE(SUM(sr.grand_total), 0) as total_purchased,
        MAX(sr.receipt_date) as last_purchase_date,
        MIN(sr.receipt_date) as first_purchase_date
      FROM suppliers s
      LEFT JOIN supplier_receipts sr ON s.id = sr.supplier_id
      GROUP BY s.id, s.name, s.phone
      ORDER BY total_purchased DESC;
    `);
    console.log('✅ Created supplier_purchase_summary view');

    // Verify tables were created
    const tablesResult = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('suppliers', 'supplier_receipts', 'supplier_receipt_items', 'material_cost_history')
      ORDER BY table_name;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Tables created/verified:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();
