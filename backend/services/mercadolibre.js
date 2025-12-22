/**
 * Mercado Libre Global Selling API Service
 * Handles OAuth2 authentication and product listing operations
 */

import { config } from 'dotenv';
import { query } from '../shared/database.js';
import { retry, sleep } from '../shared/utils.js';

config();

// =====================================================
// CONFIGURATION
// =====================================================

const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'http://localhost:3000/api/mercadolibre/oauth/callback';
const ML_API_URL = 'https://api.mercadolibre.com';
const ML_AUTH_URL = 'https://auth.mercadolibre.com.mx';

// Default markup percentage from local price to USD
const ML_DEFAULT_MARKUP = parseFloat(process.env.ML_DEFAULT_MARKUP_PERCENT) || 30;

// Enabled sites for Global Selling
const ML_ENABLED_SITES = (process.env.ML_ENABLED_SITES || 'MLM,MLB,MLC,MCO').split(',');

// Global Selling supported sites
export const GLOBAL_SELLING_SITES = {
  MLM: { name: 'Mexico', currency: 'USD', localCurrency: 'MXN', flag: '🇲🇽' },
  MLB: { name: 'Brazil', currency: 'USD', localCurrency: 'BRL', flag: '🇧🇷' },
  MLC: { name: 'Chile', currency: 'USD', localCurrency: 'CLP', flag: '🇨🇱' },
  MCO: { name: 'Colombia', currency: 'USD', localCurrency: 'COP', flag: '🇨🇴' }
};

// Token cache (loaded from database)
let tokenCache = null;
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes

// Rate limiting
const ML_RATE_LIMIT_MS = 500; // 2 requests per second max

// =====================================================
// OAUTH2 FUNCTIONS
// =====================================================

/**
 * Generate authorization URL for user to connect their ML account
 */
export function getAuthorizationUrl(state = null) {
  if (!ML_CLIENT_ID) {
    throw new Error('ML_CLIENT_ID not configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ML_CLIENT_ID,
    redirect_uri: ML_REDIRECT_URI
  });

  if (state) {
    params.append('state', state);
  }

  return `${ML_AUTH_URL}/authorization?${params.toString()}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(authCode) {
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    throw new Error('Mercado Libre API credentials not configured');
  }

  console.log('🔑 Exchanging authorization code for tokens...');

  const response = await fetch(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code: authCode,
      redirect_uri: ML_REDIRECT_URI
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ OAuth token exchange failed:', errorText);
    throw new Error(`Failed to exchange code for tokens: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Got Mercado Libre access token');

  // Calculate expiry timestamp
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Save to database
  await saveTokens({
    userId: data.user_id.toString(),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope
  });

  // Update cache
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    user_id: data.user_id.toString()
  };

  return {
    userId: data.user_id,
    expiresAt,
    scope: data.scope
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken() {
  if (!tokenCache?.refresh_token) {
    // Try to load from database
    const dbToken = await loadTokensFromDB();
    if (!dbToken?.refresh_token) {
      throw new Error('No refresh token available. Please reconnect your Mercado Libre account.');
    }
    tokenCache = dbToken;
  }

  console.log('🔄 Refreshing Mercado Libre access token...');

  const response = await fetch(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: tokenCache.refresh_token
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Token refresh failed:', errorText);

    // Mark token as inactive
    await query(`UPDATE ml_oauth_tokens SET is_active = false WHERE is_active = true`);
    tokenCache = null;

    throw new Error('Token refresh failed. Please reconnect your Mercado Libre account.');
  }

  const data = await response.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Update database
  await saveTokens({
    userId: data.user_id.toString(),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope
  });

  // Update cache
  tokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    user_id: data.user_id.toString()
  };

  console.log('✅ Token refreshed successfully');
  return tokenCache.access_token;
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken() {
  // Check cache first
  if (tokenCache?.access_token && tokenCache.expires_at) {
    const expiresAt = new Date(tokenCache.expires_at);
    if (Date.now() < expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS) {
      return tokenCache.access_token;
    }
  }

  // Try to load from database
  if (!tokenCache) {
    const dbToken = await loadTokensFromDB();
    if (dbToken) {
      tokenCache = dbToken;
      const expiresAt = new Date(tokenCache.expires_at);
      if (Date.now() < expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS) {
        return tokenCache.access_token;
      }
    }
  }

  // Need to refresh
  if (tokenCache?.refresh_token) {
    return await refreshAccessToken();
  }

  throw new Error('No valid Mercado Libre token. Please connect your account.');
}

/**
 * Save tokens to database
 */
async function saveTokens({ userId, accessToken, refreshToken, expiresAt, scope }) {
  // Deactivate old tokens
  await query(`UPDATE ml_oauth_tokens SET is_active = false WHERE is_active = true`);

  // Insert new token
  await query(`
    INSERT INTO ml_oauth_tokens (user_id, access_token, refresh_token, expires_at, scope, site_ids, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, true)
  `, [userId, accessToken, refreshToken, expiresAt, scope, ML_ENABLED_SITES]);
}

/**
 * Load active token from database
 */
async function loadTokensFromDB() {
  const result = await query(`
    SELECT user_id, access_token, refresh_token, expires_at, site_ids
    FROM ml_oauth_tokens
    WHERE is_active = true
    ORDER BY id DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    user_id: row.user_id,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    site_ids: row.site_ids
  };
}

/**
 * Check if ML account is connected
 */
export async function isConnected() {
  try {
    const token = await loadTokensFromDB();
    return !!token;
  } catch {
    return false;
  }
}

/**
 * Disconnect ML account
 */
export async function disconnect() {
  await query(`UPDATE ml_oauth_tokens SET is_active = false WHERE is_active = true`);
  tokenCache = null;
  console.log('✅ Mercado Libre account disconnected');
}

// =====================================================
// AUTHENTICATED FETCH
// =====================================================

/**
 * Make authenticated request to Mercado Libre API
 */
export async function mlFetch(endpoint, options = {}) {
  const token = await getValidAccessToken();
  const url = endpoint.startsWith('http') ? endpoint : `${ML_API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });

  return response;
}

// =====================================================
// CATEGORY FUNCTIONS
// =====================================================

/**
 * Get category tree for a site
 */
export async function getCategoryTree(siteId = 'MLM') {
  const response = await mlFetch(`/sites/${siteId}/categories`);

  if (!response.ok) {
    throw new Error(`Failed to get categories: ${response.status}`);
  }

  return await response.json();
}

/**
 * Get category attributes (required fields for listing)
 */
export async function getCategoryAttributes(categoryId) {
  const response = await mlFetch(`/categories/${categoryId}/attributes`);

  if (!response.ok) {
    throw new Error(`Failed to get category attributes: ${response.status}`);
  }

  return await response.json();
}

/**
 * Predict category for a product title
 */
export async function predictCategory(title, siteId = 'MLM') {
  const response = await mlFetch(`/sites/${siteId}/domain_discovery/search?q=${encodeURIComponent(title)}`);

  if (!response.ok) {
    throw new Error(`Failed to predict category: ${response.status}`);
  }

  const results = await response.json();
  return results[0] || null;
}

/**
 * Save category mapping
 */
export async function saveCategoryMapping(localCategory, siteId, mlCategoryId, mlCategoryName) {
  await query(`
    INSERT INTO ml_category_mappings (local_category, site_id, ml_category_id, ml_category_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (local_category, site_id)
    DO UPDATE SET ml_category_id = $3, ml_category_name = $4
  `, [localCategory, siteId, mlCategoryId, mlCategoryName]);
}

/**
 * Get category mapping
 */
export async function getCategoryMapping(localCategory, siteId) {
  const result = await query(`
    SELECT ml_category_id, ml_category_name
    FROM ml_category_mappings
    WHERE local_category = $1 AND site_id = $2
  `, [localCategory, siteId]);

  return result.rows[0] || null;
}

// =====================================================
// PRODUCT LISTING FUNCTIONS
// =====================================================

/**
 * Create a new listing on Mercado Libre
 */
export async function createListing(productData, siteId = 'MLM') {
  console.log(`📦 Creating listing on ${siteId}...`);

  // For Global Selling, use the global endpoint
  const endpoint = '/items';

  const listingPayload = {
    title: productData.title,
    category_id: productData.categoryId,
    price: productData.priceUsd,
    currency_id: 'USD',
    available_quantity: productData.quantity || 1,
    buying_mode: 'buy_it_now',
    condition: productData.condition || 'new',
    listing_type_id: productData.listingType || 'gold_special',
    description: productData.description ? { plain_text: productData.description } : undefined,
    pictures: productData.pictures?.map(url => ({ source: url })) || [],
    attributes: productData.attributes || [],
    shipping: {
      mode: 'me2',
      free_shipping: false
    }
  };

  // Add site_id for regular (non-global) listings
  if (!productData.isGlobal) {
    listingPayload.site_id = siteId;
  }

  console.log('📤 Listing payload:', JSON.stringify(listingPayload, null, 2));

  const response = await retry(async () => {
    const res = await mlFetch(endpoint, {
      method: 'POST',
      body: listingPayload
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('❌ ML API Error:', errorData);
      throw new Error(errorData.message || errorData.error || JSON.stringify(errorData.cause));
    }

    return res;
  }, 3, 1000);

  const result = await response.json();
  console.log(`✅ Listing created: ${result.id}`);

  // Save to database
  await query(`
    INSERT INTO ml_listings (
      product_id, ml_item_id, site_id, title, description,
      price_usd, listing_type, condition, category_id,
      status, sync_status, available_quantity, permalink, thumbnail_url, published_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', $11, $12, $13, NOW())
    ON CONFLICT (ml_item_id) DO UPDATE SET
      status = $10,
      sync_status = 'synced',
      last_sync_at = NOW()
  `, [
    productData.productId,
    result.id,
    siteId,
    productData.title,
    productData.description,
    productData.priceUsd,
    productData.listingType || 'gold_special',
    productData.condition || 'new',
    productData.categoryId,
    result.status,
    productData.quantity || 1,
    result.permalink,
    result.thumbnail
  ]);

  // Log sync history
  await logSyncHistory(null, 'create', { productData, siteId }, result, 'success');

  return result;
}

/**
 * Update an existing listing
 */
export async function updateListing(mlItemId, updateData) {
  console.log(`📝 Updating listing ${mlItemId}...`);

  const response = await retry(async () => {
    const res = await mlFetch(`/items/${mlItemId}`, {
      method: 'PUT',
      body: updateData
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || JSON.stringify(errorData.cause));
    }

    return res;
  }, 3, 1000);

  const result = await response.json();

  // Update local database
  await query(`
    UPDATE ml_listings
    SET
      title = COALESCE($2, title),
      price_usd = COALESCE($3, price_usd),
      available_quantity = COALESCE($4, available_quantity),
      status = COALESCE($5, status),
      sync_status = 'synced',
      last_sync_at = NOW(),
      updated_at = NOW()
    WHERE ml_item_id = $1
  `, [
    mlItemId,
    updateData.title,
    updateData.price,
    updateData.available_quantity,
    result.status
  ]);

  console.log(`✅ Listing updated: ${mlItemId}`);
  return result;
}

/**
 * Pause a listing
 */
export async function pauseListing(mlItemId) {
  console.log(`⏸️ Pausing listing ${mlItemId}...`);

  const response = await mlFetch(`/items/${mlItemId}`, {
    method: 'PUT',
    body: { status: 'paused' }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to pause listing');
  }

  await query(`
    UPDATE ml_listings SET status = 'paused', sync_status = 'synced', last_sync_at = NOW()
    WHERE ml_item_id = $1
  `, [mlItemId]);

  console.log(`✅ Listing paused: ${mlItemId}`);
  return await response.json();
}

/**
 * Activate a paused listing
 */
export async function activateListing(mlItemId) {
  console.log(`▶️ Activating listing ${mlItemId}...`);

  const response = await mlFetch(`/items/${mlItemId}`, {
    method: 'PUT',
    body: { status: 'active' }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to activate listing');
  }

  await query(`
    UPDATE ml_listings SET status = 'active', sync_status = 'synced', last_sync_at = NOW()
    WHERE ml_item_id = $1
  `, [mlItemId]);

  console.log(`✅ Listing activated: ${mlItemId}`);
  return await response.json();
}

/**
 * Close/delete a listing
 */
export async function closeListing(mlItemId) {
  console.log(`🗑️ Closing listing ${mlItemId}...`);

  const response = await mlFetch(`/items/${mlItemId}`, {
    method: 'PUT',
    body: { status: 'closed' }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to close listing');
  }

  await query(`
    UPDATE ml_listings SET status = 'closed', sync_status = 'synced', last_sync_at = NOW()
    WHERE ml_item_id = $1
  `, [mlItemId]);

  console.log(`✅ Listing closed: ${mlItemId}`);
  return await response.json();
}

// =====================================================
// INVENTORY SYNC FUNCTIONS
// =====================================================

/**
 * Update stock for a single listing
 */
export async function updateStock(mlItemId, quantity) {
  console.log(`📊 Updating stock for ${mlItemId} to ${quantity}...`);

  const response = await mlFetch(`/items/${mlItemId}`, {
    method: 'PUT',
    body: { available_quantity: quantity }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to update stock');
  }

  await query(`
    UPDATE ml_listings
    SET available_quantity = $2, sync_status = 'synced', last_sync_at = NOW()
    WHERE ml_item_id = $1
  `, [mlItemId, quantity]);

  console.log(`✅ Stock updated for ${mlItemId}`);
  return await response.json();
}

/**
 * Bulk update stock for multiple listings
 */
export async function bulkUpdateStock(items) {
  console.log(`📊 Bulk updating stock for ${items.length} items...`);

  const results = [];

  for (const item of items) {
    try {
      const result = await updateStock(item.mlItemId, item.quantity);
      results.push({ mlItemId: item.mlItemId, success: true, result });
    } catch (error) {
      results.push({ mlItemId: item.mlItemId, success: false, error: error.message });
    }

    // Rate limiting
    await sleep(ML_RATE_LIMIT_MS);
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Bulk stock update complete: ${successCount}/${items.length} successful`);

  return results;
}

/**
 * Sync inventory from local database to ML
 */
export async function syncInventoryToML(productIds = null) {
  console.log('🔄 Syncing inventory to Mercado Libre...');

  let listingsQuery = `
    SELECT l.ml_item_id, l.product_id, p.name
    FROM ml_listings l
    JOIN products p ON l.product_id = p.id
    WHERE l.status = 'active' AND l.ml_item_id IS NOT NULL
  `;

  const params = [];
  if (productIds && productIds.length > 0) {
    listingsQuery += ` AND l.product_id = ANY($1)`;
    params.push(productIds);
  }

  const listings = await query(listingsQuery, params);

  if (listings.rows.length === 0) {
    console.log('ℹ️ No active listings to sync');
    return { synced: 0, errors: 0 };
  }

  // For now, set stock to 100 for all active products
  // In a real implementation, you'd fetch actual inventory levels
  const DEFAULT_STOCK = 100;

  const items = listings.rows.map(row => ({
    mlItemId: row.ml_item_id,
    quantity: DEFAULT_STOCK
  }));

  const results = await bulkUpdateStock(items);

  return {
    synced: results.filter(r => r.success).length,
    errors: results.filter(r => !r.success).length,
    details: results
  };
}

// =====================================================
// BULK OPERATIONS
// =====================================================

/**
 * Publish multiple products to multiple sites
 */
export async function bulkPublish(products, siteIds, options = {}) {
  console.log(`📦 Bulk publishing ${products.length} products to ${siteIds.length} sites...`);

  const results = [];

  for (const product of products) {
    for (const siteId of siteIds) {
      try {
        // Get or predict category
        let categoryId = options.categoryId;
        if (!categoryId) {
          const mapping = await getCategoryMapping(product.category, siteId);
          if (mapping) {
            categoryId = mapping.ml_category_id;
          } else {
            const prediction = await predictCategory(product.name, siteId);
            categoryId = prediction?.category_id;
          }
        }

        if (!categoryId) {
          throw new Error('Could not determine category');
        }

        // Calculate USD price
        const priceUsd = options.priceUsd || calculateUsdPrice(product.base_price);

        const listingData = {
          productId: product.id,
          title: options.title || product.name,
          description: options.description || product.description,
          priceUsd,
          categoryId,
          quantity: options.quantity || 100,
          condition: options.condition || 'new',
          listingType: options.listingType || 'gold_special',
          pictures: product.image_url ? [product.image_url] : []
        };

        const result = await createListing(listingData, siteId);
        results.push({
          productId: product.id,
          productName: product.name,
          siteId,
          success: true,
          mlItemId: result.id,
          permalink: result.permalink
        });

      } catch (error) {
        console.error(`❌ Failed to publish ${product.name} to ${siteId}:`, error.message);
        results.push({
          productId: product.id,
          productName: product.name,
          siteId,
          success: false,
          error: error.message
        });

        // Log sync error
        await logSyncHistory(null, 'create', { product, siteId }, null, 'error', error.message);
      }

      // Rate limiting
      await sleep(ML_RATE_LIMIT_MS);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Bulk publish complete: ${successCount}/${results.length} successful`);

  return results;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate USD price from local price with markup
 */
function calculateUsdPrice(localPrice) {
  // Assuming local price is in MXN
  // This is a simplified calculation - in production you'd use a real exchange rate
  const MXN_TO_USD = 0.058; // Approximate
  const usdPrice = parseFloat(localPrice) * MXN_TO_USD * (1 + ML_DEFAULT_MARKUP / 100);
  return Math.ceil(usdPrice * 100) / 100; // Round up to 2 decimals
}

/**
 * Log sync operation to history
 */
async function logSyncHistory(listingId, syncType, requestData, responseData, status, errorMessage = null) {
  try {
    await query(`
      INSERT INTO ml_sync_history (listing_id, sync_type, request_data, response_data, status, error_message)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      listingId,
      syncType,
      JSON.stringify(requestData),
      responseData ? JSON.stringify(responseData) : null,
      status,
      errorMessage
    ]);
  } catch (error) {
    console.error('Failed to log sync history:', error.message);
  }
}

/**
 * Get products with their ML listing status
 */
export async function getProductsWithMLStatus() {
  const result = await query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.base_price,
      p.category,
      p.image_url,
      p.is_active,
      COALESCE(
        json_agg(
          json_build_object(
            'id', l.id,
            'ml_item_id', l.ml_item_id,
            'site_id', l.site_id,
            'status', l.status,
            'price_usd', l.price_usd,
            'permalink', l.permalink,
            'sync_status', l.sync_status
          )
        ) FILTER (WHERE l.id IS NOT NULL),
        '[]'
      ) as ml_listings
    FROM products p
    LEFT JOIN ml_listings l ON p.id = l.product_id
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.name
  `);

  return result.rows;
}

/**
 * Get all listings for a product
 */
export async function getListingsForProduct(productId) {
  const result = await query(`
    SELECT *
    FROM ml_listings
    WHERE product_id = $1
    ORDER BY site_id
  `, [productId]);

  return result.rows;
}

/**
 * Get listing stats summary
 */
export async function getListingStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total_listings,
      COUNT(*) FILTER (WHERE status = 'active') as active_listings,
      COUNT(*) FILTER (WHERE status = 'paused') as paused_listings,
      COUNT(DISTINCT product_id) as products_listed,
      COUNT(DISTINCT site_id) as sites_used,
      SUM(sold_quantity) as total_sold
    FROM ml_listings
    WHERE ml_item_id IS NOT NULL
  `);

  return result.rows[0];
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  // OAuth
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  isConnected,
  disconnect,

  // API
  mlFetch,

  // Categories
  getCategoryTree,
  getCategoryAttributes,
  predictCategory,
  saveCategoryMapping,
  getCategoryMapping,

  // Listings
  createListing,
  updateListing,
  pauseListing,
  activateListing,
  closeListing,

  // Inventory
  updateStock,
  bulkUpdateStock,
  syncInventoryToML,

  // Bulk operations
  bulkPublish,

  // Helpers
  getProductsWithMLStatus,
  getListingsForProduct,
  getListingStats,

  // Constants
  GLOBAL_SELLING_SITES,
  ML_ENABLED_SITES
};
