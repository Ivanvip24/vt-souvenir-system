/**
 * Brick-wall pattern - offsets every other row by half a piece width.
 * Can sometimes fit extra pieces compared to a regular grid.
 * NEW pattern not in the original ARMADO.jsx.
 */

export function brickWallPattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const results = [];

  for (const rotation of [0, 90]) {
    const w = rotation === 0 ? pieceW : pieceH;
    const h = rotation === 0 ? pieceH : pieceW;

    const halfOffset = (w + gapX) / 2;
    const maxRows = Math.floor((sheetH + gapY) / (h + gapY));

    const normalCols = Math.floor((sheetW + gapX) / (w + gapX));
    const offsetCols = Math.floor((sheetW - halfOffset + gapX) / (w + gapX));

    if (normalCols < 1 || maxRows < 1) continue;
    if (offsetCols < 1) continue; // Offset rows don't fit any pieces

    const placements = [];
    for (let r = 0; r < maxRows; r++) {
      const isOffset = r % 2 === 1;
      const cols = isOffset ? offsetCols : normalCols;
      const xStart = isOffset ? halfOffset : 0;

      for (let c = 0; c < cols; c++) {
        placements.push({
          x: xStart + c * (w + gapX),
          y: r * (h + gapY),
          width: pieceW,
          height: pieceH,
          rotation,
          flip: c % 2 === 1,
        });
      }
    }

    if (placements.length > 0) {
      const pieceArea = placements.length * pieceW * pieceH;
      const sheetArea = sheetW * sheetH;

      results.push({
        total: placements.length,
        placements,
        description: `Brick-wall @${rotation}° (${normalCols}/${offsetCols} cols)`,
        utilization: pieceArea / sheetArea,
      });
    }
  }

  return results;
}
