/**
 * Skydropx API Service
 * Handles OAuth2 authentication and shipping operations
 */

import { config } from 'dotenv';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';
import { fetchWithTimeout } from '../shared/fetch-with-timeout.js';
config();

// Token cache
let cachedToken = null;
let tokenExpiry = null;

// Configuration
const SKYDROPX_CLIENT_ID = process.env.SKYDROPX_API_KEY;
const SKYDROPX_CLIENT_SECRET = process.env.SKYDROPX_API_SECRET;
const SKYDROPX_API_URL = process.env.SKYDROPX_API_URL || 'https://api.skydropx.com/v1';

// Default SAT codes for Carta Porte
const DEFAULT_CONSIGNMENT_NOTE = '24121500'; // General merchandise
const DEFAULT_PACKAGE_TYPE = '4G'; // Cardboard boxes

// Skydropx character limits
const MAX_NAME_LENGTH = 30;
const MAX_STREET_LENGTH = 35;
const MAX_REFERENCE_LENGTH = 30;

// Fixed origin address (AXKAN office)
let ORIGIN_ADDRESS = {
  name: 'VT Anunciando',
  company: 'VT Anunciando',
  street: 'Av. Morelos',
  number: '26',
  neighborhood: 'Artes Graficas',
  city: 'Cuauhtemoc',
  state: 'Ciudad de Mexico',
  zip: '15830',
  phone: '5538253251',
  email: 'valenciaperezivan24@gmail.com',
  reference: 'Interior 3'
};

/**
 * Update origin address at runtime (called when admin changes it)
 */
export function updateOriginAddress(newAddress) {
  ORIGIN_ADDRESS = { ...ORIGIN_ADDRESS, ...newAddress };
  log('info', 'skydropx.origin.updated', { street: ORIGIN_ADDRESS.street, number: ORIGIN_ADDRESS.number });
}

/**
 * Load origin address from database on startup
 */
export async function loadOriginAddress() {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'origin_address'`
    );
    if (result.rows.length > 0) {
      ORIGIN_ADDRESS = { ...ORIGIN_ADDRESS, ...result.rows[0].value };
      log('info', 'skydropx.origin.loaded', { street: ORIGIN_ADDRESS.street, number: ORIGIN_ADDRESS.number });
    }
  } catch (err) {
    // Table might not exist yet on first run, use default
    log('info', 'skydropx.origin.default');
  }
}

// Default package dimensions
const DEFAULT_PACKAGE = {
  weight: 3,
  length: 30,
  width: 25,
  height: 20
};

/**
 * Truncate string to max length
 */
function truncate(str, maxLen) {
  if (!str) return str;
  return str.length > maxLen ? str.substring(0, maxLen).trim() : str;
}

/**
 * Sanitize text for Skydropx name fields — ONLY letters, numbers, spaces, apostrophes.
 * Skydropx explicitly rejects periods, hyphens, slashes, accents, and everything else.
 */
function sanitizeForSkydropx(str) {
  if (!str) return str;
  // Normalize accented characters to ASCII (ñ→n, é→e, etc.)
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Keep ONLY what Skydropx allows: letters, numbers, spaces, apostrophes
  return normalized.replace(/[^a-zA-Z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Sanitize text for Skydropx street/reference fields — slightly more permissive.
 */
function sanitizeStreetForSkydropx(str) {
  if (!str) return str;
  const normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Streets allow #, periods, hyphens in addition to letters/numbers/spaces
  return normalized.replace(/[^a-zA-Z0-9\s'.#-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a phone number — digits only, ensure 10 digits for MX.
 */
function sanitizePhone(phone) {
  if (!phone) return '0000000000';
  // Strip everything except digits
  let digits = phone.replace(/\D/g, '');
  // Remove country code prefix (52 for MX, 1 for US)
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  // Must be 10 digits
  if (digits.length < 10) digits = digits.padEnd(10, '0');
  if (digits.length > 10) digits = digits.slice(0, 10);
  return digits;
}

/**
 * Normalize a postal code — digits only, 5 chars, zero-padded.
 */
function sanitizePostalCode(postal) {
  if (!postal) return '';
  const digits = String(postal).replace(/\D/g, '');
  return digits.padStart(5, '0').slice(0, 5);
}

/**
 * Normalize an email — trim, lowercase, provide fallback.
 */
function sanitizeEmail(email) {
  if (!email || !email.includes('@')) return 'cliente@example.com';
  return email.trim().toLowerCase();
}

/**
 * Build a clean Skydropx-ready address from possibly messy client data.
 */
function buildCleanAddress(addr) {
  return {
    name: truncate(sanitizeForSkydropx(addr.name || 'Cliente'), MAX_NAME_LENGTH),
    company: truncate(sanitizeForSkydropx(addr.name || 'Cliente'), MAX_NAME_LENGTH),
    street1: truncate(sanitizeStreetForSkydropx(
      `${addr.street || 'Calle'} ${addr.street_number || addr.number || 'S/N'}`.trim()
    ), MAX_STREET_LENGTH),
    neighborhood: truncate(sanitizeForSkydropx(addr.colonia || addr.neighborhood || 'Centro'), MAX_NAME_LENGTH),
    postal_code: sanitizePostalCode(addr.zip || addr.postal || addr.postal_code),
    area_level1: sanitizeForSkydropx(addr.state || 'Estado'),
    area_level2: sanitizeForSkydropx(addr.city || 'Ciudad'),
    area_level3: truncate(sanitizeForSkydropx(addr.colonia || addr.neighborhood || 'Centro'), MAX_NAME_LENGTH),
    country_code: 'MX',
    phone: sanitizePhone(addr.phone),
    email: sanitizeEmail(addr.email),
    reference: truncate(sanitizeStreetForSkydropx(addr.reference_notes || addr.reference || 'Sin referencia'), MAX_REFERENCE_LENGTH)
  };
}

/**
 * Get OAuth2 access token
 */
export async function getAccessToken() {
  // Check cached token (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!SKYDROPX_CLIENT_ID || !SKYDROPX_CLIENT_SECRET) {
    throw new Error('Skydropx API credentials not configured');
  }

  log('info', 'skydropx.token.request');

  const response = await fetchWithTimeout(`${SKYDROPX_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: SKYDROPX_CLIENT_ID,
      client_secret: SKYDROPX_CLIENT_SECRET
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('error', 'skydropx.token.error', { status: response.status, body: errorText });
    throw new Error(`Failed to get Skydropx access token: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 7200) * 1000;

  log('info', 'skydropx.token.success');
  return cachedToken;
}

/**
 * Make authenticated request to Skydropx
 */
export async function skydropxFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  const url = endpoint.startsWith('http') ? endpoint : `${SKYDROPX_API_URL}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
}

/**
 * Get shipping quote for a destination with retry logic
 * @param {number} packagesCount - Number of packages for multiguía (default 1)
 */
export async function getQuote(destAddress, packageInfo = DEFAULT_PACKAGE, packagesCount = 1, retryCount = 0) {
  const MAX_RETRIES = 2;

  // Build parcels array for multiguía
  const parcels = [];
  for (let i = 0; i < packagesCount; i++) {
    parcels.push({
      weight: packageInfo.weight || DEFAULT_PACKAGE.weight,
      length: packageInfo.length || DEFAULT_PACKAGE.length,
      width: packageInfo.width || DEFAULT_PACKAGE.width,
      height: packageInfo.height || DEFAULT_PACKAGE.height
    });
  }

  const quotationPayload = {
    quotation: {
      address_from: {
        country_code: 'MX',
        postal_code: sanitizePostalCode(ORIGIN_ADDRESS.zip),
        area_level1: sanitizeForSkydropx(ORIGIN_ADDRESS.state),
        area_level2: sanitizeForSkydropx(ORIGIN_ADDRESS.city),
        area_level3: sanitizeForSkydropx(ORIGIN_ADDRESS.neighborhood)
      },
      address_to: {
        country_code: 'MX',
        postal_code: sanitizePostalCode(destAddress.zip || destAddress.postal || destAddress.postal_code),
        area_level1: sanitizeForSkydropx(destAddress.state || 'Estado'),
        area_level2: sanitizeForSkydropx(destAddress.city || 'Ciudad'),
        area_level3: sanitizeForSkydropx(destAddress.colonia || destAddress.neighborhood || 'Colonia')
      },
      parcels: parcels
    }
  };

  log('info', 'skydropx.quote.request', { packagesCount });

  try {
    const response = await skydropxFetch('/quotations', {
      method: 'POST',
      body: JSON.stringify(quotationPayload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = 'Error getting quote from Skydropx';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || JSON.stringify(errorData.errors);
      } catch (e) {}
      throw new Error(errorMessage);
    }

    const result = JSON.parse(responseText);
    log('info', 'skydropx.quote.response', { rateCount: result.rates?.length || 0 });

    // Parse rates - only filter out rates that are out_of_area or have no price
    const rates = (result.rates || [])
      .filter(rate => {
        // Include rate if it has a price and is not out of area
        const hasPrice = rate.total && parseFloat(rate.total) > 0;
        const isAvailable = rate.out_of_area !== true && rate.success !== false;
        if (!hasPrice || !isAvailable) {
        }
        return hasPrice && isAvailable;
      })
      .map(rate => ({
        rate_id: rate.id,
        carrier: rate.provider_display_name || rate.provider_name,
        carrier_code: rate.provider_name?.toUpperCase(),
        service: rate.provider_service_name,
        service_code: rate.provider_service_code,
        total_price: parseFloat(rate.total) || 0,
        days: rate.days || estimateDeliveryDays(rate.provider_service_code)
      }))
      .sort((a, b) => a.total_price - b.total_price);

    log('info', 'skydropx.quote.filtered', { available: rates.length });

    // If all rates were filtered out, diagnose why
    let diagnosis = null;
    if (rates.length === 0 && result.rates && result.rates.length > 0) {
      const allOutOfArea = result.rates.every(r => r.out_of_area === true);
      const allFailed = result.rates.every(r => r.success === false);
      const allNoPrice = result.rates.every(r => !r.total || parseFloat(r.total) <= 0);

      if (allOutOfArea) {
        diagnosis = 'FUERA_DE_AREA';
      } else if (allNoPrice && allFailed) {
        diagnosis = 'CP_NO_RECONOCIDO';
      } else if (allFailed) {
        diagnosis = 'DIRECCION_INVALIDA';
      } else {
        diagnosis = 'SIN_COBERTURA';
      }
      log('warn', 'skydropx.quote.no_rates', { totalRates: result.rates.length, diagnosis });
    }

    return {
      quotation_id: result.id,
      rates,
      diagnosis
    };
  } catch (error) {
    // Retry on failure
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s exponential backoff
      log('warn', 'skydropx.quote.retry', { attempt: retryCount + 1, maxRetries: MAX_RETRIES, delayMs: delay });
      await new Promise(resolve => setTimeout(resolve, delay));
      return getQuote(destAddress, packageInfo, packagesCount, retryCount + 1);
    }
    logError('skydropx.quote.failed', error);
    throw error;
  }
}

/**
 * Create shipment and generate label (supports multiguía with multiple packages)
 * @param {number} packagesCount - Number of packages/boxes in this shipment (default 1)
 */
export async function createShipment(quotationId, rateId, rate, destAddress, packageInfo = DEFAULT_PACKAGE, packagesCount = 1) {
  // Build packages array for multiguía
  const packages = [];
  for (let i = 0; i < packagesCount; i++) {
    packages.push({
      package_number: i + 1,
      weight: packageInfo.weight || DEFAULT_PACKAGE.weight,
      height: packageInfo.height || DEFAULT_PACKAGE.height,
      width: packageInfo.width || DEFAULT_PACKAGE.width,
      length: packageInfo.length || DEFAULT_PACKAGE.length,
      dimension_unit: 'CM',
      mass_unit: 'KG',
      quantity: 1,
      consignment_note: DEFAULT_CONSIGNMENT_NOTE,
      package_type: DEFAULT_PACKAGE_TYPE
    });
  }

  // Build clean, Skydropx-safe addresses from possibly messy client data
  const cleanOrigin = buildCleanAddress(ORIGIN_ADDRESS);
  const cleanDest = buildCleanAddress(destAddress);

  const shipmentPayload = {
    shipment: {
      quotation_id: quotationId,
      rate_id: rateId,
      address_from: cleanOrigin,
      address_to: cleanDest,
      packages: packages
    }
  };

  log('info', 'skydropx.shipment.create', { packagesCount });

  const response = await skydropxFetch('/shipments', {
    method: 'POST',
    body: JSON.stringify(shipmentPayload)
  });

  const responseText = await response.text();
  log('info', 'skydropx.shipment.response', { status: response.status });

  if (!response.ok) {
    let errorMessage = 'Error creating shipment in Skydropx';
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.errors) {
        if (typeof errorData.errors === 'string') {
          errorMessage = errorData.errors;
        } else {
          const messages = [];
          for (const [field, msgs] of Object.entries(errorData.errors)) {
            if (Array.isArray(msgs)) {
              messages.push(`${field}: ${msgs.join(', ')}`);
            }
          }
          errorMessage = messages.join('; ') || errorMessage;
        }
      }
    } catch (e) {}
    throw new Error(errorMessage);
  }

  const result = JSON.parse(responseText);
  log('info', 'skydropx.shipment.created');

  // Extract data from response
  const shipmentData = result.data?.attributes || result.data || result;
  const shipmentId = result.data?.id || shipmentData.id;

  // Extract ALL packages from response (for multiguía)
  const allPackages = result.included?.filter(i => i.type === 'package') || [];
  log('info', 'skydropx.shipment.packages', { count: allPackages.length });

  // Get master tracking number
  let masterTrackingNumber = shipmentData.master_tracking_number;

  // Build packages array with individual tracking numbers and labels
  let packagesData = allPackages.map((pkg, index) => ({
    package_number: index + 1,
    tracking_number: pkg.attributes?.tracking_number,
    tracking_url: pkg.attributes?.tracking_url_provider,
    label_url: pkg.attributes?.label_url
  }));

  // If no packages data immediately, poll for it
  if (packagesData.length === 0 || !packagesData[0]?.tracking_number) {
    log('info', 'skydropx.shipment.polling');
    const MAX_POLLS = 5;
    const POLL_DELAY_MS = 3000;

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));

      try {
        const pollResponse = await skydropxFetch(`/shipments/${shipmentId}`);
        if (pollResponse.ok) {
          const pollResult = await pollResponse.json();
          const pollShipmentData = pollResult.data?.attributes || pollResult.data || pollResult;
          const pollPackages = pollResult.included?.filter(item => item.type === 'package') || [];

          masterTrackingNumber = pollShipmentData.master_tracking_number || masterTrackingNumber;

          if (pollPackages.length > 0 && pollPackages[0].attributes?.tracking_number) {
            packagesData = pollPackages.map((pkg, index) => ({
              package_number: index + 1,
              tracking_number: pkg.attributes?.tracking_number,
              tracking_url: pkg.attributes?.tracking_url_provider,
              label_url: pkg.attributes?.label_url
            }));
            log('info', 'skydropx.shipment.poll_success', { packages: packagesData.length, polls: i + 1 });
            break;
          }
          log('info', 'skydropx.shipment.poll_waiting', { poll: i + 1, maxPolls: MAX_POLLS });
        }
      } catch (pollError) {
        log('warn', 'skydropx.shipment.poll_error', { poll: i + 1, error: pollError.message });
      }
    }
  }

  // For backward compatibility, also return first package data at top level
  const firstPackage = packagesData[0] || {};

  return {
    shipment_id: shipmentId,
    master_tracking_number: masterTrackingNumber,
    tracking_number: firstPackage.tracking_number || masterTrackingNumber,
    tracking_url: firstPackage.tracking_url,
    label_url: firstPackage.label_url,
    carrier: rate.carrier,
    service: rate.service,
    delivery_days: rate.days,
    shipping_cost: rate.total_price,
    status: shipmentData.workflow_status || 'processing',
    packages_count: packagesData.length || packagesCount,
    packages: packagesData // All packages with their individual tracking/labels
  };
}

/**
 * Get shipment details
 */
export async function getShipment(shipmentId) {
  const response = await skydropxFetch(`/shipments/${shipmentId}`);

  if (!response.ok) {
    throw new Error('Shipment not found');
  }

  const result = await response.json();
  const shipmentData = result.data?.attributes || result.data || result;
  const packageData = result.included?.find(i => i.type === 'package')?.attributes || {};

  return {
    shipment_id: result.data?.id,
    tracking_number: packageData.tracking_number || shipmentData.master_tracking_number,
    tracking_url: packageData.tracking_url_provider,
    label_url: packageData.label_url,
    status: shipmentData.workflow_status
  };
}

/**
 * Estimate delivery days
 */
function estimateDeliveryDays(serviceCode) {
  const code = (serviceCode || '').toLowerCase();
  if (code.includes('overnight') || code.includes('next_day')) return 1;
  if (code.includes('express') || code.includes('priority')) return 2;
  if (code.includes('standard') || code.includes('terrestre')) return 5;
  if (code.includes('nacional')) return 3;
  return 3;
}

/**
 * Auto-select best rate (cheapest)
 */
export function selectBestRate(rates) {
  if (!rates || rates.length === 0) return null;
  // Already sorted by price
  return rates[0];
}

/**
 * Generate shipping label for an order
 * Combines: getQuote -> selectBestRate -> createShipment -> save to database
 */
export async function generateShippingLabel({ orderId, clientId, destination }) {
  // Retry logic for transient failures
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log('info', 'skydropx.label.start', { orderId, attempt, maxRetries: MAX_RETRIES });

      // Step 1: Get quote
      const destAddress = {
        name: destination.name,
        street: destination.street,
        number: destination.number || 'S/N',
        neighborhood: destination.neighborhood || '',
        city: destination.city,
        state: destination.state,
        zip: destination.zip,
        phone: destination.phone || '',
        email: destination.email || '',
        reference: destination.reference || ''
      };

      log('info', 'skydropx.label.quoting', { orderId });
      const quoteResult = await getQuote(destAddress);

      // Check if we got rates (getQuote returns { quotation_id, rates })
      if (!quoteResult.rates || quoteResult.rates.length === 0) {
        lastError = 'No shipping rates available';
        log('warn', 'skydropx.label.no_rates', { orderId, attempt });
        // Clear token cache and retry
        cachedToken = null;
        tokenExpiry = null;
        continue;
      }

      // Step 2: Select best rate (cheapest)
      const bestRate = selectBestRate(quoteResult.rates);
      log('info', 'skydropx.label.rate_selected', { carrier: bestRate.carrier, service: bestRate.service, price: bestRate.total_price });

      // Step 3: Create shipment (use quotation_id from result)
      log('info', 'skydropx.label.creating_shipment', { orderId });
      const shipmentResult = await createShipment(
        quoteResult.quotation_id,  // Fixed: was quotationId
        bestRate.rate_id,          // Fixed: use rate_id from parsed rate
        bestRate,
        destAddress,
        DEFAULT_PACKAGE
      );

      // Step 4: Save to database
      log('info', 'skydropx.label.saving', { orderId });
      const insertResult = await query(`
        INSERT INTO shipping_labels (
          order_id,
          client_id,
          shipment_id,
          quotation_id,
          rate_id,
          tracking_number,
          tracking_url,
          label_url,
          carrier,
          service,
          delivery_days,
          shipping_cost,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        orderId,
        clientId,
        shipmentResult.shipment_id,
        quoteResult.quotation_id,
        bestRate.rate_id,
        shipmentResult.tracking_number || null,
        shipmentResult.tracking_url || null,
        shipmentResult.label_url || null,
        bestRate.carrier,
        bestRate.service,
        bestRate.days,
        bestRate.total_price,
        shipmentResult.tracking_number ? 'label_generated' : 'processing'
      ]);

      log('info', 'skydropx.label.created', { orderId });

      // Auto-request pickup for this carrier (if not already scheduled)
      if (shipmentResult.shipment_id && bestRate.carrier) {
        setImmediate(async () => {
          try {
            const pickupResult = await requestPickupIfNeeded(
              shipmentResult.shipment_id,
              bestRate.carrier
            );
            log('info', 'skydropx.label.pickup', { message: pickupResult.message });
          } catch (pickupError) {
            logError('skydropx.label.pickup_error', pickupError);
          }
        });
      }

      return {
        success: true,
        label: insertResult.rows[0],
        trackingNumber: shipmentResult.tracking_number,
        trackingUrl: shipmentResult.tracking_url,
        labelUrl: shipmentResult.label_url,
        carrier: bestRate.carrier,
        service: bestRate.service,
        deliveryDays: bestRate.days
      };

    } catch (error) {
      lastError = error.message;
      logError('skydropx.label.attempt_failed', error, { orderId, attempt });

      // Clear token cache and retry
      if (attempt < MAX_RETRIES) {
        cachedToken = null;
        tokenExpiry = null;
      }
    }
  }

  // All retries exhausted
  log('error', 'skydropx.label.all_failed', { orderId, maxRetries: MAX_RETRIES });
  return {
    success: false,
    error: lastError || 'Failed to generate shipping label after multiple attempts'
  };
}

/**
 * Request pickup for multiple shipments
 * @param {string[]} shipmentIds - Array of Skydropx shipment IDs
 * @param {Object} options - Pickup options
 * @param {string} options.pickupDate - Date for pickup (YYYY-MM-DD)
 * @param {string} options.timeFrom - Start time window (HH:MM)
 * @param {string} options.timeTo - End time window (HH:MM)
 */
export async function requestPickup(shipmentIds, options = {}) {
  const allowEmpty = options.allowEmptyPickup || false;

  if (!shipmentIds || shipmentIds.length === 0) {
    if (!allowEmpty) {
      throw new Error('No shipment IDs provided for pickup');
    }
    shipmentIds = [];
  }

  // Default to tomorrow if no date specified
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pickupDate = options.pickupDate || tomorrow.toISOString().split('T')[0];

  // Default time window: 9 AM to 6 PM
  const timeFrom = options.timeFrom || '09:00';
  const timeTo = options.timeTo || '18:00';

  log('info', 'skydropx.pickup.request', { shipmentCount: shipmentIds.length, pickupDate, timeFrom, timeTo });

  // Build pickup payload with correct Skydropx field names
  const pickupPayload = {
    pickup: {
      pickup_date: pickupDate,
      pickup_time_from: timeFrom,
      pickup_time_to: timeTo,
      total_packages: shipmentIds.length || 1,
      total_weight: (shipmentIds.length || 1) * DEFAULT_PACKAGE.weight,
      address: {
        name: truncate(ORIGIN_ADDRESS.name, MAX_NAME_LENGTH),
        company: truncate(ORIGIN_ADDRESS.company, MAX_NAME_LENGTH),
        street1: truncate(`${ORIGIN_ADDRESS.street} ${ORIGIN_ADDRESS.number}`, MAX_STREET_LENGTH),
        zip: ORIGIN_ADDRESS.zip,
        country_code: 'MX',
        phone: ORIGIN_ADDRESS.phone,
        email: ORIGIN_ADDRESS.email,
        reference: truncate(ORIGIN_ADDRESS.reference, MAX_REFERENCE_LENGTH)
      }
    }
  };

  // Include shipment_ids if there are shipments
  if (shipmentIds.length > 0) {
    pickupPayload.pickup.shipment_ids = shipmentIds;
  }

  log('info', 'skydropx.pickup.payload', { payload: pickupPayload });

  // Try pro.skydropx.com first (documented pickup endpoint), then api, then app
  const pickupUrls = [
    'https://pro.skydropx.com/api/v1/pickups',
    `${SKYDROPX_API_URL}/pickups`,
    'https://app.skydropx.com/api/v1/pickups'
  ];

  let lastError = null;
  for (const pickupUrl of pickupUrls) {
    try {
      log('info', 'skydropx.pickup.trying', { url: pickupUrl });
      const token = await getAccessToken();

      const response = await fetchWithTimeout(pickupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(pickupPayload)
      });

      const responseText = await response.text();
      log('info', 'skydropx.pickup.response', { status: response.status, url: pickupUrl });

      if (!response.ok) {
        let errorMessage = 'Error requesting pickup from Skydropx';
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.errors) {
            if (typeof errorData.errors === 'string') {
              errorMessage = errorData.errors;
            } else if (Array.isArray(errorData.errors)) {
              errorMessage = errorData.errors.join(', ');
            } else {
              const messages = [];
              for (const [field, msgs] of Object.entries(errorData.errors)) {
                if (Array.isArray(msgs)) {
                  messages.push(`${field}: ${msgs.join(', ')}`);
                }
              }
              errorMessage = messages.join('; ') || errorMessage;
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }
        log('error', 'skydropx.pickup.failed', { url: pickupUrl, error: errorMessage });
        lastError = new Error(errorMessage);
        continue; // Try next URL
      }

      const result = JSON.parse(responseText);
      log('info', 'skydropx.pickup.success');

      // Extract pickup data from response
      const pickupData = result.data?.attributes || result.data || result;
      const pickupId = result.data?.id || pickupData.id;
      const confirmationNumber = pickupData.confirmation_number || null;

      return {
        success: true,
        pickup_id: pickupId,
        confirmation_number: confirmationNumber,
        status: pickupData.status || 'requested',
        pickup_date: pickupDate,
        time_from: timeFrom,
        time_to: timeTo,
        shipment_count: shipmentIds.length,
        response: result
      };
    } catch (fetchError) {
      logError('skydropx.pickup.fetch_error', fetchError, { url: pickupUrl });
      lastError = fetchError;
      continue;
    }
  }

  // All URLs failed
  throw lastError || new Error('All Skydropx pickup URLs failed');
}

/**
 * Get pickup status
 */
export async function getPickup(pickupId) {
  const response = await skydropxFetch(`/pickups/${pickupId}`);

  if (!response.ok) {
    throw new Error('Pickup not found');
  }

  const result = await response.json();
  const pickupData = result.data?.attributes || result.data || result;

  return {
    pickup_id: result.data?.id || pickupId,
    status: pickupData.status,
    pickup_date: pickupData.date,
    time_from: pickupData.time_from,
    time_to: pickupData.time_to
  };
}

/**
 * Cancel a pickup request
 */
export async function cancelPickup(pickupId) {
  log('info', 'skydropx.pickup.cancel', { pickupId });

  const response = await skydropxFetch(`/pickups/${pickupId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel pickup: ${errorText}`);
  }

  log('info', 'skydropx.pickup.cancelled', { pickupId });
  return { success: true, pickup_id: pickupId };
}

/**
 * Verify shipment status with Skydropx API
 * Returns status like: LABEL CREATED, IN_TRANSIT, DELIVERED, CANCELED, etc.
 */
export async function verifyShipmentStatus(shipmentId) {
  try {
    const shipment = await getShipment(shipmentId);
    return {
      success: true,
      status: shipment.status,
      tracking_number: shipment.tracking_number,
      isActive: !['CANCELED', 'CANCELLED', 'VOIDED', 'REFUNDED', 'EXPIRED'].includes((shipment.status || '').toUpperCase())
    };
  } catch (error) {
    logError('skydropx.verify.error', error, { shipmentId });
    return {
      success: false,
      error: error.message,
      isActive: false // Assume inactive if we can't verify
    };
  }
}

/**
 * Get pending shipments that need pickup (labels generated without pickup)
 * Optionally verifies with Skydropx to filter cancelled labels
 */
export async function getPendingShipmentsForPickup(options = {}) {
  // By default, get ALL pending labels (for manual requests)
  // Use todayOnly: true for the daily scheduler
  const dateFilter = options.todayOnly ? 'AND sl.created_at >= CURRENT_DATE' : '';

  const result = await query(`
    SELECT
      sl.id,
      sl.order_id,
      sl.shipment_id,
      sl.tracking_number,
      sl.carrier,
      sl.service,
      sl.status as label_status,
      sl.pickup_status,
      sl.created_at,
      o.order_number,
      c.name as client_name
    FROM shipping_labels sl
    JOIN orders o ON sl.order_id = o.id
    JOIN clients c ON o.client_id = c.id
    WHERE sl.shipment_id IS NOT NULL
      AND sl.status IN ('label_generated', 'processing')
      AND (sl.pickup_status = 'pending' OR sl.pickup_status IS NULL)
      ${dateFilter}
    ORDER BY sl.created_at ASC
  `);

  // If verifyWithSkydropx option is set, check each label's status
  if (options.verifyWithSkydropx && result.rows.length > 0) {
    log('info', 'skydropx.pending.verifying', { count: result.rows.length });

    const verifiedShipments = [];

    for (const shipment of result.rows) {
      const verification = await verifyShipmentStatus(shipment.shipment_id);

      if (verification.isActive) {
        verifiedShipments.push({
          ...shipment,
          skydropx_status: verification.status
        });
      } else {
        // Mark cancelled shipments in our database
        log('info', 'skydropx.pending.inactive', { orderNumber: shipment.order_number, status: verification.status });
        await query(`
          UPDATE shipping_labels
          SET status = 'cancelled', pickup_status = 'cancelled'
          WHERE shipment_id = $1
        `, [shipment.shipment_id]);
      }
    }

    log('info', 'skydropx.pending.ready', { count: verifiedShipments.length });
    return verifiedShipments;
  }

  return result.rows;
}

/**
 * Check if a pickup already exists for a carrier today
 */
export async function hasPickupForCarrierToday(carrier) {
  const normalizedCarrier = normalizeCarrierName(carrier);

  const result = await query(`
    SELECT id, pickup_id, pickup_date, status
    FROM pickups
    WHERE carrier = $1
      AND pickup_date >= CURRENT_DATE
      AND status NOT IN ('cancelled')
    LIMIT 1
  `, [normalizedCarrier]);

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Normalize carrier names for consistent matching
 */
function normalizeCarrierName(carrier) {
  if (!carrier) return 'unknown';
  const name = carrier.toLowerCase().trim();

  if (name.includes('estafeta')) return 'Estafeta';
  if (name.includes('fedex')) return 'FedEx';
  if (name.includes('paquete') || name.includes('paquetexpress')) return 'Paquetexpress';
  if (name.includes('dhl')) return 'DHL';
  if (name.includes('ups')) return 'UPS';
  if (name.includes('redpack')) return 'Redpack';

  // Return original with first letter capitalized
  return carrier.charAt(0).toUpperCase() + carrier.slice(1).toLowerCase();
}

/**
 * Request pickup for a specific shipment, but only if no pickup exists for that carrier today
 * Call this immediately after generating a label
 */
export async function requestPickupIfNeeded(shipmentId, carrier, options = {}) {
  const normalizedCarrier = normalizeCarrierName(carrier);

  log('info', 'skydropx.pickup.check_needed', { carrier: normalizedCarrier });

  // Check if pickup already exists for this carrier today
  const existingPickup = await hasPickupForCarrierToday(normalizedCarrier);

  if (existingPickup) {
    log('info', 'skydropx.pickup.already_scheduled', { carrier: normalizedCarrier, pickupId: existingPickup.pickup_id });

    // Update this shipment to be included in the existing pickup
    await query(`
      UPDATE shipping_labels
      SET pickup_id = $1,
          pickup_status = 'requested',
          pickup_date = $2
      WHERE shipment_id = $3
    `, [existingPickup.pickup_id, existingPickup.pickup_date, shipmentId]);

    return {
      success: true,
      alreadyScheduled: true,
      pickup_id: existingPickup.pickup_id,
      pickup_date: existingPickup.pickup_date,
      carrier: normalizedCarrier,
      message: `Pickup already scheduled for ${normalizedCarrier}`
    };
  }

  // No existing pickup - request a new one
  log('info', 'skydropx.pickup.requesting_new', { carrier: normalizedCarrier });

  // Default to tomorrow for pickup
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Skip Sunday - move to Monday
  if (tomorrow.getDay() === 0) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }
  const pickupDate = options.pickupDate || tomorrow.toISOString().split('T')[0];

  try {
    // Request pickup from Skydropx
    const pickupResult = await requestPickup([shipmentId], {
      pickupDate,
      timeFrom: options.timeFrom || '09:00',
      timeTo: options.timeTo || '18:00'
    });

    // Save pickup to database with carrier
    await query(`
      INSERT INTO pickups (
        pickup_id,
        pickup_date,
        pickup_time_from,
        pickup_time_to,
        shipment_ids,
        shipment_count,
        carrier,
        status,
        response_data,
        requested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      pickupResult.pickup_id,
      pickupDate,
      pickupResult.time_from,
      pickupResult.time_to,
      [shipmentId],
      1,
      normalizedCarrier,
      'requested',
      JSON.stringify(pickupResult.response)
    ]);

    // Update shipping label with pickup info
    await query(`
      UPDATE shipping_labels
      SET pickup_id = $1,
          pickup_status = 'requested',
          pickup_date = $2,
          pickup_time_from = $3,
          pickup_time_to = $4,
          pickup_requested_at = NOW()
      WHERE shipment_id = $5
    `, [
      pickupResult.pickup_id,
      pickupDate,
      pickupResult.time_from,
      pickupResult.time_to,
      shipmentId
    ]);

    log('info', 'skydropx.pickup.scheduled', { carrier: normalizedCarrier, pickupDate, pickupId: pickupResult.pickup_id });

    return {
      success: true,
      alreadyScheduled: false,
      pickup_id: pickupResult.pickup_id,
      pickup_date: pickupDate,
      carrier: normalizedCarrier,
      message: `New pickup scheduled for ${normalizedCarrier}`
    };

  } catch (error) {
    logError('skydropx.pickup.request_failed', error, { carrier: normalizedCarrier });
    return {
      success: false,
      error: error.message,
      carrier: normalizedCarrier
    };
  }
}

/**
 * Request daily pickup for all pending shipments
 * This should be called by a scheduler (e.g., every day at 5 PM)
 */
export async function requestDailyPickup(options = {}) {
  log('info', 'skydropx.daily_pickup.start');

  // Get pending shipments - todayOnly for scheduled cron runs
  const pendingShipments = await getPendingShipmentsForPickup({ todayOnly: options.todayOnly });

  if (pendingShipments.length === 0) {
    log('info', 'skydropx.daily_pickup.none');
    return {
      success: true,
      message: 'No pending shipments',
      shipment_count: 0
    };
  }

  log('info', 'skydropx.daily_pickup.found', { count: pendingShipments.length });

  // Extract shipment IDs
  const shipmentIds = pendingShipments.map(s => s.shipment_id);

  // Request pickup for tomorrow by default
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pickupDate = options.pickupDate || tomorrow.toISOString().split('T')[0];

  try {
    // Request pickup from Skydropx
    const pickupResult = await requestPickup(shipmentIds, {
      pickupDate,
      timeFrom: options.timeFrom || '09:00',
      timeTo: options.timeTo || '18:00'
    });

    // Save pickup to database
    await query(`
      INSERT INTO pickups (
        pickup_id,
        pickup_date,
        pickup_time_from,
        pickup_time_to,
        shipment_ids,
        shipment_count,
        status,
        response_data,
        requested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      pickupResult.pickup_id,
      pickupDate,
      pickupResult.time_from,
      pickupResult.time_to,
      shipmentIds,
      shipmentIds.length,
      'requested',
      JSON.stringify(pickupResult.response)
    ]);

    // Update all shipping labels with pickup info
    await query(`
      UPDATE shipping_labels
      SET pickup_id = $1,
          pickup_status = 'requested',
          pickup_date = $2,
          pickup_time_from = $3,
          pickup_time_to = $4,
          pickup_requested_at = NOW()
      WHERE shipment_id = ANY($5)
    `, [
      pickupResult.pickup_id,
      pickupDate,
      pickupResult.time_from,
      pickupResult.time_to,
      shipmentIds
    ]);

    log('info', 'skydropx.daily_pickup.scheduled', { pickupDate, pickupId: pickupResult.pickup_id, shipmentCount: shipmentIds.length });

    return {
      success: true,
      pickup_id: pickupResult.pickup_id,
      pickup_date: pickupDate,
      shipment_count: shipmentIds.length,
      shipments: pendingShipments.map(s => ({
        order_number: s.order_number,
        tracking_number: s.tracking_number,
        carrier: s.carrier
      }))
    };

  } catch (error) {
    logError('skydropx.daily_pickup.failed', error);

    // Log failure but don't crash
    return {
      success: false,
      error: error.message,
      shipment_count: shipmentIds.length,
      shipment_ids: shipmentIds
    };
  }
}

export default {
  getAccessToken,
  getQuote,
  createShipment,
  getShipment,
  selectBestRate,
  generateShippingLabel,
  requestPickup,
  requestPickupIfNeeded,
  hasPickupForCarrierToday,
  getPickup,
  cancelPickup,
  getPendingShipmentsForPickup,
  verifyShipmentStatus,
  requestDailyPickup,
  updateOriginAddress,
  loadOriginAddress,
  ORIGIN_ADDRESS,
  DEFAULT_PACKAGE
};
