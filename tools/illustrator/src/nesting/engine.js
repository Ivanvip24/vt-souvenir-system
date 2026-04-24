/**
 * Main nesting engine - runs all patterns and returns candidates.
 */

import { exhaustiveGridSearch } from './patterns/grid.js';
import { brickWallPattern } from './patterns/brick-wall.js';
import { alternatingColumnPattern } from './patterns/alternating-columns.js';
import { mixedZonePattern } from './patterns/mixed-zones.js';
import { longPiecePattern } from './patterns/long-piece.js';
import { teteBechePattern } from './patterns/tete-beche.js';

const PATTERN_FUNCTIONS = {
  'grid': exhaustiveGridSearch,
  'brick-wall': brickWallPattern,
  'alternating-columns': alternatingColumnPattern,
  'mixed-zones': mixedZonePattern,
  'long-piece': longPiecePattern,
  'tete-beche': teteBechePattern,
};

/**
 * Run only the specified patterns (by name).
 * Falls back to all patterns if patternNames is empty or null.
 */
export function getSelectedPatterns(patternNames, pieceW, pieceH, sheetW, sheetH, gapX, gapY, options = {}) {
  if (!patternNames || patternNames.length === 0) {
    return getAllPatterns(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options);
  }

  const results = [];
  for (const name of patternNames) {
    const fn = PATTERN_FUNCTIONS[name];
    if (fn) {
      results.push(...fn(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options));
    }
  }

  if (results.length === 0) {
    console.log('[ENGINE] No results from selected patterns. Running all.');
    return getAllPatterns(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options);
  }

  return results;
}

/**
 * Run all nesting patterns for a given piece size and sheet.
 * Returns array of all valid arrangements.
 */
export function getAllPatterns(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options = {}) {
  const allResults = [
    ...exhaustiveGridSearch(pieceW, pieceH, sheetW, sheetH, gapX, gapY),
    ...brickWallPattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY),
    ...alternatingColumnPattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY),
    ...mixedZonePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY),
    ...longPiecePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY),
    ...teteBechePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options),
  ];

  return allResults;
}

/**
 * Find the best arrangement at a fixed piece size for a target count.
 * Returns the arrangement with the most pieces <= targetCount,
 * or the arrangement closest to targetCount.
 */
export function findBestAtFixedSize(pieceW, pieceH, sheetW, sheetH, gapX, gapY, targetCount) {
  const allResults = getAllPatterns(pieceW, pieceH, sheetW, sheetH, gapX, gapY);

  if (allResults.length === 0) return null;

  // First: try to find exact match
  const exactMatch = allResults.find(r => r.total === targetCount);
  if (exactMatch) return exactMatch;

  // Second: find closest match that doesn't exceed target (if target specified)
  if (targetCount) {
    // Filter to results that don't exceed target, sort by total DESC
    const underTarget = allResults
      .filter(r => r.total <= targetCount)
      .sort((a, b) => b.total - a.total);

    if (underTarget.length > 0) {
      // Trim placements to exact target count if the best has more
      const best = underTarget[0];
      if (best.total > targetCount) {
        best.placements = best.placements.slice(0, targetCount);
        best.total = targetCount;
      }
      return best;
    }
  }

  // Third: find arrangement with maximum pieces
  const sorted = allResults.sort((a, b) => b.total - a.total);
  const best = sorted[0];

  // If target specified and best has more, trim
  if (targetCount && best.total > targetCount) {
    best.placements = best.placements.slice(0, targetCount);
    best.total = targetCount;
  }

  return best;
}

/**
 * Get the maximum number of pieces that can fit at a given size.
 */
export function getMaxPieces(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const allResults = getAllPatterns(pieceW, pieceH, sheetW, sheetH, gapX, gapY);
  if (allResults.length === 0) return 0;
  return Math.max(...allResults.map(r => r.total));
}
