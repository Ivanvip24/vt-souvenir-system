/**
 * Delivery Date Calculator
 * Calculates production deadline and estimated delivery date based on order details
 */

/**
 * Calculate production days based on total quantity
 * Uses a tiered system:
 * - 1-50 items: 3 business days
 * - 51-100 items: 5 business days
 * - 101-250 items: 7 business days
 * - 251-500 items: 10 business days
 * - 500+ items: 14 business days
 */
export function getProductionDays(totalQuantity) {
  if (totalQuantity <= 50) return 3;
  if (totalQuantity <= 100) return 5;
  if (totalQuantity <= 250) return 7;
  if (totalQuantity <= 500) return 10;
  return 14;
}

/**
 * Get shipping days based on shipping method
 * Default: 5 days for standard courier (FedEx/DHL)
 */
export function getShippingDays(shippingMethod = 'standard') {
  const shippingTimes = {
    'express': 2,      // Express courier (next-day or 2-day)
    'standard': 5,     // Standard FedEx/DHL
    'economy': 7,      // Economy shipping
    'local': 1         // Local delivery
  };
  return shippingTimes[shippingMethod] || 5;
}

/**
 * Add business days to a date (skips weekends)
 */
export function addBusinessDays(startDate, days) {
  const date = new Date(startDate);
  let addedDays = 0;

  while (addedDays < days) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }

  return date;
}

/**
 * Calculate production deadline and estimated delivery date
 *
 * @param {Object} params
 * @param {Date} params.orderDate - When the order was placed
 * @param {number} params.totalQuantity - Total items in the order
 * @param {Date} [params.eventDate] - Client's event date (if applicable)
 * @param {string} [params.shippingMethod] - Shipping method
 * @param {number} [params.customProductionDays] - Override production time
 * @param {number} [params.customShippingDays] - Override shipping time
 *
 * @returns {Object} { productionDeadline, estimatedDeliveryDate, productionDays, shippingDays, isRushOrder }
 */
export function calculateDeliveryDates({
  orderDate = new Date(),
  totalQuantity = 1,
  eventDate = null,
  shippingMethod = 'standard',
  customProductionDays = null,
  customShippingDays = null
}) {
  // Calculate base production and shipping days
  const productionDays = customProductionDays || getProductionDays(totalQuantity);
  const shippingDays = customShippingDays || getShippingDays(shippingMethod);

  // Calculate dates
  const productionDeadline = addBusinessDays(orderDate, productionDays);
  const estimatedDeliveryDate = addBusinessDays(productionDeadline, shippingDays);

  // Check if it's a rush order (event date is before estimated delivery)
  let isRushOrder = false;
  let daysUntilEvent = null;

  if (eventDate) {
    const event = new Date(eventDate);
    daysUntilEvent = Math.ceil((event - orderDate) / (1000 * 60 * 60 * 24));
    isRushOrder = event < estimatedDeliveryDate;
  }

  return {
    productionDeadline: productionDeadline.toISOString().split('T')[0],
    estimatedDeliveryDate: estimatedDeliveryDate.toISOString().split('T')[0],
    productionDays,
    shippingDays,
    isRushOrder,
    daysUntilEvent,
    // Formatted versions for display
    productionDeadlineFormatted: formatDate(productionDeadline),
    estimatedDeliveryFormatted: formatDate(estimatedDeliveryDate)
  };
}

/**
 * Format date for display in Spanish
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('es-MX', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Check if an order is at risk of missing its event date
 */
export function checkDeliveryRisk(estimatedDeliveryDate, eventDate) {
  if (!eventDate) return { atRisk: false, message: null };

  const delivery = new Date(estimatedDeliveryDate);
  const event = new Date(eventDate);
  const daysBuffer = Math.ceil((event - delivery) / (1000 * 60 * 60 * 24));

  if (daysBuffer < 0) {
    return {
      atRisk: true,
      severity: 'critical',
      message: `⚠️ CRÍTICO: La entrega estimada es ${Math.abs(daysBuffer)} días DESPUÉS del evento`,
      daysBuffer
    };
  }

  if (daysBuffer < 2) {
    return {
      atRisk: true,
      severity: 'warning',
      message: `⚡ URGENTE: Solo ${daysBuffer} días de margen antes del evento`,
      daysBuffer
    };
  }

  if (daysBuffer < 5) {
    return {
      atRisk: true,
      severity: 'caution',
      message: `📅 Precaución: ${daysBuffer} días de margen antes del evento`,
      daysBuffer
    };
  }

  return {
    atRisk: false,
    severity: 'ok',
    message: `✅ ${daysBuffer} días de margen antes del evento`,
    daysBuffer
  };
}

export default {
  calculateDeliveryDates,
  getProductionDays,
  getShippingDays,
  addBusinessDays,
  formatDate,
  checkDeliveryRisk
};
