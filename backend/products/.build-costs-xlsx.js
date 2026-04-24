#!/usr/bin/env node
/**
 * One-off builder for products/costs.xlsx.
 * Produces a styled workbook with:
 *   - Cross-sheet formulas (margin + cost_per_piece live-recalculate in Numbers)
 *   - Green fill on every user-editable input cell
 *   - Dark headers, rosa titles, currency / percent / integer formats, bold
 *     accents, TOTAL row
 *
 * Run from repo root:  node products/.build-costs-xlsx.js
 * The resulting file is committed. Edit the xlsx by hand afterwards; only
 * re-run this script if you want to regenerate from scratch.
 */

const path = require('path');
const ExcelJS = require(path.resolve(__dirname, '../backend/node_modules/exceljs'));

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════
const PIECES_PER_DAY = 2400;
const WORK_DAYS = 20;

const productsData = [
  { sku: 'axk1',  name: 'Imán Mediano (MDF 3mm)',     price_unit: 11,    price_wholesale: 8,    notes: '' },
  { sku: 'axk2',  name: 'Imán 3D MDF',                price_unit: 15,    price_wholesale: 13.5, notes: 'Relieve 3D' },
  { sku: 'axk3',  name: 'Imán NFC',                   price_unit: null,  price_wholesale: null, notes: 'Incluye chip NFC' },
  { sku: 'axk4',  name: 'Imán Reina',                 price_unit: null,  price_wholesale: null, notes: '' },
  { sku: 'axk5',  name: 'Espejo / Mirror',            price_unit: null,  price_wholesale: null, notes: 'Línea de espejos' },
  { sku: 'axk6',  name: 'Llavero de MDF',             price_unit: 10,    price_wholesale: null, notes: '' },
  { sku: 'axk7',  name: 'Llavero Grueso (MDF 4.5mm)', price_unit: null,  price_wholesale: null, notes: '' },
  { sku: 'axk8',  name: 'Destapador de MDF',          price_unit: 20,    price_wholesale: null, notes: '' },
  { sku: 'axk9',  name: 'Portallaves de MDF',         price_unit: 45,    price_wholesale: null, notes: '' },
  { sku: 'axk10', name: 'Portarretratos de MDF',      price_unit: 40,    price_wholesale: null, notes: '' },
  { sku: 'axk11', name: 'Souvenir Box',               price_unit: 2250,  price_wholesale: 1125, notes: 'Caja premium' },
  { sku: 'axk12', name: 'Botón Metálico',             price_unit: 8,     price_wholesale: 4,    notes: '' },
  { sku: 'axk13', name: 'Jabón Artesanal',            price_unit: null,  price_wholesale: null, notes: '' },
  { sku: 'axk14', name: 'Empaque Decorativo',         price_unit: null,  price_wholesale: null, notes: '' },
];

// Mode: 'flat' (use cost_per_piece literal), 'bulk' (bulk/divisors), 'monthly' (overhead)
const materialsData = [
  { material: 'MDF 3mm 122×244',         mode: 'bulk',    bulk: 140,   divs: [4, 6, 17, 1], variable: 'no',  notes: '1 board → 4 sub-boards → 6 tabloides → 17 magnets = 408 piezas' },
  { material: 'MDF 4.5mm 122×244',       mode: 'flat',    value: null,                     variable: 'no',  notes: 'Por calcular — llaveros gruesos y portallaves' },
  { material: 'Imán pieza',              mode: 'flat',    value: 0.60,                     variable: 'no',  notes: 'Imán individual adherido al MDF' },
  { material: 'Adhesivo',                mode: 'flat',    value: 0.18,                     variable: 'no',  notes: 'Desde recibos de compra' },
  { material: 'Bolsa',                   mode: 'flat',    value: 0.14,                     variable: 'no',  notes: 'Desde recibos de compra' },
  { material: 'Pegamento',               mode: 'flat',    value: 0.004,                    variable: 'no',  notes: '' },
  { material: 'Caja',                    mode: 'flat',    value: 0.034,                    variable: 'no',  notes: '' },
  { material: 'Envío',                   mode: 'flat',    value: 0.712,                    variable: 'no',  notes: '' },
  { material: 'Laminado',                mode: 'flat',    value: 0.10,                     variable: 'no',  notes: '' },
  { material: 'Corte',                   mode: 'flat',    value: 0.32,                     variable: 'no',  notes: 'Costo de corte láser por pieza' },
  { material: 'Cálculo administrativo',  mode: 'flat',    value: 0.014,                    variable: 'no',  notes: '' },
  { material: 'Otros (consumibles)',     mode: 'flat',    value: 0.30,                     variable: 'no',  notes: 'mojo / drogs' },
  { material: 'Renta',                   mode: 'monthly', monthly: 36000,                  variable: 'yes', notes: 'Taller + oficina' },
  { material: 'Luz eléctrica',           mode: 'monthly', monthly: 4800,                   variable: 'yes', notes: 'Recibo CFE aprox' },
  { material: 'Mano de obra',            mode: 'monthly', monthly: 25200,                  variable: 'yes', notes: 'Salarios fijos mensuales' },
];

// ═══════════════════════════════════════════════════════
// STYLE CONSTANTS
// ═══════════════════════════════════════════════════════
const ROSA = 'FFE72A88';
const ROSA_LIGHT = 'FFFCE7F3';
const DARK = 'FF1F2937';
const WHITE = 'FFFFFFFF';
const GREEN = 'FFD1FAE5';          // input fill
const GREEN_DARK = 'FF065F46';     // input text
const AMBER = 'FFFEF3C7';
const AMBER_DARK = 'FF92400E';
const GRAY_LIGHT = 'FFF3F4F6';
const GRAY_MID = 'FF6B7280';
const GRAY_SOFT = 'FFF9FAFB';
const BORDER_GRAY = 'FFE5E7EB';

const fmtCurrency = '"$"#,##0.00';
const fmtPercent = '0.0"%"';
const fmtInt = '#,##0';

// Helpers
const titleStyle = {
  font: { name: 'Helvetica Neue', size: 16, bold: true, color: { argb: WHITE } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA } },
  alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  border: {
    bottom: { style: 'thick', color: { argb: ROSA } },
  },
};

const headerStyle = {
  font: { name: 'Helvetica Neue', size: 10, bold: true, color: { argb: WHITE } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } },
  alignment: { vertical: 'middle', horizontal: 'center' },
  border: {
    top:    { style: 'thin', color: { argb: BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
    left:   { style: 'thin', color: { argb: BORDER_GRAY } },
    right:  { style: 'thin', color: { argb: BORDER_GRAY } },
  },
};

const inputCellStyle = {
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } },
  font: { name: 'Helvetica Neue', size: 11, color: { argb: GREEN_DARK }, bold: true },
  border: {
    top:    { style: 'thin', color: { argb: BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
    left:   { style: 'thin', color: { argb: BORDER_GRAY } },
    right:  { style: 'thin', color: { argb: BORDER_GRAY } },
  },
  alignment: { vertical: 'middle' },
};

const computedCellStyle = {
  font: { name: 'Helvetica Neue', size: 11, color: { argb: DARK } },
  border: {
    top:    { style: 'thin', color: { argb: BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
    left:   { style: 'thin', color: { argb: BORDER_GRAY } },
    right:  { style: 'thin', color: { argb: BORDER_GRAY } },
  },
  alignment: { vertical: 'middle' },
};

function applyStyle(cell, base, extra) {
  const merged = Object.assign({}, base || {}, extra || {});
  if (base && base.font && extra && extra.font) {
    merged.font = Object.assign({}, base.font, extra.font);
  }
  if (base && base.fill && extra && extra.fill) {
    merged.fill = Object.assign({}, base.fill, extra.fill);
  }
  if (base && base.alignment && extra && extra.alignment) {
    merged.alignment = Object.assign({}, base.alignment, extra.alignment);
  }
  if (base && base.border && extra && extra.border) {
    merged.border = Object.assign({}, base.border, extra.border);
  }
  Object.assign(cell, merged);
}

// ═══════════════════════════════════════════════════════
// BUILD WORKBOOK
// ═══════════════════════════════════════════════════════
const wb = new ExcelJS.Workbook();
wb.creator = 'AXKAN';
wb.created = new Date();

// ───────── SHEET 1 · Config ─────────
const config = wb.addWorksheet('Config', { views: [{ showGridLines: false }] });

config.mergeCells('A1:C1');
const configTitle = config.getCell('A1');
configTitle.value = '⚙️  CONFIGURACIÓN';
applyStyle(configTitle, titleStyle);
config.getRow(1).height = 32;

config.getCell('A3').value = 'KEY';
config.getCell('B3').value = 'VALUE';
config.getCell('C3').value = 'NOTES';
['A3', 'B3', 'C3'].forEach(ref => applyStyle(config.getCell(ref), headerStyle));
config.getRow(3).height = 22;

// Row 4: pieces_per_day
config.getCell('A4').value = 'pieces_per_day';
applyStyle(config.getCell('A4'), computedCellStyle, { font: { bold: true, size: 11 } });
config.getCell('B4').value = PIECES_PER_DAY;
applyStyle(config.getCell('B4'), inputCellStyle, {
  font: { size: 14, bold: true },
  alignment: { horizontal: 'center' },
  numFmt: fmtInt,
});
config.getCell('B4').numFmt = fmtInt;
config.getCell('C4').value = 'Total daily production across all products combined';
applyStyle(config.getCell('C4'), computedCellStyle, { font: { italic: true, color: { argb: GRAY_MID }, size: 10 } });

// Row 5: work_days_per_month
config.getCell('A5').value = 'work_days_per_month';
applyStyle(config.getCell('A5'), computedCellStyle, { font: { bold: true, size: 11 } });
config.getCell('B5').value = WORK_DAYS;
applyStyle(config.getCell('B5'), inputCellStyle, {
  font: { size: 14, bold: true },
  alignment: { horizontal: 'center' },
});
config.getCell('B5').numFmt = fmtInt;
config.getCell('C5').value = '5 days per week × 4 weeks';
applyStyle(config.getCell('C5'), computedCellStyle, { font: { italic: true, color: { argb: GRAY_MID }, size: 10 } });

config.getRow(4).height = 26;
config.getRow(5).height = 26;

// Derived: monthly capacity info row
config.mergeCells('A7:C7');
const capacityInfo = config.getCell('A7');
capacityInfo.value = { formula: `"Capacidad mensual: " & TEXT(B4*B5,"#,##0") & " piezas/mes"`, result: `Capacidad mensual: ${(PIECES_PER_DAY * WORK_DAYS).toLocaleString('en-US')} piezas/mes` };
applyStyle(capacityInfo, {
  font: { name: 'Helvetica Neue', size: 12, italic: true, color: { argb: ROSA } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA_LIGHT } },
  alignment: { vertical: 'middle', horizontal: 'center' },
});
config.getRow(7).height = 28;

config.getColumn('A').width = 26;
config.getColumn('B').width = 18;
config.getColumn('C').width = 55;

// ───────── SHEET 3 · Materials (build first so formulas resolve) ─────────
const materials = wb.addWorksheet('Materials', { views: [{ showGridLines: false, state: 'frozen', ySplit: 3 } ]});

// Title
materials.mergeCells('A1:J1');
const matTitle = materials.getCell('A1');
matTitle.value = '🧮  MATERIALES & COSTOS POR PIEZA';
applyStyle(matTitle, titleStyle);
materials.getRow(1).height = 36;

// Headers (row 3)
const matHeaders = [
  'MATERIAL',
  'COSTO / PIEZA',
  'VARIABLE',
  'COSTO BULK',
  'DIV 1',
  'DIV 2',
  'DIV 3',
  'DIV 4',
  'COSTO MENSUAL',
  'NOTAS',
];
matHeaders.forEach((h, i) => {
  const cell = materials.getCell(3, i + 1);
  cell.value = h;
  applyStyle(cell, headerStyle);
});
materials.getRow(3).height = 26;

// Data rows start at row 4
const MAT_START_ROW = 4;

materialsData.forEach((m, idx) => {
  const row = MAT_START_ROW + idx;

  // Column A: material name — INPUT
  const matCell = materials.getCell(row, 1);
  matCell.value = m.material;
  applyStyle(matCell, inputCellStyle, { font: { size: 11, bold: true } });

  // Column B: cost_per_piece — COMPUTED or FLAT
  const costCell = materials.getCell(row, 2);
  if (m.mode === 'flat') {
    if (m.value != null) {
      costCell.value = m.value;
    }
  } else if (m.mode === 'bulk') {
    // =D{row} / (E{row}*F{row}*G{row}*H{row})
    costCell.value = { formula: `D${row}/(E${row}*F${row}*G${row}*H${row})` };
  } else if (m.mode === 'monthly') {
    // =I{row} / (Config!$B$4 * Config!$B$5)
    costCell.value = { formula: `I${row}/(Config!$B$4*Config!$B$5)` };
  }
  applyStyle(costCell, computedCellStyle, {
    font: { size: 13, bold: true, color: { argb: ROSA } },
    alignment: { horizontal: 'right' },
  });
  costCell.numFmt = fmtCurrency;

  // Column C: variable flag
  const varCell = materials.getCell(row, 3);
  varCell.value = m.variable === 'yes' ? 'VARIABLE' : 'FIJO';
  applyStyle(varCell, computedCellStyle, {
    font: {
      size: 9,
      bold: true,
      color: { argb: m.variable === 'yes' ? AMBER_DARK : GRAY_MID },
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: m.variable === 'yes' ? AMBER : GRAY_LIGHT },
    },
    alignment: { horizontal: 'center' },
  });

  // Column D: bulk_cost — INPUT
  const bulkCell = materials.getCell(row, 4);
  if (m.mode === 'bulk') bulkCell.value = m.bulk;
  applyStyle(bulkCell, inputCellStyle, { alignment: { horizontal: 'right' } });
  bulkCell.numFmt = fmtCurrency;

  // Columns E-H: div1-4 — INPUT
  for (let d = 0; d < 4; d++) {
    const cell = materials.getCell(row, 5 + d);
    if (m.mode === 'bulk' && m.divs && m.divs[d] != null) {
      cell.value = m.divs[d];
    }
    applyStyle(cell, inputCellStyle, { alignment: { horizontal: 'center' } });
    cell.numFmt = fmtInt;
  }

  // Column I: monthly_cost — INPUT
  const monthlyCell = materials.getCell(row, 9);
  if (m.mode === 'monthly') monthlyCell.value = m.monthly;
  applyStyle(monthlyCell, inputCellStyle, { alignment: { horizontal: 'right' } });
  monthlyCell.numFmt = fmtCurrency;

  // Column J: notes — INPUT
  const notesCell = materials.getCell(row, 10);
  notesCell.value = m.notes;
  applyStyle(notesCell, inputCellStyle, {
    font: { size: 9, italic: true, color: { argb: GRAY_MID }, bold: false },
  });

  materials.getRow(row).height = 22;
});

// Total row
const totalRow = MAT_START_ROW + materialsData.length + 1;
materials.mergeCells(totalRow, 1, totalRow, 1);
const totalLabel = materials.getCell(totalRow, 1);
totalLabel.value = '💰  TOTAL COSTO POR PIEZA';
applyStyle(totalLabel, {
  font: { name: 'Helvetica Neue', size: 13, bold: true, color: { argb: WHITE } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA } },
  alignment: { vertical: 'middle', horizontal: 'right', indent: 1 },
});

const totalCell = materials.getCell(totalRow, 2);
totalCell.value = { formula: `SUM(B${MAT_START_ROW}:B${MAT_START_ROW + materialsData.length - 1})` };
applyStyle(totalCell, {
  font: { name: 'Helvetica Neue', size: 16, bold: true, color: { argb: WHITE } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA } },
  alignment: { vertical: 'middle', horizontal: 'right' },
});
totalCell.numFmt = fmtCurrency;

// Fill rest of total row with rosa
for (let c = 3; c <= 10; c++) {
  const cell = materials.getCell(totalRow, c);
  applyStyle(cell, {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSA } },
  });
}
materials.getRow(totalRow).height = 34;

// Column widths
materials.getColumn('A').width = 28;
materials.getColumn('B').width = 16;
materials.getColumn('C').width = 12;
materials.getColumn('D').width = 14;
materials.getColumn('E').width = 8;
materials.getColumn('F').width = 8;
materials.getColumn('G').width = 8;
materials.getColumn('H').width = 8;
materials.getColumn('I').width = 16;
materials.getColumn('J').width = 42;

// ───────── SHEET 2 · Products ─────────
// Reorder so Products shows before Materials in the tab bar
const products = wb.addWorksheet('Products', { views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }] });

products.mergeCells('A1:J1');
const prodTitle = products.getCell('A1');
prodTitle.value = '📦  PRODUCTOS & MÁRGENES';
applyStyle(prodTitle, titleStyle);
products.getRow(1).height = 36;

// Section label row 2
products.mergeCells('A2:D2');
const sec1 = products.getCell('A2');
sec1.value = 'ENTRADAS';
applyStyle(sec1, {
  font: { size: 9, bold: true, color: { argb: GREEN_DARK } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } },
  alignment: { horizontal: 'center', vertical: 'middle' },
});
products.mergeCells('E2:J2');
const sec2 = products.getCell('E2');
sec2.value = 'CALCULADO AUTOMÁTICAMENTE';
applyStyle(sec2, {
  font: { size: 9, bold: true, color: { argb: GRAY_MID } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_SOFT } },
  alignment: { horizontal: 'center', vertical: 'middle' },
});
products.getRow(2).height = 18;

const prodHeaders = [
  'SKU',
  'PRODUCTO',
  'PRECIO UNIT.',
  'PRECIO MAYOREO',
  'COSTO / PIEZA',
  'GANO / PZA (UNIT)',
  '% MARGEN UNIT',
  'GANO / PZA (MAY)',
  '% MARGEN MAY',
  'NOTAS',
];
prodHeaders.forEach((h, i) => {
  const cell = products.getCell(3, i + 1);
  cell.value = h;
  applyStyle(cell, headerStyle);
});
products.getRow(3).height = 26;

const PROD_START_ROW = 4;

// Total cost cell reference in Materials sheet
const MAT_TOTAL_REF = `Materials!$B$${totalRow}`;

productsData.forEach((p, idx) => {
  const row = PROD_START_ROW + idx;

  // SKU — input-ish but really identity, mark light green
  const skuCell = products.getCell(row, 1);
  skuCell.value = p.sku;
  applyStyle(skuCell, inputCellStyle, {
    font: { size: 10, bold: true, color: { argb: DARK } },
    alignment: { horizontal: 'center' },
  });

  // Name — input
  const nameCell = products.getCell(row, 2);
  nameCell.value = p.name;
  applyStyle(nameCell, inputCellStyle, {
    font: { size: 11, bold: true, color: { argb: DARK } },
  });

  // Price unit — input
  const priceUnitCell = products.getCell(row, 3);
  if (p.price_unit != null) priceUnitCell.value = p.price_unit;
  applyStyle(priceUnitCell, inputCellStyle, { alignment: { horizontal: 'right' } });
  priceUnitCell.numFmt = fmtCurrency;

  // Price wholesale — input
  const priceWsCell = products.getCell(row, 4);
  if (p.price_wholesale != null) priceWsCell.value = p.price_wholesale;
  applyStyle(priceWsCell, inputCellStyle, { alignment: { horizontal: 'right' } });
  priceWsCell.numFmt = fmtCurrency;

  // Cost per piece — formula = Materials total
  const costCell = products.getCell(row, 5);
  costCell.value = { formula: MAT_TOTAL_REF };
  applyStyle(costCell, computedCellStyle, {
    font: { size: 11, color: { argb: GRAY_MID }, bold: false },
    alignment: { horizontal: 'right' },
  });
  costCell.numFmt = fmtCurrency;

  // Gano / pza unit — formula = C - E
  const gainUnitCell = products.getCell(row, 6);
  gainUnitCell.value = { formula: `IF(C${row}="","",C${row}-E${row})` };
  applyStyle(gainUnitCell, computedCellStyle, {
    font: { size: 11, bold: true, color: { argb: ROSA } },
    alignment: { horizontal: 'right' },
  });
  gainUnitCell.numFmt = fmtCurrency;

  // % margin unit — formula
  const pctUnitCell = products.getCell(row, 7);
  pctUnitCell.value = { formula: `IF(C${row}="","",(C${row}-E${row})/C${row}*100)` };
  applyStyle(pctUnitCell, computedCellStyle, {
    font: { size: 11, bold: true, color: { argb: ROSA } },
    alignment: { horizontal: 'right' },
  });
  pctUnitCell.numFmt = fmtPercent;

  // Gano / pza mayoreo — formula = D - E
  const gainWsCell = products.getCell(row, 8);
  gainWsCell.value = { formula: `IF(D${row}="","",D${row}-E${row})` };
  applyStyle(gainWsCell, computedCellStyle, {
    font: { size: 11, bold: true, color: { argb: ROSA } },
    alignment: { horizontal: 'right' },
  });
  gainWsCell.numFmt = fmtCurrency;

  // % margin wholesale — formula
  const pctWsCell = products.getCell(row, 9);
  pctWsCell.value = { formula: `IF(D${row}="","",(D${row}-E${row})/D${row}*100)` };
  applyStyle(pctWsCell, computedCellStyle, {
    font: { size: 11, bold: true, color: { argb: ROSA } },
    alignment: { horizontal: 'right' },
  });
  pctWsCell.numFmt = fmtPercent;

  // Notes — input
  const notesCell = products.getCell(row, 10);
  notesCell.value = p.notes;
  applyStyle(notesCell, inputCellStyle, {
    font: { size: 9, italic: true, color: { argb: GRAY_MID }, bold: false },
  });

  products.getRow(row).height = 24;
});

// Column widths
products.getColumn('A').width = 8;
products.getColumn('B').width = 32;
products.getColumn('C').width = 14;
products.getColumn('D').width = 16;
products.getColumn('E').width = 14;
products.getColumn('F').width = 16;
products.getColumn('G').width = 14;
products.getColumn('H').width = 16;
products.getColumn('I').width = 14;
products.getColumn('J').width = 30;

// ═══════════════════════════════════════════════════════
// Reorder tabs: Config, Products, Materials
// exceljs renders in insertion order. We added Config → Materials → Products
// Reorder by rewriting the orderNo.
// ═══════════════════════════════════════════════════════
config.orderNo = 0;
products.orderNo = 1;
materials.orderNo = 2;

// Write file
const outPath = path.resolve(__dirname, 'costs.xlsx');
wb.xlsx.writeFile(outPath).then(() => {
  console.log('✓ Wrote', outPath);
  console.log('  Sheets: Config → Products → Materials');
  console.log('  Products:', productsData.length);
  console.log('  Materials (incl. overhead):', materialsData.length);
}).catch(err => {
  console.error('✗ Write failed:', err);
  process.exit(1);
});
