/**
 * Migration: Add Facebook Marketplace tracking
 *
 * Adds fields to track which designs have been uploaded to Facebook Marketplace
 */

import { query } from '../shared/database.js';

async function migrate() {
  console.log('🚀 Starting Facebook Marketplace migration...');

  try {
    // Create facebook_listings table to track uploads
    await query(`
      CREATE TABLE IF NOT EXISTS facebook_listings (
        id SERIAL PRIMARY KEY,

        -- Reference to the design/image
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
        image_url TEXT NOT NULL,

        -- Facebook listing info
        facebook_listing_id TEXT,
        listing_title TEXT NOT NULL,
        listing_price DECIMAL(10,2) DEFAULT 11.00,
        listing_status VARCHAR(50) DEFAULT 'pending',

        -- Tracking
        uploaded_at TIMESTAMP,
        last_refreshed_at TIMESTAMP,
        upload_attempts INTEGER DEFAULT 0,
        error_message TEXT,

        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        -- Ensure we don't upload same image twice
        UNIQUE(image_url)
      )
    `);
    console.log('✅ Created facebook_listings table');

    // Create index for faster lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_facebook_listings_status
      ON facebook_listings(listing_status)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_facebook_listings_order
      ON facebook_listings(order_id)
    `);
    console.log('✅ Created indexes');

    // Create a view for pending uploads
    await query(`
      CREATE OR REPLACE VIEW facebook_pending_uploads AS
      SELECT
        fl.*,
        o.order_number,
        oi.product_name,
        c.name as client_name
      FROM facebook_listings fl
      LEFT JOIN orders o ON fl.order_id = o.id
      LEFT JOIN order_items oi ON fl.order_item_id = oi.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE fl.listing_status = 'pending'
      ORDER BY fl.created_at ASC
    `);
    console.log('✅ Created facebook_pending_uploads view');

    console.log('🎉 Facebook Marketplace migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Run migration
migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
