/**
 * Server-Side Pricing Logic
 *
 * IMPORTANT: This is the SOURCE OF TRUTH for all pricing.
 * Frontend should query this, not have its own hardcoded prices.
 */

// Tiered pricing configuration - SINGLE SOURCE OF TRUTH
// NOTE: Actual minimum is 50 pieces, but marketing displays "100 pieces minimum"
export const PRICING_TIERS = {
  'imanes de mdf': [
    { min: 50, max: 999, price: 11.00 },
    { min: 1000, max: Infinity, price: 8.00 }
  ],
  'imán 3d mdf 3mm': [
    { min: 50, max: 999, price: 15.00 },
    { min: 1000, max: Infinity, price: 12.00 }
  ],
  'imán de mdf con foil': [
    { min: 50, max: 999, price: 15.00 },
    { min: 1000, max: Infinity, price: 12.00 }
  ],
  'llaveros de mdf': [
    { min: 50, max: 999, price: 10.00 },
    { min: 1000, max: Infinity, price: 7.00 }
  ],
  'destapador de mdf': [
    { min: 50, max: 999, price: 20.00 },
    { min: 1000, max: Infinity, price: 17.00 }
  ],
  'botones metálicos': [
    { min: 50, max: 999, price: 8.00 },
    { min: 1000, max: Infinity, price: 6.00 }
  ],
  'portallaves de mdf': [
    { min: 20, max: Infinity, price: 40.00 }
  ],
  'portaretratos de mdf': [
    { min: 20, max: Infinity, price: 40.00 }
  ],
  'souvenir box': [
    { min: 1, max: Infinity, price: 2250.00 }
  ]
};

// Minimum order quantities (actual validation values)
// NOTE: Marketing displays "100 pieces minimum" but we accept 50
export const MOQ = {
  default: 50,
  'portallaves de mdf': 20,
  'portaretratos de mdf': 20,
  'souvenir box': 1
};

/**
 * Get the correct price for a product based on quantity
 * @param {string} productName - Product name from database
 * @param {number} quantity - Order quantity
 * @param {number} fallbackPrice - Database base_price as fallback
 * @returns {Object} { unitPrice, tierInfo, isValid, error }
 */
export function calculateTieredPrice(productName, quantity, fallbackPrice) {
  const nameLower = productName.toLowerCase();

  // Find matching tier configuration
  let tiers = null;
  let matchedKey = null;

  for (const [key, tierArray] of Object.entries(PRICING_TIERS)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      tiers = tierArray;
      matchedKey = key;
      break;
    }
  }

  // Get minimum order quantity
  const moq = MOQ[matchedKey] || MOQ.default;

  // Validate minimum quantity
  if (quantity < moq) {
    return {
      unitPrice: null,
      tierInfo: null,
      isValid: false,
      error: `Cantidad mínima para ${productName}: ${moq} piezas`
    };
  }

  // If no tiers found, use fallback price
  if (!tiers) {
    return {
      unitPrice: parseFloat(fallbackPrice),
      tierInfo: 'Precio base',
      isValid: true,
      error: null
    };
  }

  // Find applicable tier
  const tier = tiers.find(t => quantity >= t.min && quantity <= t.max);

  if (!tier) {
    return {
      unitPrice: parseFloat(fallbackPrice),
      tierInfo: 'Precio base (cantidad fuera de rango)',
      isValid: true,
      error: null
    };
  }

  return {
    unitPrice: tier.price,
    tierInfo: `${tier.min}${tier.max === Infinity ? '+' : '-' + tier.max} piezas`,
    isValid: true,
    error: null
  };
}

/**
 * Validate an entire order's pricing
 * @param {Array} items - Array of { productName, quantity, claimedPrice }
 * @param {Object} productMap - Map of productName -> { base_price }
 * @returns {Object} { isValid, correctedItems, errors }
 */
export function validateOrderPricing(items, productMap) {
  const errors = [];
  const correctedItems = [];

  for (const item of items) {
    const product = productMap[item.productId];

    if (!product) {
      errors.push(`Producto ID ${item.productId} no encontrado`);
      continue;
    }

    const pricing = calculateTieredPrice(
      product.name,
      item.quantity,
      product.base_price
    );

    if (!pricing.isValid) {
      errors.push(pricing.error);
      continue;
    }

    // Check if frontend sent a different price (potential manipulation)
    if (item.unitPrice && Math.abs(item.unitPrice - pricing.unitPrice) > 0.01) {
      console.warn(`⚠️ Price mismatch for ${product.name}: ` +
        `Client sent $${item.unitPrice}, server calculated $${pricing.unitPrice}`);
    }

    correctedItems.push({
      ...item,
      unitPrice: pricing.unitPrice, // ALWAYS use server-calculated price
      tierInfo: pricing.tierInfo
    });
  }

  return {
    isValid: errors.length === 0,
    correctedItems,
    errors
  };
}

export default {
  PRICING_TIERS,
  MOQ,
  calculateTieredPrice,
  validateOrderPricing
};
