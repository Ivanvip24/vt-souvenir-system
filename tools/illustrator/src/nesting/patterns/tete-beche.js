/**
 * Tête-bêche pattern — alternating row flips with vertical nesting.
 * When pieces are flipped 180°, their top/bottom profiles can interlock,
 * allowing rows to be closer together (reduced vertical step).
 *
 * @param {number} pieceW - Piece width in cm
 * @param {number} pieceH - Piece height in cm
 * @param {number} sheetW - Usable sheet width in cm
 * @param {number} sheetH - Usable sheet height in cm
 * @param {number} gapX - Horizontal gap between pieces in cm
 * @param {number} gapY - Vertical gap between pieces in cm
 * @param {Object} [options] - Additional options
 * @param {number} [options.verticalNesting=0] - How much rows can overlap vertically (cm)
 */
export function teteBechePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY, options = {}) {
  const verticalNesting = options.verticalNesting || 0;
  const results = [];

  for (const rotation of [0, 90]) {
    const w = rotation === 0 ? pieceW : pieceH;
    const h = rotation === 0 ? pieceH : pieceW;

    const cols = Math.floor((sheetW + gapX) / (w + gapX));
    if (cols < 1) continue;

    // Vertical step is reduced by verticalNesting
    const vertStep = h + gapY - verticalNesting;
    if (vertStep <= 0) continue;

    // First row takes full height h, subsequent rows add vertStep
    const rows = 1 + Math.floor((sheetH - h) / vertStep);
    if (rows < 1) continue;

    const total = cols * rows;
    if (total < 2) continue;

    const placements = [];
    for (let r = 0; r < rows; r++) {
      const rowFlip = r % 2 === 1;
      for (let c = 0; c < cols; c++) {
        placements.push({
          x: c * (w + gapX),
          y: r * vertStep,
          width: pieceW,
          height: pieceH,
          rotation,
          flip: rowFlip,
        });
      }
    }

    const pieceArea = total * pieceW * pieceH;
    const sheetArea = sheetW * sheetH;

    results.push({
      total,
      placements,
      cols,
      rows,
      rotation,
      description: `Tete-beche ${cols}x${rows} @${rotation}° (nest=${verticalNesting.toFixed(1)}cm)`,
      utilization: pieceArea / sheetArea,
    });

    // Also try checkerboard flip (both row and column)
    if (cols >= 2 && rows >= 2) {
      const checkerPlacements = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          checkerPlacements.push({
            x: c * (w + gapX),
            y: r * vertStep,
            width: pieceW,
            height: pieceH,
            rotation,
            flip: (r + c) % 2 === 1,
          });
        }
      }

      results.push({
        total,
        placements: checkerPlacements,
        cols,
        rows,
        rotation,
        description: `Tete-beche checker ${cols}x${rows} @${rotation}° (nest=${verticalNesting.toFixed(1)}cm)`,
        utilization: pieceArea / sheetArea,
      });
    }
  }

  return results;
}
