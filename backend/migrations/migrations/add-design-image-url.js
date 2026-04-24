import { query } from '../shared/database.js';

export async function addDesignImageUrl() {
  console.log('Adding design_image_url column to design_assignments...');

  await query(`
    ALTER TABLE design_assignments
    ADD COLUMN IF NOT EXISTS design_image_url TEXT
  `);

  console.log('Migration complete: design_image_url column added');
}

// Run directly
addDesignImageUrl().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
