/**
 * Score an arrangement based on multiple factors.
 * Higher score = better arrangement.
 */

export function scoreArrangement(arrangement, targetCount, sheetW, sheetH) {
  let score = 0;

  // Factor 1: Exact count match is paramount
  if (arrangement.total === targetCount) {
    score += 10000;
  }

  // Factor 2: Proximity to target (closer = better)
  const distance = Math.abs(arrangement.total - targetCount);
  score -= distance * 100;

  // Factor 3: Material utilization (0-100)
  score += (arrangement.utilization || 0) * 100;

  // Factor 4: Piece size preference (larger = better)
  if (arrangement.placements.length > 0) {
    const p = arrangement.placements[0];
    const avgArea = p.width * p.height;
    score += Math.sqrt(avgArea) * 10;
  }

  return score;
}

export function calculateUtilization(placements, pieceW, pieceH, sheetW, sheetH) {
  const pieceArea = placements.length * pieceW * pieceH;
  const sheetArea = sheetW * sheetH;
  return pieceArea / sheetArea;
}
