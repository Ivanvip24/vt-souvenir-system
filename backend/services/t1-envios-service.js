/**
 * T1 Envíos Service
 * Integrates with T1's public APIs for tracking and product catalog
 * No authentication required — uses reverse-engineered public endpoints
 */

import { fetchWithTimeout } from '../shared/fetch-with-timeout.js';

const T1_TRACKING_BASE = process.env.T1_TRACKING_BASE || 'https://apiv2.t1envios.com/rastreo/public';
const T1_PRODUCTS_BASE = process.env.T1_PRODUCTS_BASE || 'https://rvka77opcl.execute-api.us-east-1.amazonaws.com/Prod/products';
const T1_STORE_ID = process.env.T1_STORE_ID || '208742';

// Simple in-memory cache
const cache = new Map();
const TRACKING_CACHE_TTL = 5 * 60 * 1000;   // 5 minutes
const PRODUCTS_CACHE_TTL = 30 * 60 * 1000;   // 30 minutes

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < ttl) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
  // Prevent unbounded growth
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/**
 * Get tracking status for a T1 shipment
 */
export async function getTrackingStatus(trackingNumber) {
  const cacheKey = `status:${trackingNumber}`;
  const cached = getCached(cacheKey, TRACKING_CACHE_TTL);
  if (cached) return cached;

  const resp = await fetchWithTimeout(`${T1_TRACKING_BASE}/estado-guia/${encodeURIComponent(trackingNumber)}`);
  if (!resp.ok) throw new Error(`T1 tracking API error: ${resp.status}`);
  const data = await resp.json();
  setCache(cacheKey, data);
  return data;
}

/**
 * Get detailed tracking info for a T1 shipment
 */
export async function getTrackingDetail(trackingNumber) {
  const cacheKey = `detail:${trackingNumber}`;
  const cached = getCached(cacheKey, TRACKING_CACHE_TTL);
  if (cached) return cached;

  const resp = await fetchWithTimeout(`${T1_TRACKING_BASE}/detail-guia/${encodeURIComponent(trackingNumber)}`);
  if (!resp.ok) throw new Error(`T1 detail API error: ${resp.status}`);
  const data = await resp.json();
  setCache(cacheKey, data);
  return data;
}

/**
 * Get combined tracking status + detail for a single shipment
 */
export async function getFullTracking(trackingNumber) {
  const [status, detail] = await Promise.allSettled([
    getTrackingStatus(trackingNumber),
    getTrackingDetail(trackingNumber)
  ]);

  return {
    trackingNumber,
    status: status.status === 'fulfilled' ? status.value : null,
    detail: detail.status === 'fulfilled' ? detail.value : null,
    error: status.status === 'rejected' ? status.reason.message : null
  };
}

/**
 * Get tracking for multiple shipments in parallel
 */
export async function getBulkTracking(trackingNumbers) {
  const results = await Promise.allSettled(
    trackingNumbers.map(tn => getFullTracking(tn))
  );

  return results.map((r, i) => ({
    trackingNumber: trackingNumbers[i],
    ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' })
  }));
}

/**
 * Search T1 product catalog
 */
export async function searchProducts(name, page = 1, limit = 20) {
  if (!name || name.trim().length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  const cacheKey = `products:${name}:${page}:${limit}`;
  const cached = getCached(cacheKey, PRODUCTS_CACHE_TTL);
  if (cached) return cached;

  const params = new URLSearchParams({
    storeId: T1_STORE_ID,
    name: name.trim(),
    limit: String(limit),
    page: String(page)
  });

  const resp = await fetchWithTimeout(`${T1_PRODUCTS_BASE}/?${params}`);
  if (!resp.ok) throw new Error(`T1 products API error: ${resp.status}`);
  const data = await resp.json();
  setCache(cacheKey, data);
  return data;
}

/**
 * Try to fetch the label PDF URL from T1's shipping detail page
 * Scrapes the same cdn.t1.com/labels/*.pdf pattern the frontend sync uses
 */
export async function getLabelUrl(trackingNumber) {
  try {
    const resp = await fetchWithTimeout(`https://t1envios.com/shippings/my-shippings/${encodeURIComponent(trackingNumber)}`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const match = html.match(/cdn\.t1\.com\/labels\/[^"'\s\\]+\.pdf/);
    return match ? 'https://' + match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Clear the tracking cache (useful when user wants fresh data)
 */
export function clearTrackingCache() {
  for (const key of cache.keys()) {
    if (key.startsWith('status:') || key.startsWith('detail:')) {
      cache.delete(key);
    }
  }
}

export default {
  getTrackingStatus,
  getTrackingDetail,
  getFullTracking,
  getBulkTracking,
  searchProducts,
  getLabelUrl,
  clearTrackingCache
};
