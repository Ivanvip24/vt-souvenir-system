import { query, closePool } from '../shared/database.js';

async function runMigration() {
  console.log('🔄 Running Mercado Libre integration migration...');

  try {
    // =====================================================
    // MERCADO LIBRE OAUTH TOKENS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS ml_oauth_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        scope TEXT,
        site_ids TEXT[],
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created ml_oauth_tokens table');

    await query(`CREATE INDEX IF NOT EXISTS idx_ml_tokens_user ON ml_oauth_tokens(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ml_tokens_active ON ml_oauth_tokens(is_active);`);

    // =====================================================
    // MERCADO LIBRE PRODUCT LISTINGS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS ml_listings (
        id SERIAL PRIMARY KEY,

        -- Link to local product
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

        -- ML listing identifiers
        ml_item_id VARCHAR(50) UNIQUE,
        site_id VARCHAR(10) NOT NULL,

        -- Listing details
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price_usd DECIMAL(10, 2) NOT NULL,
        listing_type VARCHAR(50) DEFAULT 'gold_special',
        condition VARCHAR(20) DEFAULT 'new',
        category_id VARCHAR(50),

        -- Status tracking
        status VARCHAR(50) DEFAULT 'pending',
        sync_status VARCHAR(50) DEFAULT 'pending',
        last_sync_at TIMESTAMP,
        last_sync_error TEXT,

        -- Inventory
        available_quantity INTEGER DEFAULT 0,
        sold_quantity INTEGER DEFAULT 0,

        -- ML URLs
        permalink TEXT,
        thumbnail_url TEXT,

        -- Timestamps
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created ml_listings table');

    await query(`CREATE INDEX IF NOT EXISTS idx_ml_listings_product ON ml_listings(product_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ml_listings_site ON ml_listings(site_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ml_listings_status ON ml_listings(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ml_listings_sync ON ml_listings(sync_status);`);

    // =====================================================
    // MERCADO LIBRE SYNC HISTORY TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS ml_sync_history (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER REFERENCES ml_listings(id) ON DELETE CASCADE,

        sync_type VARCHAR(50) NOT NULL,
        request_data JSONB,
        response_data JSONB,

        status VARCHAR(20) NOT NULL,
        error_message TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created ml_sync_history table');

    await query(`CREATE INDEX IF NOT EXISTS idx_ml_sync_listing ON ml_sync_history(listing_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ml_sync_type ON ml_sync_history(sync_type);`);

    // =====================================================
    // MERCADO LIBRE CATEGORY MAPPINGS TABLE
    // =====================================================
    await query(`
      CREATE TABLE IF NOT EXISTS ml_category_mappings (
        id SERIAL PRIMARY KEY,
        local_category VARCHAR(100) NOT NULL,
        site_id VARCHAR(10) NOT NULL,
        ml_category_id VARCHAR(50) NOT NULL,
        ml_category_name VARCHAR(255),

        UNIQUE(local_category, site_id)
      );
    `);
    console.log('✅ Created ml_category_mappings table');

    // =====================================================
    // VIEW: ML LISTINGS WITH PRODUCT INFO
    // =====================================================
    await query(`
      CREATE OR REPLACE VIEW ml_listings_summary AS
      SELECT
        l.id,
        l.ml_item_id,
        l.site_id,
        l.title,
        l.price_usd,
        l.status,
        l.sync_status,
        l.available_quantity,
        l.sold_quantity,
        l.permalink,
        l.published_at,
        l.last_sync_at,
        p.id as product_id,
        p.name as product_name,
        p.base_price as local_price,
        p.category as local_category,
        p.image_url
      FROM ml_listings l
      JOIN products p ON l.product_id = p.id;
    `);
    console.log('✅ Created ml_listings_summary view');

    // Verify tables
    const result = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name LIKE 'ml_%'
      ORDER BY table_name;
    `);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => {
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
