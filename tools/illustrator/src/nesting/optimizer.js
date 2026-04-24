/**
 * Nesting optimizer - determines the best arrangement for each product type.
 * Uses binary search for resizable products (IMANES).
 * Uses fixed-size pattern matching for LLAVEROS/DESTAPADOR.
 * Uses product-specific logic for LIBRETA/PORTALLAVES.
 */

import { SHEET, USABLE, PRODUCTS, SIZE_LIMITS, getTargetSize, getDefaultCount } from './constants.js';
import { getAllPatterns, getSelectedPatterns, findBestAtFixedSize, getMaxPieces } from './engine.js';
import { scoreArrangement } from './scorer.js';

// PREPARACION creates a cut line + rebase around the design.
// The cut line typically grows 0.2-0.3cm beyond the pre-prep bounding box.
// Use 0.25cm as a safe estimate so computePieceSize doesn't overshoot.
const PREP_OVERALL_PADDING_CM = 0.25;

// IMANES vertical gap: minimal positive gap between rows.
const IMANES_GAP_Y = 0;

/**
 * Calculate safe horizontal overlap from shape fill ratio.
 * fillRatio = shape area / bounding box area.
 * Circles ≈ 0.785, squares ≈ 1.0, irregular shapes in between.
 * Lower fill ratio = more empty corners = more safe overlap.
 *
 * @param {number} fillRatio - 0 to 1
 * @param {number} pieceWidth - cut line bounding box width in cm
 * @returns {number} negative gap in cm (e.g., -0.5)
 */
function computeSafeOverlap(fillRatio, pieceWidth) {
  if (!fillRatio || fillRatio >= 0.95) {
    // Nearly square shape — no safe overlap
    return 0;
  }
  // The emptier the corners, the more overlap is safe.
  // Scale overlap based on how much the shape deviates from a full rectangle.
  // Max overlap factor: 7% of piece width (conservative, proven safe for circles).
  const emptyRatio = 1 - fillRatio; // ~0.215 for circles
  const overlapFactor = Math.min(emptyRatio * 0.33, 0.07); // cap at 7%
  return -(overlapFactor * pieceWidth);
}

/**
 * Pre-compute the optimal piece size for IMANES before resizing in Illustrator.
 * Finds the LARGEST piece size that fits at least `targetCount` on the 30×39 sheet.
 * Uses cut-line spacing (not rebase bounding box) since rebases can overlap.
 * This runs BEFORE preparacion — it only needs the aspect ratio.
 *
 * @param {number} aspectRatio - Width / Height of the original design
 * @param {string} sizeCategory - Mini, Mediano, Grande
 * @param {number|null} targetCount - Desired count (null = use default)
 * @param {number} [verticalNesting=0] - AI vertical nesting reduction in cm
 * @param {number} [safeHOverlap=0] - Safe horizontal overlap in cm (measured by Pathfinder test_overlap.jsx)
 * @returns {{ width: number, height: number }} optimal piece size in cm (pre-prep dimensions)
 */
export function computePieceSize(aspectRatio, sizeCategory, targetCount, verticalNesting, safeHOverlap, fillRatio) {
  const category = sizeCategory || 'Mediano';

  // Resolve target count from defaults if not specified
  if (!targetCount) {
    targetCount = getDefaultCount('IMANES', category, aspectRatio);
  }

  // Use shape-aware overlap if fillRatio provided, otherwise estimate from aspect ratio
  const estimatedFillRatio = fillRatio || (aspectRatio < 1.5 ? 0.80 : 0.85);
  // Use a reference piece size to estimate overlap (will be refined by binary search)
  const refSize = getTargetSize(aspectRatio, sizeCategory);
  const fitGapX = computeSafeOverlap(estimatedFillRatio, refSize.w);
  const fitGapY = IMANES_GAP_Y;

  let hiW = USABLE.width;
  let loW = SIZE_LIMITS.minWidth;

  let bestW = loW;
  let bestH = loW / aspectRatio;

  for (let iter = 0; iter < 100; iter++) {
    const midW = (loW + hiW) / 2;
    const midH = midW / aspectRatio;

    if (midH < SIZE_LIMITS.minHeight) {
      loW = SIZE_LIMITS.minHeight * aspectRatio;
      continue;
    }
    if (midH > USABLE.height) {
      hiW = USABLE.height * aspectRatio;
      continue;
    }

    // Simulate post-prep CUT LINE size (not rebase size)
    const postW = midW + PREP_OVERALL_PADDING_CM;
    const postH = midH + PREP_OVERALL_PADDING_CM;

    const effectiveGapX = fitGapX;
    const options = { verticalNesting: verticalNesting || 0 };
    const allResults = getAllPatterns(postW, postH, USABLE.width, USABLE.height, effectiveGapX, fitGapY, options);
    const maxPieces = allResults.length > 0 ? Math.max(...allResults.map(r => r.total)) : 0;

    if (maxPieces >= targetCount) {
      bestW = midW;
      bestH = midH;
      loW = midW;
    } else {
      hiW = midW;
    }

    if (hiW - loW < 0.005) break;
  }

  console.log(`[COMPUTE-SIZE] ${category} (AR ${aspectRatio.toFixed(2)}): target ${targetCount} → pre-prep ${bestW.toFixed(2)}×${bestH.toFixed(2)}cm (post-prep cutline ~${(bestW + PREP_OVERALL_PADDING_CM).toFixed(2)}×${(bestH + PREP_OVERALL_PADDING_CM).toFixed(2)}cm)`);
  return { width: bestW, height: bestH };
}

/**
 * Main optimization entry point.
 * @param {Object} params
 * @param {number} params.pieceWidth - Design width in cm
 * @param {number} params.pieceHeight - Design height in cm
 * @param {string} params.productType - IMANES, LLAVEROS, DESTAPADOR, LIBRETA, PORTALLAVES
 * @param {number|null} params.targetCount - Desired piece count (null = use default)
 * @param {string|null} params.sizeCategory - Mini, Mediano, Grande (IMANES only)
 * @returns {Object} { plan, summary }
 */
export function optimize({ pieceWidth, pieceHeight, productType, targetCount, sizeCategory, rankedPatterns, verticalNesting, safeHorizontalOverlap, overallWidth, overallHeight, fillRatio, safeOverlapCm }) {
  const aspectRatio = pieceWidth / pieceHeight;

  // Resolve default count if not specified
  if (!targetCount) {
    targetCount = getDefaultCount(productType, sizeCategory, aspectRatio);
  }

  // Special products with fixed logic
  if (productType === 'LIBRETA') {
    return optimizeLibreta(targetCount);
  }

  if (productType === 'PORTALLAVES') {
    return optimizePortallaves(pieceWidth, pieceHeight);
  }

  // Fixed-size products (LLAVEROS, DESTAPADOR)
  if (PRODUCTS[productType]?.useOriginalSize) {
    return optimizeFixedSize(pieceWidth, pieceHeight, targetCount, productType, rankedPatterns);
  }

  // IMANES — pieces are already at target size (resized before PREPARACION)
  return optimizeFixedSizeImanes(pieceWidth, pieceHeight, targetCount, sizeCategory, rankedPatterns, verticalNesting, safeHorizontalOverlap, overallWidth, overallHeight, fillRatio, safeOverlapCm);
}

function optimizeFixedSize(pieceW, pieceH, targetCount, productType, rankedPatterns) {
  const { gapX, gapY } = SHEET;
  const aspectRatio = pieceW / pieceH;

  // Get all candidates at original size
  const origResults = getSelectedPatterns(rankedPatterns, pieceW, pieceH, USABLE.width, USABLE.height, gapX, gapY);
  const maxAtOriginal = origResults.length > 0 ? Math.max(...origResults.map(r => r.total)) : 0;

  // If no target count, use max at original
  if (!targetCount) targetCount = maxAtOriginal || 1;

  // If target fits at original size, no scaling needed
  if (maxAtOriginal >= targetCount) {
    let best = origResults.find(r => r.total === targetCount);
    if (!best) {
      const under = origResults.filter(r => r.total <= targetCount).sort((a, b) => b.total - a.total);
      best = under[0] || origResults.sort((a, b) => b.total - a.total)[0];
      if (best && best.total > targetCount) {
        best.placements = best.placements.slice(0, targetCount);
        best.total = targetCount;
      }
    }
    if (!best) return { error: true, message: 'Could not find a valid arrangement.' };

    const plan = buildPlan(best, productType, pieceW, pieceH, 1.0);
    plan.candidates = origResults.sort((a, b) => b.total - a.total).slice(0, 5);
    return plan;
  }

  // Target exceeds capacity at original size — scale down via binary search
  console.log(`[OPTIMIZER] ${productType}: need ${targetCount} but max ${maxAtOriginal} at original ${pieceW.toFixed(1)}x${pieceH.toFixed(1)}cm. Scaling down...`);

  let lo = SIZE_LIMITS.minWidth;
  let hi = pieceW;
  let bestMatch = null;
  let closestMatch = null;
  let closestDiff = Infinity;

  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const midH = mid / aspectRatio;
    if (midH < SIZE_LIMITS.minHeight) { lo = SIZE_LIMITS.minHeight * aspectRatio; continue; }

    const results = getSelectedPatterns(rankedPatterns, mid, midH, USABLE.width, USABLE.height, gapX, gapY);
    const best = results.reduce((a, b) => a.total > b.total ? a : b, { total: 0 });

    // Track closest match (prefer larger piece size when tied)
    const diff = Math.abs(best.total - targetCount);
    if (diff < closestDiff || (diff === closestDiff && mid > (closestMatch?.width || 0))) {
      closestDiff = diff;
      closestMatch = { width: mid, height: midH, arrangement: best };
    }

    if (best.total === targetCount) {
      bestMatch = { width: mid, height: midH, arrangement: best };
      lo = mid; // maximize piece size
    } else if (best.total < targetCount) {
      hi = mid; // too few, make smaller
    } else {
      lo = mid; // too many, make larger
    }

    if (hi - lo < 0.005) break;
  }

  const match = bestMatch || closestMatch;
  if (!match || match.arrangement.total === 0) {
    return { error: true, message: `Cannot fit ${targetCount} ${productType} pieces on the sheet.` };
  }

  const scaleFactor = match.width / pieceW;
  console.log(`[OPTIMIZER] ${productType}: scaled to ${match.width.toFixed(2)}x${match.height.toFixed(2)}cm (factor: ${scaleFactor.toFixed(4)}) → ${match.arrangement.total} pieces`);

  const plan = buildPlan(match.arrangement, productType, match.width, match.height, scaleFactor);

  // Expose candidates for AI evaluation
  const finalResults = getSelectedPatterns(rankedPatterns, match.width, match.height, USABLE.width, USABLE.height, gapX, gapY);
  plan.candidates = finalResults.filter(r => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
  return plan;
}

/**
 * IMANES — pieces are already at target size (resized before PREPARACION).
 * No binary search needed. Find the best pattern at the actual piece size.
 * Uses gap=0 because rebases can overlap — only cut lines need spacing.
 */
function optimizeFixedSizeImanes(pieceW, pieceH, targetCount, sizeCategory, rankedPatterns, verticalNesting, safeHorizontalOverlap, overallW, overallH, fillRatio, safeOverlapCm) {
  // Use AI-measured overlap if available, otherwise fall back to formula
  const gapX = safeOverlapCm ? -safeOverlapCm : computeSafeOverlap(fillRatio || 0.80, pieceW);
  const gapY = IMANES_GAP_Y;
  console.log(`[OPTIMIZER] IMANES gap: ${gapX.toFixed(2)}cm (${safeOverlapCm ? 'AI-measured' : 'fillRatio=' + (fillRatio || 0.80).toFixed(2)})`);
  const options = { verticalNesting: verticalNesting || 0 };

  // Use CUT LINE dimensions for spacing — rebases naturally overlap.
  // ARMADO positions by overall bounds, so adjacent rebases overlap while cut lines touch.
  const spacingW = pieceW;
  const spacingH = pieceH;

  let scaleFactor = 1.0;
  let finalW = spacingW;
  let finalH = spacingH;

  // Try at current size first
  let allResults = getSelectedPatterns(rankedPatterns, spacingW, spacingH, USABLE.width, USABLE.height, gapX, gapY, options);
  let maxAvailable = allResults.length > 0 ? Math.max(...allResults.map(r => r.total)) : 0;

  if (maxAvailable === 0) {
    return { error: true, message: `Cannot fit any ${sizeCategory || 'Mediano'} IMANES pieces on the sheet at ${pieceW.toFixed(1)}x${pieceH.toFixed(1)}cm.` };
  }

  // If target count doesn't fit, scale down until it does — NEVER produce fewer pieces
  if (maxAvailable < targetCount) {
    console.log(`[OPTIMIZER] IMANES: need ${targetCount} but only ${maxAvailable} fit at ${spacingW.toFixed(1)}x${spacingH.toFixed(1)}cm. Scaling down...`);
    const aspectRatio = spacingW / spacingH;
    let lo = SIZE_LIMITS.minWidth;
    let hi = spacingW;

    for (let iter = 0; iter < 100; iter++) {
      const mid = (lo + hi) / 2;
      const midH = mid / aspectRatio;
      const results = getAllPatterns(mid, midH, USABLE.width, USABLE.height, gapX, gapY, options);
      const best = results.length > 0 ? Math.max(...results.map(r => r.total)) : 0;

      if (best >= targetCount) {
        finalW = mid;
        finalH = midH;
        lo = mid; // try bigger
      } else {
        hi = mid; // too big, shrink
      }
      if (hi - lo < 0.005) break;
    }

    scaleFactor = finalW / spacingW;
    console.log(`[OPTIMIZER] IMANES: scaled to ${finalW.toFixed(2)}x${finalH.toFixed(2)}cm (factor: ${scaleFactor.toFixed(4)}) to fit ${targetCount}`);
    allResults = getAllPatterns(finalW, finalH, USABLE.width, USABLE.height, gapX, gapY, options);
    maxAvailable = allResults.length > 0 ? Math.max(...allResults.map(r => r.total)) : 0;
  }

  // Find exact match or closest
  let best = allResults.find(r => r.total === targetCount);

  if (!best) {
    if (targetCount <= maxAvailable) {
      const under = allResults.filter(r => r.total <= targetCount).sort((a, b) => b.total - a.total);
      best = under[0] || allResults.sort((a, b) => Math.abs(a.total - targetCount) - Math.abs(b.total - targetCount))[0];
    } else {
      best = allResults.reduce((a, b) => a.total > b.total ? a : b);
    }
  }

  // Trim to exact target count if arrangement has more
  if (best.total > targetCount) {
    best.placements = best.placements.slice(0, targetCount);
    best.total = targetCount;
  }

  const plan = buildPlan(best, 'IMANES', finalW, finalH, scaleFactor);


  // Expose candidates for AI evaluation
  plan.candidates = allResults
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return plan;
}

function optimizeLibreta(targetCount) {
  const cfg = PRODUCTS.LIBRETA;

  if (targetCount < 1 || targetCount > cfg.maxPieces) {
    return { error: true, message: `LIBRETA supports 1-${cfg.maxPieces} pieces. Requested: ${targetCount}` };
  }

  const placements = [];
  let placedCount = 0;

  for (let r = 0; r < cfg.maxRows && placedCount < targetCount; r++) {
    for (let c = 0; c < cfg.maxCols && placedCount < targetCount; c++) {
      placements.push({
        x: c * (cfg.pieceWidth + cfg.gap),
        y: r * (cfg.pieceHeight + cfg.gap),
        width: cfg.pieceWidth,
        height: cfg.pieceHeight,
        rotation: 0,
        flip: c % 2 === 1,
      });
      placedCount++;
    }
  }

  const actualRows = Math.ceil(targetCount / cfg.maxCols);
  const actualCols = targetCount >= cfg.maxCols ? cfg.maxCols : targetCount;

  return {
    error: false,
    plan: {
      productType: 'LIBRETA',
      templatePath: null, // Created programmatically
      total: targetCount,
      scaleFactor: 1.0, // Will be calculated from actual design size
      description: `Libreta (${actualCols}x${actualRows})`,
      sheetWidth: cfg.sheetWidth,
      sheetHeight: cfg.sheetHeight,
      margin: 0,
      useLibretaTemplate: true,
      createBadge: false,
      createCutLineArtboard: false,
      portallavesBars: null,
      placements,
    },
    summary: {
      total: targetCount,
      pieceWidth: cfg.pieceWidth,
      pieceHeight: cfg.pieceHeight,
      pattern: `Libreta (${actualCols}x${actualRows})`,
      utilization: (targetCount * cfg.pieceWidth * cfg.pieceHeight) / (cfg.sheetWidth * cfg.sheetHeight),
    },
  };
}

function optimizePortallaves(pieceW, pieceH) {
  const cfg = PRODUCTS.PORTALLAVES;

  if (pieceW > cfg.maxWidth || pieceH > cfg.maxHeight) {
    return {
      error: true,
      message: `Piece size ${pieceW.toFixed(1)}x${pieceH.toFixed(1)}cm exceeds PORTALLAVES limits (${cfg.maxWidth}x${cfg.maxHeight}cm).`,
    };
  }

  const { gapX, gapY } = SHEET;
  const rotateSecondColumn = pieceW > pieceH;
  const placements = [];

  for (let c = 0; c < cfg.cols; c++) {
    const flip = c % 2 === 1;
    for (let r = 0; r < cfg.rows; r++) {
      let rotation = 0;
      let xOffset, yOffset;

      if (rotateSecondColumn && c === 1) {
        rotation = 90;
        xOffset = pieceW + gapX;
        yOffset = r * (pieceW + gapY);
      } else {
        xOffset = c * (pieceW + gapX);
        yOffset = r * (pieceH + gapY);
      }

      placements.push({
        x: xOffset,
        y: yOffset,
        width: pieceW,
        height: pieceH,
        rotation,
        flip,
      });
    }
  }

  return {
    error: false,
    plan: {
      productType: 'PORTALLAVES',
      templatePath: SHEET.templatePath,
      total: cfg.pieceCount,
      scaleFactor: 1.0,
      description: rotateSecondColumn ? 'Portallaves (2x2, col2 rotated)' : 'Portallaves (2x2)',
      sheetWidth: SHEET.width,
      sheetHeight: SHEET.height,
      margin: SHEET.margin,
      useLibretaTemplate: false,
      createBadge: true,
      createCutLineArtboard: true,
      portallavesBars: cfg.bar,
      placements,
    },
    summary: {
      total: cfg.pieceCount,
      pieceWidth: pieceW,
      pieceHeight: pieceH,
      pattern: rotateSecondColumn ? 'Portallaves (2x2, col2 rotated)' : 'Portallaves (2x2)',
      utilization: (cfg.pieceCount * pieceW * pieceH) / (USABLE.width * USABLE.height),
    },
  };
}

function buildPlan(arrangement, productType, pieceW, pieceH, scaleFactor) {
  return {
    error: false,
    plan: {
      productType,
      templatePath: SHEET.templatePath,
      total: arrangement.total,
      scaleFactor,
      description: arrangement.description,
      sheetWidth: SHEET.width,
      sheetHeight: SHEET.height,
      margin: SHEET.margin,
      useLibretaTemplate: false,
      createBadge: true,
      createCutLineArtboard: true,
      portallavesBars: null,
      placements: arrangement.placements,
    },
    summary: {
      total: arrangement.total,
      pieceWidth: pieceW,
      pieceHeight: pieceH,
      pattern: arrangement.description,
      utilization: arrangement.utilization || 0,
    },
  };
}

