import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Gallery Archive migration...');

  try {
    // Add is_archived column to design_gallery
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_archived column to design_gallery');

    // Add archived_at timestamp
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    `);
    console.log('✅ Added archived_at column to design_gallery');

    // Add archived_by reference
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES employees(id) ON DELETE SET NULL;
    `);
    console.log('✅ Added archived_by column to design_gallery');

    // Add index for archived status
    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_gallery_archived ON design_gallery(is_archived);
    `);
    console.log('✅ Created index on is_archived');

    // Add download_count for tracking
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
    `);
    console.log('✅ Added download_count column');

    console.log('\n✅ Gallery Archive migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();
