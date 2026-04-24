/**
 * Migration: Design Portal
 *
 * Creates tables for the designer portal:
 * - design_assignments: tracks individual design tasks assigned to designers
 * - design_messages: chat messages between designers and clients (routed via WhatsApp)
 */

import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🔄 Running Design Portal migration...');

  try {
    // =====================================================
    // DESIGN ASSIGNMENTS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS design_assignments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        order_item_id INTEGER REFERENCES order_items(id),
        design_number INTEGER NOT NULL,
        total_designs INTEGER NOT NULL,
        assigned_to INTEGER REFERENCES employees(id),
        assigned_by INTEGER REFERENCES employees(id),
        status VARCHAR(20) DEFAULT 'pendiente'
          CHECK (status IN ('pendiente', 'en_progreso', 'en_revision', 'cambios', 'aprobado')),
        specs JSONB DEFAULT '{}',
        client_phone VARCHAR(20),
        client_name VARCHAR(100),
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created design_assignments table');

    // Indexes for design_assignments
    await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_assigned_to ON design_assignments(assigned_to)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_status ON design_assignments(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_assignments_client_phone ON design_assignments(client_phone)`);
    console.log('✅ Created design_assignments indexes');

    // =====================================================
    // DESIGN MESSAGES TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS design_messages (
        id SERIAL PRIMARY KEY,
        design_assignment_id INTEGER REFERENCES design_assignments(id),
        order_id INTEGER REFERENCES orders(id),
        sender_type VARCHAR(10) CHECK (sender_type IN ('designer', 'client')),
        sender_id INTEGER,
        sender_name VARCHAR(100),
        message_type VARCHAR(10) DEFAULT 'text'
          CHECK (message_type IN ('text', 'image', 'file')),
        content TEXT,
        wa_message_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created design_messages table');

    // Indexes for design_messages
    await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_order_id ON design_messages(order_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_assignment_id ON design_messages(design_assignment_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_messages_created_at ON design_messages(created_at)`);
    console.log('✅ Created design_messages indexes');

    console.log('🎉 Design Portal migration completed successfully!');
  } catch (error) {
    console.error('❌ Design Portal migration failed:', error.message);
    throw error;
  }
}

const isDirectRun = process.argv[1]?.includes('add-design-portal');
if (isDirectRun) {
  const { closePool } = await import('../shared/database.js');
  migrate().then(() => closePool()).catch(e => { console.error(e); process.exit(1); });
}
