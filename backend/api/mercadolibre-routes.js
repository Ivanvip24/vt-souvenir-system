/**
 * Mercado Libre Integration Routes
 * OAuth, product publishing, and inventory sync
 */

import express from 'express';
import { query } from '../shared/database.js';
import * as mercadolibre from '../services/mercadolibre.js';

const router = express.Router();

// =====================================================
// OAUTH ROUTES
// =====================================================

/**
 * GET /api/mercadolibre/auth/status
 * Check if ML account is connected
 */
router.get('/auth/status', async (req, res) => {
  try {
    const connected = await mercadolibre.isConnected();

    if (connected) {
      const stats = await mercadolibre.getListingStats();
      res.json({
        connected: true,
        stats
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    console.error('Error checking ML connection:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/auth/connect
 * Redirect to ML authorization page
 */
router.get('/auth/connect', (req, res) => {
  try {
    const authUrl = mercadolibre.getAuthorizationUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/oauth/callback
 * Handle OAuth callback from ML
 */
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error('OAuth error:', error, error_description);
      return res.redirect('/admin-dashboard/?ml_error=' + encodeURIComponent(error_description || error));
    }

    if (!code) {
      return res.redirect('/admin-dashboard/?ml_error=no_code');
    }

    const result = await mercadolibre.exchangeCodeForTokens(code);
    console.log('ML account connected, user ID:', result.userId);

    res.redirect('/admin-dashboard/?ml_connected=true');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/admin-dashboard/?ml_error=' + encodeURIComponent(error.message));
  }
});

/**
 * POST /api/mercadolibre/auth/disconnect
 * Revoke ML connection
 */
router.post('/auth/disconnect', async (req, res) => {
  try {
    await mercadolibre.disconnect();
    res.json({ success: true, message: 'Mercado Libre account disconnected' });
  } catch (error) {
    console.error('Error disconnecting ML:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PRODUCT LISTING ROUTES
// =====================================================

/**
 * GET /api/mercadolibre/products
 * Get local products with ML listing status
 */
router.get('/products', async (req, res) => {
  try {
    const products = await mercadolibre.getProductsWithMLStatus();
    res.json({ products });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/products/:productId/listings
 * Get all ML listings for a product
 */
router.get('/products/:productId/listings', async (req, res) => {
  try {
    const { productId } = req.params;
    const listings = await mercadolibre.getListingsForProduct(parseInt(productId));
    res.json({ listings });
  } catch (error) {
    console.error('Error getting listings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/products/:productId/publish
 * Publish single product to selected sites
 */
router.post('/products/:productId/publish', async (req, res) => {
  try {
    const { productId } = req.params;
    const { siteIds, priceUsd, title, description, categoryId, quantity, listingType } = req.body;

    if (!siteIds || siteIds.length === 0) {
      return res.status(400).json({ error: 'At least one site must be selected' });
    }

    // Get product from database
    const productResult = await query(
      'SELECT * FROM products WHERE id = $1 AND is_active = true',
      [parseInt(productId)]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    // Publish to selected sites
    const results = await mercadolibre.bulkPublish(
      [product],
      siteIds,
      { priceUsd, title, description, categoryId, quantity, listingType }
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      success: failed.length === 0,
      message: `Published to ${successful.length}/${siteIds.length} sites`,
      results
    });
  } catch (error) {
    console.error('Error publishing product:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/products/bulk-publish
 * Bulk publish multiple products
 */
router.post('/products/bulk-publish', async (req, res) => {
  try {
    const { productIds, siteIds, options = {} } = req.body;

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({ error: 'At least one product must be selected' });
    }

    if (!siteIds || siteIds.length === 0) {
      return res.status(400).json({ error: 'At least one site must be selected' });
    }

    // Get products from database
    const productsResult = await query(
      'SELECT * FROM products WHERE id = ANY($1) AND is_active = true',
      [productIds]
    );

    if (productsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active products found' });
    }

    // Publish to selected sites
    const results = await mercadolibre.bulkPublish(productsResult.rows, siteIds, options);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      success: failed.length === 0,
      message: `Published ${successful.length}/${results.length} listings`,
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length
      }
    });
  } catch (error) {
    console.error('Error bulk publishing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/listings
 * Get all ML listings
 */
router.get('/listings', async (req, res) => {
  try {
    const { siteId, status } = req.query;

    let listingsQuery = `
      SELECT l.*, p.name as product_name, p.category as product_category
      FROM ml_listings l
      JOIN products p ON l.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (siteId) {
      params.push(siteId);
      listingsQuery += ` AND l.site_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      listingsQuery += ` AND l.status = $${params.length}`;
    }

    listingsQuery += ' ORDER BY l.created_at DESC';

    const result = await query(listingsQuery, params);
    res.json({ listings: result.rows });
  } catch (error) {
    console.error('Error getting listings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/mercadolibre/listings/:listingId
 * Update existing listing
 */
router.patch('/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { title, price, available_quantity } = req.body;

    // Get ML item ID from our database
    const listingResult = await query(
      'SELECT ml_item_id FROM ml_listings WHERE id = $1',
      [parseInt(listingId)]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const mlItemId = listingResult.rows[0].ml_item_id;
    const updateData = {};

    if (title) updateData.title = title;
    if (price) updateData.price = price;
    if (available_quantity !== undefined) updateData.available_quantity = available_quantity;

    const result = await mercadolibre.updateListing(mlItemId, updateData);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/listings/:listingId/pause
 * Pause listing
 */
router.post('/listings/:listingId/pause', async (req, res) => {
  try {
    const { listingId } = req.params;

    const listingResult = await query(
      'SELECT ml_item_id FROM ml_listings WHERE id = $1',
      [parseInt(listingId)]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const result = await mercadolibre.pauseListing(listingResult.rows[0].ml_item_id);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error pausing listing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/listings/:listingId/activate
 * Activate listing
 */
router.post('/listings/:listingId/activate', async (req, res) => {
  try {
    const { listingId } = req.params;

    const listingResult = await query(
      'SELECT ml_item_id FROM ml_listings WHERE id = $1',
      [parseInt(listingId)]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const result = await mercadolibre.activateListing(listingResult.rows[0].ml_item_id);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error activating listing:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/mercadolibre/listings/:listingId
 * Close/delete listing
 */
router.delete('/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;

    const listingResult = await query(
      'SELECT ml_item_id FROM ml_listings WHERE id = $1',
      [parseInt(listingId)]
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const result = await mercadolibre.closeListing(listingResult.rows[0].ml_item_id);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error closing listing:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// INVENTORY SYNC ROUTES
// =====================================================

/**
 * POST /api/mercadolibre/inventory/sync
 * Sync stock levels to ML (one-way push)
 */
router.post('/inventory/sync', async (req, res) => {
  try {
    const { productIds } = req.body;
    const result = await mercadolibre.syncInventoryToML(productIds);

    res.json({
      success: true,
      message: `Synced ${result.synced} listings, ${result.errors} errors`,
      ...result
    });
  } catch (error) {
    console.error('Error syncing inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/inventory/status
 * Get sync status for all listings
 */
router.get('/inventory/status', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        l.id,
        l.ml_item_id,
        l.site_id,
        l.available_quantity,
        l.sync_status,
        l.last_sync_at,
        p.name as product_name
      FROM ml_listings l
      JOIN products p ON l.product_id = p.id
      WHERE l.ml_item_id IS NOT NULL
      ORDER BY l.last_sync_at DESC NULLS LAST
    `);

    res.json({ listings: result.rows });
  } catch (error) {
    console.error('Error getting inventory status:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// CATEGORY ROUTES
// =====================================================

/**
 * GET /api/mercadolibre/categories/:siteId
 * Get category tree for a site
 */
router.get('/categories/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const categories = await mercadolibre.getCategoryTree(siteId);
    res.json({ categories });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/categories/:siteId/:categoryId/attributes
 * Get category attributes
 */
router.get('/categories/:siteId/:categoryId/attributes', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const attributes = await mercadolibre.getCategoryAttributes(categoryId);
    res.json({ attributes });
  } catch (error) {
    console.error('Error getting category attributes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/categories/predict
 * Predict best category for product
 */
router.post('/categories/predict', async (req, res) => {
  try {
    const { title, siteId } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const prediction = await mercadolibre.predictCategory(title, siteId || 'MLM');
    res.json({ prediction });
  } catch (error) {
    console.error('Error predicting category:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mercadolibre/category-mappings
 * Save local category to ML category mapping
 */
router.post('/category-mappings', async (req, res) => {
  try {
    const { localCategory, siteId, mlCategoryId, mlCategoryName } = req.body;

    if (!localCategory || !siteId || !mlCategoryId) {
      return res.status(400).json({ error: 'localCategory, siteId, and mlCategoryId are required' });
    }

    await mercadolibre.saveCategoryMapping(localCategory, siteId, mlCategoryId, mlCategoryName);
    res.json({ success: true, message: 'Category mapping saved' });
  } catch (error) {
    console.error('Error saving category mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/category-mappings
 * Get all category mappings
 */
router.get('/category-mappings', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM ml_category_mappings
      ORDER BY local_category, site_id
    `);
    res.json({ mappings: result.rows });
  } catch (error) {
    console.error('Error getting category mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// STATS & SYNC HISTORY
// =====================================================

/**
 * GET /api/mercadolibre/stats
 * Get overall ML integration stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await mercadolibre.getListingStats();

    // Get listings by site
    const bySite = await query(`
      SELECT site_id, COUNT(*) as count, COUNT(*) FILTER (WHERE status = 'active') as active
      FROM ml_listings
      WHERE ml_item_id IS NOT NULL
      GROUP BY site_id
    `);

    res.json({
      stats,
      bySite: bySite.rows,
      sites: mercadolibre.GLOBAL_SELLING_SITES
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mercadolibre/sync-history
 * Get recent sync history
 */
router.get('/sync-history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await query(`
      SELECT h.*, l.ml_item_id, l.title
      FROM ml_sync_history h
      LEFT JOIN ml_listings l ON h.listing_id = l.id
      ORDER BY h.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
