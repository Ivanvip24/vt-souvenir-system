import { query } from '../shared/database.js';
import { PRICING_TIERS, MOQ, calculateTieredPrice } from '../shared/pricing.js';

/**
 * Load a config value from pricing_config table
 */
async function getConfig(configKey) {
  const result = await query(
    'SELECT config_value FROM pricing_config WHERE config_key = $1',
    [configKey]
  );
  return result.rows.length > 0 ? result.rows[0].config_value : null;
}

/**
 * Load all pricing config as a flat object
 */
export async function getAllConfig() {
  const result = await query('SELECT config_key, config_value, description FROM pricing_config ORDER BY id');
  const config = {};
  for (const row of result.rows) {
    config[row.config_key] = { value: row.config_value, description: row.description };
  }
  return config;
}

/**
 * Get BOM cost for a product by matching product name
 * Returns { materialCost, laborCost, totalCost } per piece
 */
async function getBomCost(productName) {
  const nameLower = productName.toLowerCase();

  // Find the product by name (fuzzy match)
  const productResult = await query(
    `SELECT id, name, base_price, production_cost, labor_cost
     FROM products
     WHERE LOWER(name) LIKE $1 OR LOWER(name) LIKE $2
     LIMIT 1`,
    [`%${nameLower}%`, `%${nameLower.replace(/\s+/g, '%')}%`]
  );

  if (productResult.rows.length === 0) {
    return { materialCost: 0, laborCost: 0, totalCost: 0, productId: null, productName: productName };
  }

  const product = productResult.rows[0];

  // Get BOM components cost
  const componentsResult = await query(
    `SELECT
      rm.name as material_name,
      rm.cost_per_unit,
      pc.quantity_needed,
      pc.waste_percentage,
      pc.quantity_needed * rm.cost_per_unit * (1 + pc.waste_percentage / 100) as total_cost
    FROM product_components pc
    JOIN raw_materials rm ON pc.raw_material_id = rm.id
    WHERE pc.product_id = $1`,
    [product.id]
  );

  const materialCost = componentsResult.rows.reduce(
    (sum, c) => sum + parseFloat(c.total_cost || 0), 0
  );
  const laborCost = parseFloat(product.labor_cost || 0);

  return {
    materialCost: Math.round(materialCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    totalCost: Math.round((materialCost + laborCost) * 100) / 100,
    productId: product.id,
    productName: product.name,
    basePrice: parseFloat(product.base_price || 0),
    components: componentsResult.rows.map(c => ({
      name: c.material_name,
      costPerUnit: parseFloat(c.cost_per_unit),
      quantity: parseFloat(c.quantity_needed),
      waste: parseFloat(c.waste_percentage),
      total: Math.round(parseFloat(c.total_cost) * 100) / 100
    }))
  };
}

/**
 * Find the matching product key in PRICING_TIERS
 */
function findTierKey(productName) {
  const nameLower = productName.toLowerCase();
  for (const key of Object.keys(PRICING_TIERS)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return key;
    }
  }
  return null;
}

/**
 * Main pricing calculation function
 * Handles below-MOQ, standard, and high-volume scenarios
 */
export async function calculateCustomPrice({ productName, quantity }) {
  if (!productName || !quantity || quantity < 1) {
    return { error: 'Se requiere nombre de producto y cantidad válida' };
  }

  // 1. Get BOM cost
  const bom = await getBomCost(productName);

  // 2. Get config
  const [setupConfig, marginConfig, floorConfig, belowMoqConfig] = await Promise.all([
    getConfig('setup_cost_per_run'),
    getConfig('target_margins'),
    getConfig('floor_prices'),
    getConfig('below_moq_enabled')
  ]);

  // 3. Determine product key and MOQ
  const tierKey = findTierKey(productName);
  const moq = MOQ[tierKey] || MOQ.default;

  // 4. Get tier price for comparison
  const tierResult = calculateTieredPrice(productName, Math.max(quantity, moq), bom.basePrice);
  const tierPrice = tierResult.unitPrice || bom.basePrice;

  // 5. Determine scenario
  let scenario;
  if (quantity < moq) {
    scenario = 'below_moq';
  } else if (quantity >= 1000) {
    scenario = 'high_volume';
  } else {
    scenario = 'standard';
  }

  // 6. For standard orders, just return tier pricing
  if (scenario === 'standard') {
    const standardResult = calculateTieredPrice(productName, quantity, bom.basePrice);
    const unitPrice = standardResult.unitPrice || bom.basePrice;
    const margin = bom.totalCost > 0 ? ((unitPrice - bom.totalCost) / unitPrice * 100) : 0;

    return {
      productName: bom.productName || productName,
      quantity,
      bomCost: bom.totalCost,
      setupCostPerPiece: 0,
      totalCostPerPiece: bom.totalCost,
      suggestedPrice: unitPrice,
      floorPrice: null,
      finalPrice: unitPrice,
      margin: Math.round(margin * 10) / 10,
      tierPrice: unitPrice,
      tierInfo: standardResult.tierInfo,
      scenario,
      orderTotal: Math.round(unitPrice * quantity * 100) / 100,
      breakdown: [
        `Producto: ${bom.productName || productName}`,
        `Cantidad: ${quantity} pzas (dentro de MOQ: ${moq})`,
        `Precio por volumen: $${unitPrice.toFixed(2)}/pza (${standardResult.tierInfo})`,
        bom.totalCost > 0 ? `Costo de producción: $${bom.totalCost.toFixed(2)}/pza` : 'Costo BOM: no registrado',
        bom.totalCost > 0 ? `Margen: ${Math.round(margin * 10) / 10}%` : '',
        `Total pedido: $${(unitPrice * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
      ].filter(Boolean)
    };
  }

  // 7. Below-MOQ or high-volume: use cost-based pricing
  if (!belowMoqConfig?.enabled && scenario === 'below_moq') {
    return {
      error: `Pedidos por debajo del mínimo (${moq} pzas) no están habilitados actualmente`,
      moq,
      scenario
    };
  }

  // Setup cost (only for below-MOQ)
  const setupCostTotal = scenario === 'below_moq'
    ? (setupConfig?.by_product?.[tierKey] || setupConfig?.default || 150)
    : 0;
  const setupCostPerPiece = setupCostTotal > 0 ? Math.round(setupCostTotal / quantity * 100) / 100 : 0;

  // Target margin
  const targetMargin = marginConfig?.[scenario] || marginConfig?.default || 60;

  // Total cost per piece
  const totalCostPerPiece = Math.round((bom.totalCost + setupCostPerPiece) * 100) / 100;

  // Suggested price based on target margin: cost / (1 - margin/100)
  const suggestedPrice = totalCostPerPiece > 0
    ? Math.round(totalCostPerPiece / (1 - targetMargin / 100) * 100) / 100
    : tierPrice;

  // Floor price
  const floorPrice = floorConfig?.[tierKey] || 0;

  // Final price = max(suggested, floor)
  const finalPrice = Math.max(suggestedPrice, floorPrice);

  // Actual margin at final price
  const actualMargin = finalPrice > 0 && totalCostPerPiece > 0
    ? Math.round((finalPrice - totalCostPerPiece) / finalPrice * 1000) / 10
    : 0;

  const orderTotal = Math.round(finalPrice * quantity * 100) / 100;

  // Build breakdown
  const breakdown = [
    `Producto: ${bom.productName || productName}`,
    `Cantidad: ${quantity} pzas ${scenario === 'below_moq' ? `(por debajo del mínimo: ${moq})` : `(volumen alto)`}`,
  ];

  if (bom.totalCost > 0) {
    if (bom.materialCost > 0) breakdown.push(`Costo material: $${bom.materialCost.toFixed(2)}/pza`);
    if (bom.laborCost > 0) breakdown.push(`Costo mano de obra: $${bom.laborCost.toFixed(2)}/pza`);
  } else {
    breakdown.push('⚠️ Costo BOM no registrado — usando solo setup cost');
  }

  if (setupCostPerPiece > 0) {
    breakdown.push(`Costo setup ($${setupCostTotal} ÷ ${quantity} pzas): $${setupCostPerPiece.toFixed(2)}/pza`);
  }

  breakdown.push(`Costo total: $${totalCostPerPiece.toFixed(2)}/pza`);
  breakdown.push(`Margen objetivo: ${targetMargin}%`);
  breakdown.push(`Precio sugerido: $${suggestedPrice.toFixed(2)}/pza`);

  if (floorPrice > 0) {
    breakdown.push(`Precio piso: $${floorPrice.toFixed(2)}/pza`);
  }

  if (finalPrice !== suggestedPrice) {
    breakdown.push(`Precio final (ajustado a piso): $${finalPrice.toFixed(2)}/pza`);
  } else {
    breakdown.push(`Precio final: $${finalPrice.toFixed(2)}/pza`);
  }

  breakdown.push(`Margen real: ${actualMargin}%`);
  breakdown.push(`Total pedido: $${orderTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

  // Add comparison with standard pricing
  if (scenario === 'below_moq') {
    breakdown.push(`---`);
    breakdown.push(`Comparación: precio estándar (${moq}+ pzas) sería $${tierPrice.toFixed(2)}/pza`);
    const moqTotal = tierPrice * moq;
    breakdown.push(`Alternativa: ${moq} pzas a $${tierPrice.toFixed(2)} = $${moqTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
  } else if (scenario === 'high_volume') {
    breakdown.push(`---`);
    breakdown.push(`Comparación: precio estándar de lista sería $${tierPrice.toFixed(2)}/pza`);
    breakdown.push(`Ahorro vs lista: $${((tierPrice - finalPrice) * quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
  }

  return {
    productName: bom.productName || productName,
    quantity,
    bomCost: bom.totalCost,
    materialCost: bom.materialCost,
    laborCost: bom.laborCost,
    setupCostTotal,
    setupCostPerPiece,
    totalCostPerPiece,
    suggestedPrice,
    floorPrice,
    finalPrice,
    margin: actualMargin,
    tierPrice,
    scenario,
    moq,
    orderTotal,
    breakdown,
    components: bom.components
  };
}
