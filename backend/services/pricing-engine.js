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
  const tierResult = calculateTieredPrice(productName, Math.max(quantity, moq), bom.basePrice || 0);
  const tierPrice = parseFloat(tierResult.unitPrice) || parseFloat(bom.basePrice) || 0;

  // 4b. If no tier found and no BOM cost, we can't calculate
  if (!tierKey && bom.totalCost === 0 && tierPrice === 0) {
    return {
      error: `No se encontró "${productName}" en el catálogo ni tiene BOM registrado. Verifica el nombre del producto.`,
      productName,
      quantity,
      scenario: 'unknown'
    };
  }

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
    const standardResult = calculateTieredPrice(productName, quantity, bom.basePrice || 0);
    const unitPrice = parseFloat(standardResult.unitPrice) || parseFloat(bom.basePrice) || 0;
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

/**
 * List all active raw materials from the database.
 * @returns {Promise<Array>} Array of raw material rows
 */
export async function listAvailableMaterials() {
  const result = await query(
    'SELECT id, name, sku, cost_per_unit, unit_type, unit_label FROM raw_materials WHERE is_active = true ORDER BY name'
  );
  return result.rows;
}

// ============================================================
// REAL PRODUCTION CONSTANTS (from supplier receipts & axkan.art)
// ============================================================

// MDF Board specs from Maderas Madeplus (Factura A 27678, Feb 2026)
const MDF_BOARD = {
  '3mm': {
    widthCm: 122, heightCm: 244,           // full board
    costPerBoard: 125.00,                   // MDF price
    cutsPerBoard: 4,                        // cut into 4 pieces of 122×61cm
    costPerCut: 2.50,
    shippingPerBoard: 1.50,                 // $150 / 100 boards
    get totalCostPerBoard() {
      return this.costPerBoard + (this.cutsPerBoard * this.costPerCut) + this.shippingPerBoard;
    },
    get areaCm2() { return this.widthCm * this.heightCm; },
    get costPerCm2() { return this.totalCostPerBoard / this.areaCm2; }
  },
  '4.5mm': {
    widthCm: 122, heightCm: 244,
    costPerBoard: 125.00,                   // TODO: ask Ivan for 4.5mm price
    cutsPerBoard: 4,
    costPerCut: 2.50,
    shippingPerBoard: 1.50,
    get totalCostPerBoard() {
      return this.costPerBoard + (this.cutsPerBoard * this.costPerCut) + this.shippingPerBoard;
    },
    get areaCm2() { return this.widthCm * this.heightCm; },
    get costPerCm2() { return this.totalCostPerBoard / this.areaCm2; }
  }
};

// Product dimensions from axkan.art product pages
const PRODUCT_DIMENSIONS = {
  'iman_chico_cuadrado':    { w: 5, h: 5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_chico_circular':    { w: 5, h: 5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_chico_alargado':    { w: 8, h: 4, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_mediano_cuadrado':  { w: 7.5, h: 7.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_mediano_circular':  { w: 7.5, h: 7.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_mediano_alargado':  { w: 5.5, h: 11.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_grande_cuadrado':   { w: 9.5, h: 9.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 12 },
  'iman_grande_circular':   { w: 9.5, h: 9.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 12 },
  'iman_grande_alargado':   { w: 7.5, h: 13.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 12 },
  'iman_3d_cuadrado':       { w: 7.5, h: 7.5, mdf: '3mm', magnets: 1, layers: 2, pzasPerTabloide: 18 },
  'iman_3d_alargado':       { w: 11.5, h: 5.5, mdf: '3mm', magnets: 1, layers: 2, pzasPerTabloide: 18 },
  'iman_foil_cuadrado':     { w: 7.5, h: 7.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'iman_foil_alargado':     { w: 11.5, h: 5.5, mdf: '3mm', magnets: 1, pzasPerTabloide: 18 },
  'llavero_cuadrado':       { w: 5, h: 5, mdf: '3mm', magnets: 0, pzasPerTabloide: 18 },
  'llavero_circular':       { w: 5, h: 5, mdf: '3mm', magnets: 0, pzasPerTabloide: 18 },
  'llavero_alargado':       { w: 8, h: 4, mdf: '3mm', magnets: 0, pzasPerTabloide: 18 },
  'destapador':             { w: 11, h: 5, mdf: '3mm', magnets: 1, pzasPerTabloide: 16 },
  'portallaves':            { w: 19.5, h: 12.5, mdf: '4.5mm', magnets: 2, pzasPerTabloide: 4 },
  'portarretratos':         { w: 17.45, h: 12.5, mdf: '3mm', magnets: 0, pzasPerTabloide: 4 },
  'boton':                  { w: 4, h: 4, mdf: null, magnets: 0, pzasPerTabloide: 0 },
};

// Production layout: 1 board (122×244) → 4 pieces (122×61) → 6 tabloides each → pieces
// Tabloides per quarter-board: 6
// Quarter-boards per full board: 4
// Total tabloides per board: 24
const TABLOIDES_PER_QUARTER = 6;
const QUARTERS_PER_BOARD = 4;

// Labor calculation from real payroll data
// 5 production employees × $2,100/week = $10,500/week
// Average weekly output: ~8,667 pieces (from production tracking Mar 9-14, 2026)
// Labor cost per piece: $10,500 / 8,667 ≈ $1.21
const LABOR = {
  weeklyPayrollPerEmployee: 2100,
  productionEmployees: 5,
  avgWeeklyOutput: 8667,      // pieces across all employees
  get costPerPiece() {
    return (this.weeklyPayrollPerEmployee * this.productionEmployees) / this.avgWeeklyOutput;
  }
};

// Sale prices from AXKAN catalog (for margin calculation)
const CATALOG_PRICES = {
  'iman_chico':     { moq100: 8, moq1000: 6 },
  'iman_mediano':   { moq100: 11, moq1000: 8 },
  'iman_grande':    { moq100: 15, moq1000: 12 },
  'iman_3d':        { moq100: 15, moq1000: 12 },
  'iman_foil':      { moq100: 13, moq1000: 10 },
  'llavero':        { moq100: 10, moq1000: 7 },
  'destapador':     { moq100: 20, moq1000: 15 },
  'portallaves':    { moq100: 40, moq1000: 40 },
  'portarretratos': { moq100: 40, moq1000: 40 },
  'boton':          { moq100: 8, moq1000: 6 },
};

/**
 * Find the closest standard product to given dimensions
 */
function findClosestProduct(widthCm, heightCm, productType) {
  const area = widthCm * heightCm;
  const typeLower = (productType || '').toLowerCase();

  // Filter by product type if provided
  let candidates = Object.entries(PRODUCT_DIMENSIONS);
  if (typeLower) {
    const typeFiltered = candidates.filter(([key]) => key.includes(typeLower.replace(/\s+/g, '_')));
    if (typeFiltered.length > 0) candidates = typeFiltered;
  }

  // Find closest by area
  let closest = null;
  let closestDiff = Infinity;
  for (const [key, dims] of candidates) {
    if (!dims.w || !dims.h) continue;
    const diff = Math.abs(dims.w * dims.h - area);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = { key, ...dims };
    }
  }
  return closest;
}

/**
 * Estimate pieces per tabloide for a custom size based on tabloide area
 * Tabloide is roughly contained within a 122×61cm quarter-board divided by 6
 * Approximate tabloide area: ~(40×28cm) = ~1120 cm² usable
 */
function estimatePiecesPerTabloide(widthCm, heightCm) {
  // Approximate tabloide usable dimensions (~40cm × 28cm based on 122×61 / 6 layout)
  const tabloidW = 40;
  const tabloidH = 28;
  const cols = Math.floor(tabloidW / widthCm);
  const rows = Math.floor(tabloidH / heightCm);
  // Also try rotated
  const colsR = Math.floor(tabloidW / heightCm);
  const rowsR = Math.floor(tabloidH / widthCm);
  return Math.max(cols * rows, colsR * rowsR, 1);
}

/**
 * Estimate a hypothetical production cost using REAL board-based costing.
 *
 * Uses actual MDF board prices (from supplier receipts), real product dimensions
 * (from axkan.art), and real labor costs (from payroll data) to calculate
 * accurate per-piece production costs.
 */
export async function estimateHypotheticalCost({ description, materials, dimensions, layers = 1, finish = null, quantity = 100 }) {
  const round2 = (val) => Math.round(val * 100) / 100;

  // 1. Fetch all active raw materials from DB (for non-MDF consumables)
  const result = await query(
    'SELECT id, name, sku, cost_per_unit, unit_type, unit_label FROM raw_materials WHERE is_active = true'
  );
  const allMaterials = result.rows;

  // 2. Determine dimensions
  const width = (dimensions && dimensions.width) || 7.5;
  const height = (dimensions && dimensions.height) || 7.5;
  const pieceArea = width * height;

  // 3. Detect product type from description
  const descLower = (description || '').toLowerCase();
  let productType = 'iman_mediano'; // default
  if (descLower.includes('llavero') || descLower.includes('keychain')) productType = 'llavero';
  else if (descLower.includes('destapador') || descLower.includes('opener')) productType = 'destapador';
  else if (descLower.includes('portallaves') || descLower.includes('key holder')) productType = 'portallaves';
  else if (descLower.includes('portarretrato') || descLower.includes('frame')) productType = 'portarretratos';
  else if (descLower.includes('3d')) productType = 'iman_3d';
  else if (descLower.includes('foil')) productType = 'iman_foil';
  else if (descLower.includes('boton') || descLower.includes('button')) productType = 'boton';
  else if (descLower.includes('grande') || pieceArea > 80) productType = 'iman_grande';
  else if (descLower.includes('chico') || descLower.includes('pequeño') || pieceArea <= 30) productType = 'iman_chico';

  // 4. Find closest standard product and MDF thickness
  const closest = findClosestProduct(width, height, productType);
  const mdfThickness = closest?.mdf || '3mm';
  const board = MDF_BOARD[mdfThickness] || MDF_BOARD['3mm'];
  const numLayers = layers || closest?.layers || 1;
  const numMagnets = closest?.magnets ?? 1;

  // 5. Calculate MDF cost per piece (board-based)
  // Board cost per cm²: totalCostPerBoard / (122 * 244)
  const mdfCostPerCm2 = board.costPerCm2;
  const mdfCostPerPiece = round2(mdfCostPerCm2 * pieceArea * numLayers);

  // 6. Estimate yield for context
  const pzasPerTabloide = closest?.pzasPerTabloide || estimatePiecesPerTabloide(width, height);
  const pzasPerBoard = pzasPerTabloide * TABLOIDES_PER_QUARTER * QUARTERS_PER_BOARD;

  const materialBreakdown = [];
  const unmatchedMaterials = [];
  let totalMaterialCost = 0;

  // Add MDF as first material
  materialBreakdown.push({
    name: `MDF ${mdfThickness}${numLayers > 1 ? ` (×${numLayers} capas)` : ''}`,
    matchedMaterial: `Tabla ${board.widthCm}×${board.heightCm}cm → ${pieceArea}cm²/pza`,
    costPerUnit: round2(board.totalCostPerBoard),
    quantityUsed: round2(pieceArea * numLayers),
    subtotal: mdfCostPerPiece,
    detail: `$${board.totalCostPerBoard.toFixed(2)}/tabla ÷ ~${pzasPerBoard} pzas`
  });
  totalMaterialCost += mdfCostPerPiece;

  // 7. Match remaining materials from DB (magnets, glue, celofán, etc.)
  const materialsToMatch = materials.filter(m => {
    const l = m.toLowerCase();
    return !l.includes('mdf') && !l.includes('tabla') && !l.includes('board');
  });

  for (const materialName of materialsToMatch) {
    const lowerName = materialName.toLowerCase();

    let matched = allMaterials.find(
      (m) => m.name.toLowerCase() === lowerName
    );
    if (!matched) {
      matched = allMaterials.find(
        (m) =>
          m.name.toLowerCase().includes(lowerName) ||
          lowerName.includes(m.name.toLowerCase())
      );
    }

    if (!matched) {
      unmatchedMaterials.push(materialName);
      materialBreakdown.push({
        name: materialName,
        matchedMaterial: null,
        costPerUnit: 0,
        quantityUsed: 0,
        subtotal: 0
      });
      continue;
    }

    // For magnets, use numMagnets count
    const isMagnet = lowerName.includes('imán') || lowerName.includes('iman') || lowerName.includes('ferrita') || lowerName.includes('magnet');
    const qty = isMagnet ? numMagnets : 1;
    const subtotal = round2(parseFloat(matched.cost_per_unit) * qty);

    totalMaterialCost += subtotal;
    materialBreakdown.push({
      name: materialName,
      matchedMaterial: matched.name,
      costPerUnit: round2(parseFloat(matched.cost_per_unit)),
      quantityUsed: qty,
      subtotal
    });
  }

  // 8. Labor cost (from real payroll / production data)
  const laborBase = round2(LABOR.costPerPiece);
  const labor = round2(laborBase * (1 + (numLayers - 1) * 0.3));

  // 9. Waste: ~8% for standard, more for complex products
  const wastePercent = 8 + (numLayers - 1) * 3;
  const wasteCost = round2(totalMaterialCost * (wastePercent / 100));

  // 10. Total cost per unit
  const totalCost = round2(totalMaterialCost + wasteCost + labor);

  // 11. Price suggestions based on catalog comparison
  const catalogKey = productType.replace(/_cuadrado|_circular|_alargado/, '');
  const catalogPrice = CATALOG_PRICES[catalogKey];
  let suggestedLow, suggestedMid, suggestedHigh;

  if (catalogPrice) {
    // Scale from closest standard product by area ratio
    const closestArea = closest ? closest.w * closest.h : pieceArea;
    const areaRatio = pieceArea / closestArea;
    suggestedLow = round2(catalogPrice.moq1000 * areaRatio);
    suggestedMid = round2(catalogPrice.moq100 * areaRatio);
    suggestedHigh = round2(catalogPrice.moq100 * areaRatio * 1.3);
  } else {
    suggestedLow = round2(totalCost * 2.5);
    suggestedMid = round2(totalCost * 3.0);
    suggestedHigh = round2(totalCost * 3.5);
  }

  // Ensure suggested prices are above cost
  suggestedLow = Math.max(suggestedLow, round2(totalCost * 1.5));
  suggestedMid = Math.max(suggestedMid, round2(totalCost * 2.0));
  suggestedHigh = Math.max(suggestedHigh, round2(totalCost * 2.5));

  // 12. Margins at suggested prices
  const marginAtMid = round2(((suggestedMid - totalCost) / suggestedMid) * 100);

  // 13. Confidence
  const totalRequested = materialsToMatch.length;
  const matchedCount = totalRequested - unmatchedMaterials.length;
  let confidence;
  if (matchedCount === totalRequested && totalMaterialCost > 0) {
    confidence = 'high';
  } else if (totalRequested > 0 && matchedCount / totalRequested > 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    description,
    dimensions: { width, height, area: pieceArea },
    productType: catalogKey,
    mdfThickness,
    layers: numLayers,
    estimatedCostPerUnit: round2(totalCost),
    materialBreakdown,
    laborEstimate: round2(labor),
    wastePercent,
    wasteCost: round2(wasteCost),
    totalForQuantity: round2(totalCost * quantity),
    quantity,
    confidence,
    suggestedPriceRange: { low: suggestedLow, mid: suggestedMid, high: suggestedHigh },
    marginAtMidPrice: marginAtMid,
    yieldInfo: {
      pzasPerTabloide,
      pzasPerBoard,
      boardsNeeded: Math.ceil(quantity / pzasPerBoard)
    },
    closestProduct: closest ? closest.key : null,
    unmatchedMaterials
  };
}