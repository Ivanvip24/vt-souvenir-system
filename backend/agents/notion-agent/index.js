import { Client } from '@notionhq/client';
import { notionConfig, propertyMappings, validateConfig, mapStatusToNotion } from './config.js';
import { retry, sanitizeText } from '../../shared/utils.js';

// Initialize Notion client
validateConfig();
const notion = new Client({ auth: notionConfig.auth });

/**
 * Create a new order page in Notion
 * @param {Object} orderData - Order information
 * @returns {Object} - Created page with ID and URL
 */
export async function createOrder(orderData) {
  try {
    console.log('📝 Creating order in Notion:', orderData.orderNumber);

    const properties = buildOrderProperties(orderData);

    const response = await retry(async () => {
      return await notion.pages.create({
        parent: { database_id: notionConfig.ordersDatabase },
        properties,
        icon: { emoji: '📦' },
      });
    });

    console.log('✅ Order created successfully:', response.id);

    return {
      success: true,
      notionPageId: response.id,
      notionPageUrl: response.url,
      data: response
    };

  } catch (error) {
    console.error('❌ Error creating order in Notion:', error);
    throw new Error(`Failed to create Notion page: ${error.message}`);
  }
}

/**
 * Update an existing order in Notion
 * @param {string} pageId - Notion page ID
 * @param {Object} updates - Fields to update
 * @returns {Object} - Updated page
 */
export async function updateOrder(pageId, updates) {
  try {
    console.log('📝 Updating order in Notion:', pageId);

    const properties = buildOrderProperties(updates, true);

    const response = await retry(async () => {
      return await notion.pages.update({
        page_id: pageId,
        properties
      });
    });

    console.log('✅ Order updated successfully');

    return {
      success: true,
      data: response
    };

  } catch (error) {
    console.error('❌ Error updating order in Notion:', error);
    throw new Error(`Failed to update Notion page: ${error.message}`);
  }
}

/**
 * Get an order from Notion by page ID
 * @param {string} pageId - Notion page ID
 * @returns {Object} - Order data
 */
export async function getOrder(pageId) {
  try {
    const response = await retry(async () => {
      return await notion.pages.retrieve({ page_id: pageId });
    });

    const orderData = parseNotionPage(response);

    return {
      success: true,
      data: orderData
    };

  } catch (error) {
    console.error('❌ Error retrieving order from Notion:', error);
    throw new Error(`Failed to retrieve Notion page: ${error.message}`);
  }
}

/**
 * Query orders from Notion with filters
 * @param {Object} filters - Query filters
 * @returns {Array} - Array of orders
 */
export async function queryOrders(filters = {}) {
  try {
    console.log('🔍 Querying orders from Notion...');

    const notionFilters = buildNotionFilters(filters);

    const response = await retry(async () => {
      return await notion.databases.query({
        database_id: notionConfig.ordersDatabase,
        filter: notionFilters.length > 0 ? { and: notionFilters } : undefined,
        sorts: [
          {
            property: propertyMappings.orderDate,
            direction: 'descending'
          }
        ]
      });
    });

    const orders = response.results.map(page => parseNotionPage(page));

    console.log(`✅ Found ${orders.length} orders`);

    return {
      success: true,
      count: orders.length,
      data: orders
    };

  } catch (error) {
    console.error('❌ Error querying orders from Notion:', error);
    throw new Error(`Failed to query Notion database: ${error.message}`);
  }
}

/**
 * Update order status
 * @param {string} pageId - Notion page ID
 * @param {string} status - New status
 * @returns {Object} - Updated page
 */
export async function updateStatus(pageId, status) {
  return await updateOrder(pageId, { status });
}

/**
 * Sync order from local database to Notion
 * @param {Object} localOrder - Order from local database
 * @returns {Object} - Sync result
 */
export async function syncToNotion(localOrder) {
  try {
    if (localOrder.notion_page_id) {
      // Update existing page
      return await updateOrder(localOrder.notion_page_id, localOrder);
    } else {
      // Create new page
      return await createOrder(localOrder);
    }
  } catch (error) {
    console.error('❌ Error syncing to Notion:', error);
    throw error;
  }
}

/**
 * Build Notion properties object from order data
 * @param {Object} orderData - Order data
 * @param {boolean} isUpdate - Is this an update operation
 * @returns {Object} - Notion properties
 */
function buildOrderProperties(orderData, isUpdate = false) {
  const properties = {};

  // Title - DESTINO: Order Number + Client Name
  const titleText = orderData.orderNumber
    ? `${orderData.orderNumber} - ${orderData.clientName || 'Cliente'}`
    : orderData.clientName || 'Nuevo Pedido';

  properties[propertyMappings.title] = {
    title: [{ text: { content: sanitizeText(titleText) } }]
  };

  // Client Name - using Select (not rich_text)
  if (orderData.clientName) {
    properties[propertyMappings.clientName] = {
      select: { name: sanitizeText(orderData.clientName).substring(0, 100) } // Select has limit
    };
  }

  // Phone - using Number
  if (orderData.clientPhone) {
    // Remove non-numeric characters
    const phoneNum = parseFloat(orderData.clientPhone.replace(/\D/g, ''));
    if (!isNaN(phoneNum)) {
      properties[propertyMappings.clientPhone] = {
        number: phoneNum
      };
    }
  }

  // Total Price
  if (orderData.totalPrice !== undefined) {
    properties[propertyMappings.totalPrice] = {
      number: parseFloat(orderData.totalPrice)
    };
  }

  // First Deposit (50% of total)
  if (orderData.depositAmount !== undefined) {
    properties[propertyMappings.firstDeposit] = {
      number: parseFloat(orderData.depositAmount)
    };
  } else if (orderData.totalPrice !== undefined) {
    properties[propertyMappings.firstDeposit] = {
      number: parseFloat(orderData.totalPrice) * 0.5
    };
  }

  // Status - map to your Notion status options
  if (orderData.status) {
    properties[propertyMappings.status] = {
      status: { name: mapStatusToNotion(orderData.status) }
    };
  } else {
    // Default to "Diseño" if no status provided
    properties[propertyMappings.status] = {
      status: { name: 'Diseño' }
    };
  }

  // Event Date - using the empty date field
  if (orderData.deliveryDate || orderData.eventDate) {
    const dateValue = orderData.deliveryDate || orderData.eventDate;
    properties[propertyMappings.eventDate] = {
      date: { start: dateValue }
    };
  }

  // Summary - combine products, quantities, notes
  const summaryParts = [];

  if (orderData.products) {
    const productsText = Array.isArray(orderData.products)
      ? orderData.products.map(p => p.name || p).join(', ')
      : orderData.products;
    summaryParts.push(`Productos: ${productsText}`);
  }

  if (orderData.quantities) {
    const quantitiesText = typeof orderData.quantities === 'string'
      ? orderData.quantities
      : JSON.stringify(orderData.quantities);
    summaryParts.push(`Cantidades: ${quantitiesText}`);
  }

  if (orderData.notes || orderData.clientNotes) {
    summaryParts.push(`Notas: ${orderData.notes || orderData.clientNotes}`);
  }

  if (orderData.clientAddress) {
    summaryParts.push(`Dirección: ${orderData.clientAddress}`);
  }

  if (orderData.clientCity || orderData.clientState) {
    summaryParts.push(`Ubicación: ${orderData.clientCity || ''}, ${orderData.clientState || ''}`);
  }

  if (summaryParts.length > 0) {
    const summaryText = summaryParts.join('\n\n');
    properties[propertyMappings.summary] = {
      rich_text: [{ text: { content: sanitizeText(summaryText).substring(0, 2000) } }] // Notion limit
    };
  }

  return properties;
}

/**
 * Parse Notion page to order data
 * @param {Object} page - Notion page object
 * @returns {Object} - Parsed order data
 */
function parseNotionPage(page) {
  const props = page.properties;

  return {
    notionPageId: page.id,
    notionPageUrl: page.url,
    orderNumber: extractText(props[propertyMappings.orderNumber]),
    orderDate: extractDate(props[propertyMappings.orderDate]),
    clientName: extractText(props[propertyMappings.clientName]),
    clientPhone: extractPhone(props[propertyMappings.clientPhone]),
    clientAddress: extractText(props[propertyMappings.clientAddress]),
    clientCity: extractText(props[propertyMappings.clientCity]),
    clientState: extractText(props[propertyMappings.clientState]),
    products: extractText(props[propertyMappings.products]),
    quantities: extractText(props[propertyMappings.quantities]),
    totalPrice: extractNumber(props[propertyMappings.totalPrice]),
    productionCost: extractNumber(props[propertyMappings.productionCost]),
    profit: extractNumber(props[propertyMappings.profit]),
    profitMargin: extractNumber(props[propertyMappings.profitMargin]),
    status: extractSelect(props[propertyMappings.status]),
    department: extractSelect(props[propertyMappings.department]),
    priority: extractSelect(props[propertyMappings.priority]),
    shippingLabelGenerated: extractCheckbox(props[propertyMappings.shippingLabelGenerated]),
    trackingNumber: extractText(props[propertyMappings.trackingNumber]),
    deliveryDate: extractDate(props[propertyMappings.deliveryDate]),
    notes: extractText(props[propertyMappings.notes]),
    internalNotes: extractText(props[propertyMappings.internalNotes]),
  };
}

/**
 * Build Notion filters from query parameters
 */
function buildNotionFilters(filters) {
  const notionFilters = [];

  if (filters.status) {
    notionFilters.push({
      property: propertyMappings.status,
      select: { equals: capitalizeFirst(filters.status) }
    });
  }

  if (filters.department) {
    notionFilters.push({
      property: propertyMappings.department,
      select: { equals: capitalizeFirst(filters.department) }
    });
  }

  if (filters.clientName) {
    notionFilters.push({
      property: propertyMappings.clientName,
      rich_text: { contains: filters.clientName }
    });
  }

  if (filters.dateFrom) {
    notionFilters.push({
      property: propertyMappings.orderDate,
      date: { on_or_after: filters.dateFrom }
    });
  }

  if (filters.dateTo) {
    notionFilters.push({
      property: propertyMappings.orderDate,
      date: { on_or_before: filters.dateTo }
    });
  }

  return notionFilters;
}

// Helper functions for extracting data from Notion properties

function extractText(prop) {
  if (!prop) return '';

  if (prop.type === 'title' && prop.title?.length > 0) {
    return prop.title[0].plain_text;
  }

  if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
    return prop.rich_text[0].plain_text;
  }

  return '';
}

function extractNumber(prop) {
  return prop?.number || 0;
}

function extractDate(prop) {
  return prop?.date?.start || null;
}

function extractSelect(prop) {
  return prop?.select?.name || '';
}

function extractCheckbox(prop) {
  return prop?.checkbox || false;
}

function extractPhone(prop) {
  return prop?.phone_number || '';
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default {
  createOrder,
  updateOrder,
  getOrder,
  queryOrders,
  updateStatus,
  syncToNotion,
};
