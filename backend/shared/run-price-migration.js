import { query, testConnection, closePool } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPriceMigration() {
  console.log('\n🚀 Running Price Tracking System Migration...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Database connection failed. Check your .env configuration.');
    process.exit(1);
  }

  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', '002-price-tracking-system.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);

    const sql = await fs.readFile(migrationPath, 'utf-8');

    console.log('⚙️  Executing migration...\n');

    // Execute migration
    await query(sql);

    console.log('\n✅ Price tracking system migration completed successfully!');
    console.log('\n📊 Created tables:');
    console.log('   - product_price_history');
    console.log('   - material_cost_history');
    console.log('   - market_price_benchmarks');
    console.log('   - pricing_insights');
    console.log('\n📈 Created views:');
    console.log('   - cost_analysis');
    console.log('   - margin_performance');
    console.log('   - price_trends_monthly');
    console.log('\n🔔 Created triggers:');
    console.log('   - Auto-track price changes on products table');
    console.log('\n🎉 Your price tracking system is now ready to use!');
    console.log('   Navigate to http://localhost:3000/admin and click the 💰 Precios tab\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
runPriceMigration();
