/**
 * Exhaustive grid search - tests ALL valid cols x rows combinations
 * in both orientations (0° and 90°) with tête-bêche column flip.
 * This is the KEY improvement over the original ARMADO.jsx which only
 * tested a few hardcoded patterns.
 */

export function exhaustiveGridSearch(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const results = [];

  for (const rotation of [0, 90]) {
    const w = rotation === 0 ? pieceW : pieceH;
    const h = rotation === 0 ? pieceH : pieceW;

    const maxCols = Math.floor((sheetW + gapX) / (w + gapX));
    const maxRows = Math.floor((sheetH + gapY) / (h + gapY));

    if (maxCols < 1 || maxRows < 1) continue;

    for (let cols = 1; cols <= maxCols; cols++) {
      for (let rows = 1; rows <= maxRows; rows++) {
        const totalW = cols * w + (cols - 1) * gapX;
        const totalH = rows * h + (rows - 1) * gapY;

        if (totalW > sheetW + 0.001 || totalH > sheetH + 0.001) continue;

        const placements = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            placements.push({
              x: c * (w + gapX),
              y: r * (h + gapY),
              width: pieceW,
              height: pieceH,
              rotation,
              flip: c % 2 === 1,
            });
          }
        }

        const pieceArea = placements.length * pieceW * pieceH;
        const sheetArea = sheetW * sheetH;

        results.push({
          total: cols * rows,
          placements,
          cols,
          rows,
          rotation,
          description: `Grid ${cols}x${rows} @${rotation}°`,
          utilization: pieceArea / sheetArea,
        });
      }
    }
  }

  return results;
}
