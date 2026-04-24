/**
 * Long piece pattern - for pieces with aspect ratio >= 1.3.
 * Tests mixed layouts: N normal columns + rotated overflow in remaining space.
 * Also tests reversed: N rotated columns + normal overflow.
 *
 * Example for alargado magnets (AR ~2.0, Mediano):
 *   2 normal columns × 7 rows + 3 rotated pieces = 17 total
 */

export function longPiecePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const results = [];
  const aspectRatio = pieceW / pieceH;

  // Only useful for elongated pieces
  if (aspectRatio < 1.3) return results;

  // === LAYOUT A: Normal columns + rotated overflow on the right ===
  for (let mainCols = 1; mainCols <= 5; mainCols++) {
    const mainWidth = mainCols * pieceW + (mainCols > 1 ? (mainCols - 1) * gapX : 0);
    if (mainWidth > sheetW + 0.001) break;

    const mainRows = Math.floor((sheetH + gapY) / (pieceH + gapY));
    if (mainRows < 1) continue;

    const remainingWidth = sheetW - mainWidth - gapX;

    // Pure normal columns (no rotated)
    const purePlacements = [];
    for (let r = 0; r < mainRows; r++) {
      for (let c = 0; c < mainCols; c++) {
        purePlacements.push({
          x: c * (pieceW + gapX),
          y: r * (pieceH + gapY),
          width: pieceW, height: pieceH,
          rotation: 0, flip: c % 2 === 1,
        });
      }
    }
    if (purePlacements.length > 0) {
      results.push({
        total: purePlacements.length,
        placements: purePlacements,
        description: `Long ${mainCols}-col grid @0°`,
        utilization: (purePlacements.length * pieceW * pieceH) / (sheetW * sheetH),
      });
    }

    // Add rotated overflow if there's space
    if (remainingWidth >= pieceH - 0.001) {
      const rotCols = Math.floor((remainingWidth + gapX) / (pieceH + gapX));
      const rotRows = Math.floor((sheetH + gapY) / (pieceW + gapY));
      if (rotCols >= 1 && rotRows >= 1) {
        const mixedPlacements = [...purePlacements];
        for (let c = 0; c < rotCols; c++) {
          for (let r = 0; r < rotRows; r++) {
            mixedPlacements.push({
              x: mainWidth + gapX + c * (pieceH + gapX),
              y: r * (pieceW + gapY),
              width: pieceW, height: pieceH,
              rotation: 90, flip: false,
            });
          }
        }
        results.push({
          total: mixedPlacements.length,
          placements: mixedPlacements,
          description: `Long ${mainCols}-col + ${rotCols * rotRows} rotated`,
          utilization: (mixedPlacements.length * pieceW * pieceH) / (sheetW * sheetH),
        });
      }
    }
  }

  // === LAYOUT B: Rotated columns + normal overflow on the right ===
  // (reversed — sometimes packing rotated first is better)
  for (let rotCols = 1; rotCols <= 5; rotCols++) {
    const rotWidth = rotCols * pieceH + (rotCols > 1 ? (rotCols - 1) * gapX : 0);
    if (rotWidth > sheetW + 0.001) break;

    const rotRows = Math.floor((sheetH + gapY) / (pieceW + gapY));
    if (rotRows < 1) continue;

    const remainingWidth = sheetW - rotWidth - gapX;

    // Pure rotated columns
    const purePlacements = [];
    for (let r = 0; r < rotRows; r++) {
      for (let c = 0; c < rotCols; c++) {
        purePlacements.push({
          x: c * (pieceH + gapX),
          y: r * (pieceW + gapY),
          width: pieceW, height: pieceH,
          rotation: 90, flip: c % 2 === 1,
        });
      }
    }
    if (purePlacements.length > 0) {
      results.push({
        total: purePlacements.length,
        placements: purePlacements,
        description: `Long ${rotCols}-col grid @90°`,
        utilization: (purePlacements.length * pieceW * pieceH) / (sheetW * sheetH),
      });
    }

    // Add normal overflow
    if (remainingWidth >= pieceW - 0.001) {
      const normCols = Math.floor((remainingWidth + gapX) / (pieceW + gapX));
      const normRows = Math.floor((sheetH + gapY) / (pieceH + gapY));
      if (normCols >= 1 && normRows >= 1) {
        const mixedPlacements = [...purePlacements];
        for (let c = 0; c < normCols; c++) {
          for (let r = 0; r < normRows; r++) {
            mixedPlacements.push({
              x: rotWidth + gapX + c * (pieceW + gapX),
              y: r * (pieceH + gapY),
              width: pieceW, height: pieceH,
              rotation: 0, flip: false,
            });
          }
        }
        results.push({
          total: mixedPlacements.length,
          placements: mixedPlacements,
          description: `Long ${rotCols}-col@90° + ${normCols * normRows} normal`,
          utilization: (mixedPlacements.length * pieceW * pieceH) / (sheetW * sheetH),
        });
      }
    }
  }

  return results;
}
