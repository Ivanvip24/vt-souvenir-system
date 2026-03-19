/**
 * Migration: Designer Task Tracking System
 *
 * Creates tables for tracking designer tasks (armado/diseño),
 * individual design pieces, and correction history.
 * Seeds initial designers: Sarahi and Majo.
 */

import { query } from '../shared/database.js';

export async function migrate() {
  console.log('🔄 Running Designer Tracking migration...');

  try {
    // =====================================================
    // DESIGNERS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS designers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created designers table');

    // =====================================================
    // DESIGNER TASKS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS designer_tasks (
        id SERIAL PRIMARY KEY,
        designer_id INTEGER REFERENCES designers(id),
        task_type VARCHAR(20) NOT NULL CHECK (task_type IN ('armado', 'diseño')),
        product_type VARCHAR(100),
        destination VARCHAR(200),
        quantity INTEGER,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'correction')),
        assigned_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        source VARCHAR(20) DEFAULT 'direct',
        assigned_image_url TEXT,
        order_reference VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created designer_tasks table');

    // =====================================================
    // DESIGN PIECES TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS design_pieces (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES designer_tasks(id) ON DELETE CASCADE,
        piece_name VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'correction', 'delivered')),
        correction_count INTEGER DEFAULT 0,
        delivered_image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created design_pieces table');

    // =====================================================
    // TASK CORRECTIONS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS task_corrections (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES designer_tasks(id) ON DELETE CASCADE,
        piece_id INTEGER REFERENCES design_pieces(id),
        correction_type VARCHAR(20),
        correction_notes TEXT,
        correction_image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Created task_corrections table');

    // =====================================================
    // INDEXES
    // =====================================================
    await query(`CREATE INDEX IF NOT EXISTS idx_designer_tasks_designer_id ON designer_tasks(designer_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_designer_tasks_status ON designer_tasks(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_designer_tasks_assigned_at ON designer_tasks(assigned_at);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_design_pieces_task_id ON design_pieces(task_id);`);
    console.log('✅ Created indexes');

    // =====================================================
    // SEED DESIGNERS
    // =====================================================
    await query(`
      INSERT INTO designers (name, phone)
      VALUES ('Sarahi', '5215518942408')
      ON CONFLICT (phone) DO NOTHING;
    `);
    await query(`
      INSERT INTO designers (name, phone)
      VALUES ('Majo', '5215534811233')
      ON CONFLICT (phone) DO NOTHING;
    `);
    console.log('✅ Seeded designers: Sarahi, Majo');

    // =====================================================
    // VIEWS
    // =====================================================
    await query(`
      CREATE OR REPLACE VIEW designer_daily_summary AS
      SELECT
        d.id AS designer_id,
        d.name AS designer_name,
        dt.task_type,
        DATE(dt.assigned_at) AS task_date,
        COUNT(*) AS total_assigned,
        COUNT(*) FILTER (WHERE dt.status = 'done') AS completed,
        COUNT(*) FILTER (WHERE dt.status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE dt.status = 'correction') AS in_correction,
        AVG(
          EXTRACT(EPOCH FROM (dt.completed_at - dt.assigned_at)) / 3600.0
        ) FILTER (WHERE dt.completed_at IS NOT NULL) AS avg_hours_to_complete
      FROM designer_tasks dt
      JOIN designers d ON d.id = dt.designer_id
      GROUP BY d.id, d.name, dt.task_type, DATE(dt.assigned_at);
    `);
    console.log('✅ Created designer_daily_summary view');

    await query(`
      CREATE OR REPLACE VIEW correction_patterns AS
      SELECT
        d.id AS designer_id,
        d.name AS designer_name,
        dt.product_type,
        COUNT(DISTINCT dp.id) AS total_pieces,
        SUM(dp.correction_count) AS total_corrections,
        CASE
          WHEN COUNT(DISTINCT dp.id) > 0
          THEN ROUND(SUM(dp.correction_count)::numeric / COUNT(DISTINCT dp.id), 2)
          ELSE 0
        END AS avg_corrections_per_piece
      FROM design_pieces dp
      JOIN designer_tasks dt ON dt.id = dp.task_id
      JOIN designers d ON d.id = dt.designer_id
      GROUP BY d.id, d.name, dt.product_type;
    `);
    console.log('✅ Created correction_patterns view');

    console.log('🎉 Designer Tracking migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Allow running directly: node migrations/add-designer-tracking.js
const isDirectRun = process.argv[1]?.includes('add-designer-tracking');
if (isDirectRun) {
  const { closePool } = await import('../shared/database.js');
  migrate().then(() => closePool()).catch(e => { console.error(e); process.exit(1); });
}
