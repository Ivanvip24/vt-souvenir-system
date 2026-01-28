import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Gallery Deployment Tracking migration...');

  try {
    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS deployed_to_website BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added deployed_to_website column to design_gallery');

    await query(`
      ALTER TABLE design_gallery
      ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMP;
    `);
    console.log('✅ Added deployed_at column to design_gallery');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_design_gallery_deployed ON design_gallery(deployed_to_website);
    `);
    console.log('✅ Created index on deployed_to_website');

    // Verify columns were added
    const result = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'design_gallery'
      AND column_name IN ('deployed_to_website', 'deployed_at')
      ORDER BY column_name;
    `);
    console.log('✅ Verified columns:', result.rows);

    console.log('\n✅ Gallery Deployment Tracking migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await closePool();
  }
}

runMigration();
