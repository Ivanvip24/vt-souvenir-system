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
 * Get shipping quote for a destination
 */
export async function getQuote(destAddress, packageInfo = DEFAULT_PACKAGE) {
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

export default {
  getAccessToken,
  getQuote,
  createShipment,
  getShipment,
  selectBestRate,
  generateShippingLabel,
  ORIGIN_ADDRESS,
  DEFAULT_PACKAGE
};
