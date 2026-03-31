/**
 * Delivery Date Calculator
 * Calculates production deadline and estimated delivery date based on order details
 */

/**
 * Calculate production days based on total quantity
 * Includes 2 days for design + production time:
 * - 1-499 items: 2 (design) + 3 (production) = 5 business days
 * - 500-1999 items: 2 (design) + 4 (production) = 6 business days
 * - 2000+ items: 2 (design) + 5 (production) = 7 business days
 */
const DESIGN_DAYS = 2;

export function getProductionDays(totalQuantity) {
  if (totalQuantity <= 499) return DESIGN_DAYS + 3;
  if (totalQuantity <= 1999) return DESIGN_DAYS + 4;
  return DESIGN_DAYS + 5;
}

/**
 * Get shipping days based on shipping method
 * Default: 5 days for standard courier (FedEx/DHL)
 */
export function getShippingDays(shippingMethod = 'standard') {
  const shippingTimes = {
    'express': 2,      // Express courier (next-day or 2-day)
    'standard': 7,     // Standard FedEx/DHL (5-7 days, promise 7)
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
