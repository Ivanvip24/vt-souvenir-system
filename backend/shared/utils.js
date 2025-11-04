import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths } from 'date-fns';

/**
 * Generate unique order number
 * Format: ORD-YYYYMMDD-XXXX
 */
export function generateOrderNumber() {
  const date = format(new Date(), 'yyyyMMdd');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD-${date}-${random}`;
}

/**
 * Calculate profit and margin
 */
export function calculateProfit(totalPrice, totalCost) {
  const profit = totalPrice - totalCost;
  const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;
  return {
    profit: parseFloat(profit.toFixed(2)),
    margin: parseFloat(margin.toFixed(2))
  };
}

/**
 * Get date range for period type
 */
export function getDateRange(periodType, date = new Date()) {
  switch (periodType) {
    case 'today':
      return {
        start: startOfDay(date),
        end: endOfDay(date)
      };

    case 'yesterday':
      return {
        start: startOfDay(subDays(date, 1)),
        end: endOfDay(subDays(date, 1))
      };

    case 'this_week':
      return {
        start: startOfWeek(date, { weekStartsOn: 1 }), // Monday
        end: endOfWeek(date, { weekStartsOn: 1 })
      };

    case 'last_week':
      const lastWeek = subWeeks(date, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 1 })
      };

    case 'this_month':
      return {
        start: startOfMonth(date),
        end: endOfMonth(date)
      };

    case 'last_month':
      const lastMonth = subMonths(date, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth)
      };

    case 'this_year':
      return {
        start: startOfYear(date),
        end: endOfYear(date)
      };

    default:
      throw new Error(`Unknown period type: ${periodType}`);
  }
}

/**
 * Format currency for Mexico
 */
export function formatCurrency(amount, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date, formatString = 'dd/MM/yyyy') {
  return format(new Date(date), formatString);
}

/**
 * Format date for Mexico timezone
 */
export function formatDateMX(date) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeZone: 'America/Mexico_City'
  }).format(new Date(date));
}

/**
 * Validate email
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate Mexican phone number
 */
export function isValidPhone(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // Mexican phone numbers are 10 digits
  return digits.length === 10;
}

/**
 * Format Mexican phone number
 */
export function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Sleep utility for delays
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry(fn, maxAttempts = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
}

/**
 * Sanitize text for safe storage
 */
export function sanitizeText(text) {
  if (!text) return '';
  return text.trim().replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status) {
  const colors = {
    new: '#3B82F6',        // blue
    design: '#8B5CF6',     // purple
    printing: '#F59E0B',   // orange
    cutting: '#EAB308',    // yellow
    counting: '#10B981',   // green
    shipping: '#06B6D4',   // cyan
    delivered: '#22C55E',  // success green
    cancelled: '#EF4444'   // red
  };
  return colors[status] || '#6B7280'; // gray default
}

/**
 * Generate QR code data for production tracking
 */
export function generateQRData(orderId, itemId, productName, quantity) {
  return JSON.stringify({
    orderId,
    itemId,
    productName,
    quantity,
    timestamp: new Date().toISOString()
  });
}

export default {
  generateOrderNumber,
  calculateProfit,
  getDateRange,
  formatCurrency,
  formatDate,
  formatDateMX,
  isValidEmail,
  isValidPhone,
  formatPhone,
  sleep,
  retry,
  sanitizeText,
  calculatePercentageChange,
  getStatusColor,
  generateQRData
};
