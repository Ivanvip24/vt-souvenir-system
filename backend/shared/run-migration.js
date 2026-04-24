import { query, testConnection, closePool } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(migrationFile) {
  console.log(`\n🔄 Running migration: ${migrationFile}\n`);

  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = await fs.readFile(migrationPath, 'utf-8');

    // Execute migration
    await query(sql);

    console.log(`✅ Migration ${migrationFile} completed successfully\n`);
  } catch (error) {
    console.error(`❌ Migration ${migrationFile} failed:`, error.message);
    throw error;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting database migrations...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  try {
    // Run migrations in order
    await runMigration('001-add-client-order-system.sql');
    await runMigration('012-add-cep-verifications.sql');
    await runMigration('013-add-pricing-config.sql');
    await runMigration('014-add-whatsapp-ai-toggle.sql');
    await runMigration('015-whatsapp-features.sql');
    await runMigration('016-add-payment-notes.sql');
    await runMigration('017-add-push-subscriptions.sql');
    await runMigration('011-product-price-tiers.sql');
    await runMigration('018-design-subscriptions.sql');
    await runMigration('019-add-follow-up-at.sql');

    // JS-based migrations (export { migrate } pattern)
    try {
      const { migrate: migrateDesignPortal } = await import('../migrations/add-design-portal.js');
      await migrateDesignPortal();
    } catch (e) {
      console.error('❌ Design Portal migration failed:', e.message);
    }

    try {
      const { addDesignImageUrl } = await import('../migrations/add-design-image-url.js');
      await addDesignImageUrl();
    } catch (e) {
      console.error('❌ Design Image URL migration failed:', e.message);
    }

    try {
      const { addDesignerDailyLogs } = await import('../migrations/add-designer-daily-logs.js');
      await addDesignerDailyLogs();
    } catch (e) {
      console.error('❌ Designer Daily Logs migration failed:', e.message);
    }

    try {
      const { addDailyLogDetails } = await import('../migrations/add-daily-log-details.js');
      await addDailyLogDetails();
    } catch (e) {
      console.error('❌ Daily Log Details migration failed:', e.message);
    }

    try {
      const { addOrderDestination } = await import('../migrations/add-order-destination.js');
      await addOrderDestination();
    } catch (e) {
      console.error('❌ Order Destination migration failed:', e.message);
    }

    try {
      const { migrate: migrateChatAssignment } = await import('../migrations/add-chat-assignment.js');
      await migrateChatAssignment();
    } catch (e) {
      console.error('❌ Chat Assignment migration failed:', e.message);
    }

    try {
      const { addClientAddresses } = await import('../migrations/add-client-addresses.js');
      await addClientAddresses();
    } catch (e) {
      console.error('❌ Client Addresses migration failed:', e.message);
    }

    try {
      const { addProductionTrackingLogs } = await import('../migrations/add-production-tracking-logs.js');
      await addProductionTrackingLogs();
    } catch (e) {
      console.error('❌ Production Tracking Logs migration failed:', e.message);
    }

    console.log('\n✨ All migrations completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllMigrations();
}

export { runMigration, runAllMigrations };
