/**
 * Migration: Add Salespeople and Commissions System
 *
 * Creates tables for tracking salespeople and their commissions.
 * Run with: node backend/migrations/add-salespeople-commissions.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

// Support DATABASE_URL (Render/production) or individual vars (local)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'souvenir_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD
    });

async function migrate() {
  console.log('🚀 Starting salespeople and commissions migration...\n');

  try {
    // 1. Create salespeople table
    console.log('📋 Creating salespeople table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS salespeople (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        phone VARCHAR(20),
        email VARCHAR(100),
        commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 6.00,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_salespeople_name ON salespeople(name);
      CREATE INDEX IF NOT EXISTS idx_salespeople_active ON salespeople(is_active);
    `);
    console.log('   ✅ salespeople table created\n');

    // 2. Add sales_rep column to orders if it doesn't exist
    console.log('📋 Checking sales_rep column on orders...');
    const columnCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name = 'sales_rep'
    `);

    if (columnCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE orders ADD COLUMN sales_rep VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_orders_sales_rep ON orders(sales_rep);
      `);
      console.log('   ✅ sales_rep column added to orders\n');
    } else {
      console.log('   ℹ️ sales_rep column already exists\n');
    }

    // 3. Add salesperson_id reference (optional, for foreign key)
    console.log('📋 Checking salesperson_id column on orders...');
    const fkCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders' AND column_name = 'salesperson_id'
    `);

    if (fkCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE orders ADD COLUMN salesperson_id INTEGER REFERENCES salespeople(id);
        CREATE INDEX IF NOT EXISTS idx_orders_salesperson_id ON orders(salesperson_id);
      `);
      console.log('   ✅ salesperson_id column added to orders\n');
    } else {
      console.log('   ℹ️ salesperson_id column already exists\n');
    }

    // 4. Create commissions view for easy querying
    console.log('📋 Creating commissions_summary view...');
    await pool.query(`
      CREATE OR REPLACE VIEW commissions_summary AS
      SELECT
        COALESCE(o.sales_rep, 'Sin vendedor') as salesperson_name,
        sp.id as salesperson_id,
        COALESCE(sp.commission_rate, 6.00) as commission_rate,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_sales,
        COALESCE(SUM(o.total_price * COALESCE(sp.commission_rate, 6.00) / 100), 0) as total_commission,
        COUNT(CASE WHEN o.approval_status = 'approved' THEN 1 END) as approved_orders,
        COALESCE(SUM(CASE WHEN o.approval_status = 'approved' THEN o.total_price END), 0) as approved_sales,
        COALESCE(SUM(CASE WHEN o.approval_status = 'approved' THEN o.total_price * COALESCE(sp.commission_rate, 6.00) / 100 END), 0) as approved_commission
      FROM orders o
      LEFT JOIN salespeople sp ON LOWER(o.sales_rep) = LOWER(sp.name)
      WHERE o.sales_rep IS NOT NULL AND o.sales_rep != ''
      GROUP BY o.sales_rep, sp.id, sp.commission_rate
      ORDER BY total_sales DESC;
    `);
    console.log('   ✅ commissions_summary view created\n');

    // 5. Create monthly commissions view
    console.log('📋 Creating monthly_commissions view...');
    await pool.query(`
      CREATE OR REPLACE VIEW monthly_commissions AS
      SELECT
        COALESCE(o.sales_rep, 'Sin vendedor') as salesperson_name,
        sp.id as salesperson_id,
        COALESCE(sp.commission_rate, 6.00) as commission_rate,
        TO_CHAR(o.created_at, 'YYYY-MM') as month,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total_price), 0) as sales,
        COALESCE(SUM(o.total_price * COALESCE(sp.commission_rate, 6.00) / 100), 0) as commission
      FROM orders o
      LEFT JOIN salespeople sp ON LOWER(o.sales_rep) = LOWER(sp.name)
      WHERE o.sales_rep IS NOT NULL AND o.sales_rep != ''
        AND o.approval_status IN ('approved', 'completed', 'delivered')
      GROUP BY o.sales_rep, sp.id, sp.commission_rate, TO_CHAR(o.created_at, 'YYYY-MM')
      ORDER BY month DESC, sales DESC;
    `);
    console.log('   ✅ monthly_commissions view created\n');

    // 6. Insert default salespeople (like Sarahi)
    console.log('📋 Inserting default salespeople...');
    await pool.query(`
      INSERT INTO salespeople (name, commission_rate, notes)
      VALUES
        ('Sarahi', 6.00, 'Vendedora principal'),
        ('Ivan', 0.00, 'Propietario - sin comisión')
      ON CONFLICT (name) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP;
    `);
    console.log('   ✅ Default salespeople inserted\n');

    // 7. Link existing orders to salespeople
    console.log('📋 Linking existing orders to salespeople...');
    const linkResult = await pool.query(`
      UPDATE orders o
      SET salesperson_id = sp.id
      FROM salespeople sp
      WHERE LOWER(o.sales_rep) = LOWER(sp.name)
        AND o.salesperson_id IS NULL;
    `);
    console.log(`   ✅ Linked ${linkResult.rowCount} orders to salespeople\n`);

    console.log('✨ Migration completed successfully!\n');
    console.log('Created:');
    console.log('  - salespeople table');
    console.log('  - commissions_summary view');
    console.log('  - monthly_commissions view');
    console.log('  - Default salespeople (Sarahi @ 6%, Ivan @ 0%)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
