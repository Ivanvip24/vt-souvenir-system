/**
 * Skydropx API Service
 * Handles OAuth2 authentication and shipping operations
 */

import { config } from 'dotenv';
import { query } from '../shared/database.js';
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

// Fixed origin address (VT Anunciando office)
const ORIGIN_ADDRESS = {
  name: 'VT Anunciando',
  company: 'VT Anunciando',
  street: 'Fray Juan de Torquemada',
  number: '146',
  neighborhood: 'Obrera',
  city: 'Cuauhtemoc',
  state: 'Ciudad de Mexico',
  zip: '06800',
  phone: '5538253251',
  email: 'valenciaperezivan24@gmail.com',
  reference: 'Zaguan blanco final pasillo'
};

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

  console.log('🔑 Requesting new Skydropx access token...');

  const response = await fetch(`${SKYDROPX_API_URL}/oauth/token`, {
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
    console.error('❌ OAuth token error:', errorText);
    throw new Error(`Failed to get Skydropx access token: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 7200) * 1000;

  console.log('✅ Got Skydropx access token');
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
 */
export async function getQuote(destAddress, packageInfo = DEFAULT_PACKAGE, retryCount = 0) {
  const MAX_RETRIES = 2;

  const quotationPayload = {
    quotation: {
      address_from: {
        country_code: 'MX',
        postal_code: ORIGIN_ADDRESS.zip,
        area_level1: ORIGIN_ADDRESS.state,
        area_level2: ORIGIN_ADDRESS.city,
        area_level3: ORIGIN_ADDRESS.neighborhood
      },
      address_to: {
        country_code: 'MX',
        postal_code: destAddress.zip || destAddress.postal || destAddress.postal_code,
        area_level1: destAddress.state || 'Estado',
        area_level2: destAddress.city || 'Ciudad',
        area_level3: destAddress.colonia || destAddress.neighborhood || 'Colonia'
      },
      parcel: {
        weight: packageInfo.weight || DEFAULT_PACKAGE.weight,
        length: packageInfo.length || DEFAULT_PACKAGE.length,
        width: packageInfo.width || DEFAULT_PACKAGE.width,
        height: packageInfo.height || DEFAULT_PACKAGE.height
      }
    }
  };

  console.log('📦 Skydropx Quote Request:', JSON.stringify(quotationPayload, null, 2));

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
    console.log('✅ Skydropx Quote - Found', result.rates?.length || 0, 'rates');

    // Parse rates
    const rates = (result.rates || [])
      .filter(rate => rate.success && rate.total)
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

    return {
      quotation_id: result.id,
      rates
    };
  } catch (error) {
    // Retry on failure
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s exponential backoff
      console.log(`⚠️ Skydropx quote failed, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getQuote(destAddress, packageInfo, retryCount + 1);
    }
    // All retries exhausted
    console.error('❌ Skydropx quote failed after all retries:', error.message);
    throw error;
  }
}

/**
 * Create shipment and generate label
 */
export async function createShipment(quotationId, rateId, rate, destAddress, packageInfo = DEFAULT_PACKAGE) {
  const destStreet = `${destAddress.street || ''} ${destAddress.street_number || destAddress.number || 'S/N'}`.trim();
  const originStreet = `${ORIGIN_ADDRESS.street} ${ORIGIN_ADDRESS.number}`;

  const shipmentPayload = {
    shipment: {
      quotation_id: quotationId,
      rate_id: rateId,
      address_from: {
        name: truncate(ORIGIN_ADDRESS.name, MAX_NAME_LENGTH),
        company: truncate(ORIGIN_ADDRESS.company, MAX_NAME_LENGTH),
        street1: truncate(originStreet, MAX_STREET_LENGTH),
        neighborhood: truncate(ORIGIN_ADDRESS.neighborhood, MAX_NAME_LENGTH),
        postal_code: ORIGIN_ADDRESS.zip,
        area_level1: ORIGIN_ADDRESS.state,
        area_level2: ORIGIN_ADDRESS.city,
        area_level3: truncate(ORIGIN_ADDRESS.neighborhood, MAX_NAME_LENGTH),
        country_code: 'MX',
        phone: ORIGIN_ADDRESS.phone,
        email: ORIGIN_ADDRESS.email,
        reference: truncate(ORIGIN_ADDRESS.reference, MAX_REFERENCE_LENGTH)
      },
      address_to: {
        name: truncate(destAddress.name, MAX_NAME_LENGTH),
        company: truncate(destAddress.name, MAX_NAME_LENGTH),
        street1: truncate(destStreet, MAX_STREET_LENGTH),
        neighborhood: truncate(destAddress.colonia || destAddress.neighborhood || 'Centro', MAX_NAME_LENGTH),
        postal_code: destAddress.zip || destAddress.postal || destAddress.postal_code,
        area_level1: destAddress.state,
        area_level2: destAddress.city,
        area_level3: truncate(destAddress.colonia || destAddress.neighborhood || 'Centro', MAX_NAME_LENGTH),
        country_code: 'MX',
        phone: destAddress.phone,
        email: destAddress.email || 'cliente@example.com',
        reference: truncate(destAddress.reference_notes || destAddress.reference || 'Sin referencia', MAX_REFERENCE_LENGTH)
      },
      packages: [{
        package_number: 1,
        weight: packageInfo.weight || DEFAULT_PACKAGE.weight,
        height: packageInfo.height || DEFAULT_PACKAGE.height,
        width: packageInfo.width || DEFAULT_PACKAGE.width,
        length: packageInfo.length || DEFAULT_PACKAGE.length,
        dimension_unit: 'CM',
        mass_unit: 'KG',
        quantity: 1,
        consignment_note: DEFAULT_CONSIGNMENT_NOTE,
        package_type: DEFAULT_PACKAGE_TYPE
      }]
    }
  };

  console.log('📦 Skydropx Shipment Request:', JSON.stringify(shipmentPayload, null, 2));

  const response = await skydropxFetch('/shipments', {
    method: 'POST',
    body: JSON.stringify(shipmentPayload)
  });

  const responseText = await response.text();
  console.log('📬 Skydropx Shipment Response Status:', response.status);

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
  console.log('✅ Shipment Created');

  // Extract data from response
  const shipmentData = result.data?.attributes || result.data || result;
  let packageData = result.included?.find(i => i.type === 'package')?.attributes || {};
  const shipmentId = result.data?.id || shipmentData.id;

  // Check if tracking number is available immediately
  let trackingNumber = packageData.tracking_number || shipmentData.master_tracking_number;
  let trackingUrl = packageData.tracking_url_provider;
  let labelUrl = packageData.label_url;

  // If no tracking number, poll Skydropx to wait for it (max 15 seconds)
  if (!trackingNumber && shipmentId) {
    console.log('⏳ Tracking number not immediately available, polling...');
    const MAX_POLLS = 5;
    const POLL_DELAY_MS = 3000; // 3 seconds

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));

      try {
        const pollResponse = await skydropxFetch(`/shipments/${shipmentId}`);
        if (pollResponse.ok) {
          const pollResult = await pollResponse.json();
          const pollShipmentData = pollResult.data?.attributes || pollResult.data || pollResult;
          const pollPackageData = pollResult.included?.find(item => item.type === 'package')?.attributes || {};

          trackingNumber = pollPackageData.tracking_number || pollShipmentData.master_tracking_number;
          trackingUrl = pollPackageData.tracking_url_provider || trackingUrl;
          labelUrl = pollPackageData.label_url || labelUrl;

          if (trackingNumber) {
            console.log(`✅ Tracking number retrieved after ${i + 1} poll(s): ${trackingNumber}`);
            break;
          }
          console.log(`   Poll ${i + 1}/${MAX_POLLS}: Still waiting for tracking number...`);
        }
      } catch (pollError) {
        console.log(`   Poll ${i + 1}/${MAX_POLLS} failed:`, pollError.message);
      }
    }

    if (!trackingNumber) {
      console.log('⚠️ Tracking number not available after polling. Will be fetched later.');
    }
  }

  return {
    shipment_id: shipmentId,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    label_url: labelUrl,
    carrier: rate.carrier,
    service: rate.service,
    delivery_days: rate.days,
    shipping_cost: rate.total_price,
    status: shipmentData.workflow_status || 'processing'
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
      console.log(`📦 Generating shipping label for order ${orderId}... (attempt ${attempt}/${MAX_RETRIES})`);

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

      console.log('   Getting quote...');
      const quoteResult = await getQuote(destAddress);

      // Check if we got rates (getQuote returns { quotation_id, rates })
      if (!quoteResult.rates || quoteResult.rates.length === 0) {
        lastError = 'No shipping rates available';
        console.log(`   ⚠️ No rates on attempt ${attempt}, retrying...`);
        // Clear token cache and retry
        cachedToken = null;
        tokenExpiry = null;
        continue;
      }

      // Step 2: Select best rate (cheapest)
      const bestRate = selectBestRate(quoteResult.rates);
      console.log(`   Selected: ${bestRate.carrier} - ${bestRate.service} ($${bestRate.total_price})`);

      // Step 3: Create shipment (use quotation_id from result)
      console.log('   Creating shipment...');
      const shipmentResult = await createShipment(
        quoteResult.quotation_id,  // Fixed: was quotationId
        bestRate.rate_id,          // Fixed: use rate_id from parsed rate
        bestRate,
        destAddress,
        DEFAULT_PACKAGE
      );

      // Step 4: Save to database
      console.log('   Saving to database...');
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

      console.log(`✅ Shipping label created for order ${orderId}`);

      // Auto-request pickup for this carrier (if not already scheduled)
      if (shipmentResult.shipment_id && bestRate.carrier) {
        setImmediate(async () => {
          try {
            const pickupResult = await requestPickupIfNeeded(
              shipmentResult.shipment_id,
              bestRate.carrier
            );
            console.log(`📦 Pickup for label: ${pickupResult.message}`);
          } catch (pickupError) {
            console.error('⚠️ Pickup request error (non-fatal):', pickupError.message);
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
      console.error(`❌ Attempt ${attempt} failed for order ${orderId}:`, error.message);

      // Clear token cache and retry
      if (attempt < MAX_RETRIES) {
        console.log('   Clearing token cache and retrying...');
        cachedToken = null;
        tokenExpiry = null;
      }
    }
  }

  // All retries exhausted
  console.error(`❌ All ${MAX_RETRIES} attempts failed for order ${orderId}`);
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
    // Allow empty pickup - will try to create without shipments
    shipmentIds = [];
  }

  // Default to tomorrow if no date specified
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pickupDate = options.pickupDate || tomorrow.toISOString().split('T')[0];

  // Default time window: 9 AM to 6 PM
  const timeFrom = options.timeFrom || '09:00';
  const timeTo = options.timeTo || '18:00';

  console.log(`📦 Requesting pickup for ${shipmentIds.length} shipment(s)...`);
  console.log(`   Date: ${pickupDate}`);
  console.log(`   Time: ${timeFrom} - ${timeTo}`);
  console.log(`   Shipment IDs: ${shipmentIds.join(', ')}`);

  const pickupPayload = {
    pickup: {
      date: pickupDate,
      time_from: timeFrom,
      time_to: timeTo,
      address: {
        name: truncate(ORIGIN_ADDRESS.name, MAX_NAME_LENGTH),
        company: truncate(ORIGIN_ADDRESS.company, MAX_NAME_LENGTH),
        street1: truncate(`${ORIGIN_ADDRESS.street} ${ORIGIN_ADDRESS.number}`, MAX_STREET_LENGTH),
        neighborhood: truncate(ORIGIN_ADDRESS.neighborhood, MAX_NAME_LENGTH),
        postal_code: ORIGIN_ADDRESS.zip,
        area_level1: ORIGIN_ADDRESS.state,
        area_level2: ORIGIN_ADDRESS.city,
        area_level3: truncate(ORIGIN_ADDRESS.neighborhood, MAX_NAME_LENGTH),
        country_code: 'MX',
        phone: ORIGIN_ADDRESS.phone,
        email: ORIGIN_ADDRESS.email,
        reference: truncate(ORIGIN_ADDRESS.reference, MAX_REFERENCE_LENGTH)
      }
    }
  };

  // Only include shipment_ids if there are shipments
  if (shipmentIds.length > 0) {
    pickupPayload.pickup.shipment_ids = shipmentIds;
  }

  console.log('📬 Skydropx Pickup Request:', JSON.stringify(pickupPayload, null, 2));

  const response = await skydropxFetch('/pickups', {
    method: 'POST',
    body: JSON.stringify(pickupPayload)
  });

  const responseText = await response.text();
  console.log('📬 Skydropx Pickup Response Status:', response.status);

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
    console.error('❌ Pickup request failed:', errorMessage);
    throw new Error(errorMessage);
  }

  const result = JSON.parse(responseText);
  console.log('✅ Pickup requested successfully');

  // Extract pickup data from response
  const pickupData = result.data?.attributes || result.data || result;
  const pickupId = result.data?.id || pickupData.id;

  return {
    success: true,
    pickup_id: pickupId,
    status: pickupData.status || 'requested',
    pickup_date: pickupDate,
    time_from: timeFrom,
    time_to: timeTo,
    shipment_count: shipmentIds.length,
    response: result
  };
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
  console.log(`❌ Cancelling pickup ${pickupId}...`);

  const response = await skydropxFetch(`/pickups/${pickupId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel pickup: ${errorText}`);
  }

  console.log('✅ Pickup cancelled');
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
    console.error(`Error verifying shipment ${shipmentId}:`, error.message);
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
    console.log(`🔍 Verifying ${result.rows.length} shipments with Skydropx...`);

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
        console.log(`   ❌ Shipment ${shipment.order_number} is ${verification.status || 'inactive'} - skipping`);
        await query(`
          UPDATE shipping_labels
          SET status = 'cancelled', pickup_status = 'cancelled'
          WHERE shipment_id = $1
        `, [shipment.shipment_id]);
      }
    }

    console.log(`✅ ${verifiedShipments.length} active shipments ready for pickup`);
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

  console.log(`🔍 Checking if pickup needed for ${normalizedCarrier}...`);

  // Check if pickup already exists for this carrier today
  const existingPickup = await hasPickupForCarrierToday(normalizedCarrier);

  if (existingPickup) {
    console.log(`✅ Pickup already scheduled for ${normalizedCarrier} (ID: ${existingPickup.pickup_id})`);

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
  console.log(`📦 No existing pickup for ${normalizedCarrier}, requesting new one...`);

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

    console.log(`✅ Pickup scheduled for ${normalizedCarrier} on ${pickupDate}`);
    console.log(`   Pickup ID: ${pickupResult.pickup_id}`);

    return {
      success: true,
      alreadyScheduled: false,
      pickup_id: pickupResult.pickup_id,
      pickup_date: pickupDate,
      carrier: normalizedCarrier,
      message: `New pickup scheduled for ${normalizedCarrier}`
    };

  } catch (error) {
    console.error(`❌ Failed to request pickup for ${normalizedCarrier}:`, error.message);
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
  console.log('📦 Starting daily pickup request...');

  // Get pending shipments - todayOnly for scheduled cron runs
  const pendingShipments = await getPendingShipmentsForPickup({ todayOnly: options.todayOnly });

  if (pendingShipments.length === 0) {
    console.log('ℹ️  No pending shipments for pickup today');
    return {
      success: true,
      message: 'No pending shipments',
      shipment_count: 0
    };
  }

  console.log(`📋 Found ${pendingShipments.length} shipment(s) pending pickup:`);
  pendingShipments.forEach(s => {
    console.log(`   - ${s.order_number}: ${s.tracking_number} (${s.carrier})`);
  });

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

    console.log(`✅ Daily pickup scheduled for ${pickupDate}`);
    console.log(`   Pickup ID: ${pickupResult.pickup_id}`);
    console.log(`   Shipments: ${shipmentIds.length}`);

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
    console.error('❌ Failed to request daily pickup:', error.message);

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
  ORIGIN_ADDRESS,
  DEFAULT_PACKAGE
};
