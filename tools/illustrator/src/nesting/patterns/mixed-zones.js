/**
 * Mixed orientation zones - split sheet into horizontal and vertical zones.
 * Tests splitting by height (rows) and by width (columns).
 * Ported from ARMADO.jsx testMixedOrientation() and testColumnMixedOrientation().
 */

export function mixedZonePattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const results = [];

  // === Split by HEIGHT: horizontal rows first, then vertical rows ===
  const maxHRows = Math.floor((sheetH + gapY) / (pieceH + gapY));

  for (let hRowsToUse = 0; hRowsToUse <= maxHRows; hRowsToUse++) {
    const placements = [];
    let usedHeight = 0;

    // Horizontal rows (0° rotation)
    const hCols = Math.floor((sheetW + gapX) / (pieceW + gapX));
    for (let r = 0; r < hRowsToUse; r++) {
      for (let c = 0; c < hCols; c++) {
        placements.push({
          x: c * (pieceW + gapX),
          y: usedHeight,
          width: pieceW,
          height: pieceH,
          rotation: 0,
          flip: c % 2 === 1,
        });
      }
      usedHeight += pieceH + gapY;
    }

    // Remaining height for vertical pieces (90° rotation)
    const remainingHeight = sheetH - usedHeight;
    if (remainingHeight >= pieceW) {
      const vCols = Math.floor((sheetW + gapX) / (pieceH + gapX));
      const vRows = Math.floor((remainingHeight + gapY) / (pieceW + gapY));

      for (let r = 0; r < vRows; r++) {
        for (let c = 0; c < vCols; c++) {
          placements.push({
            x: c * (pieceH + gapX),
            y: usedHeight + r * (pieceW + gapY),
            width: pieceW,
            height: pieceH,
            rotation: 90,
            flip: c % 2 === 1,
          });
        }
      }
    }

    if (placements.length > 0) {
      const pieceArea = placements.length * pieceW * pieceH;
      results.push({
        total: placements.length,
        placements,
        description: `Mixed rows (${hRowsToUse} horiz + vert)`,
        utilization: pieceArea / (sheetW * sheetH),
      });
    }
  }

  // === Split by HEIGHT: vertical rows first, then horizontal ===
  const maxVRows = Math.floor((sheetH + gapY) / (pieceW + gapY));

  for (let vRowsToUse = 1; vRowsToUse <= maxVRows; vRowsToUse++) {
    const placements = [];
    let usedHeight = 0;

    const vCols = Math.floor((sheetW + gapX) / (pieceH + gapX));
    for (let r = 0; r < vRowsToUse; r++) {
      for (let c = 0; c < vCols; c++) {
        placements.push({
          x: c * (pieceH + gapX),
          y: usedHeight,
          width: pieceW,
          height: pieceH,
          rotation: 90,
          flip: c % 2 === 1,
        });
      }
      usedHeight += pieceW + gapY;
    }

    const remainingHeight = sheetH - usedHeight;
    if (remainingHeight >= pieceH) {
      const hCols = Math.floor((sheetW + gapX) / (pieceW + gapX));
      const hRows = Math.floor((remainingHeight + gapY) / (pieceH + gapY));

      for (let r = 0; r < hRows; r++) {
        for (let c = 0; c < hCols; c++) {
          placements.push({
            x: c * (pieceW + gapX),
            y: usedHeight + r * (pieceH + gapY),
            width: pieceW,
            height: pieceH,
            rotation: 0,
            flip: c % 2 === 1,
          });
        }
      }
    }

    if (placements.length > 0) {
      const pieceArea = placements.length * pieceW * pieceH;
      results.push({
        total: placements.length,
        placements,
        description: `Mixed rows (${vRowsToUse} vert + horiz)`,
        utilization: pieceArea / (sheetW * sheetH),
      });
    }
  }

  // === Split by WIDTH: horizontal columns left, vertical right ===
  const maxHCols = Math.floor((sheetW + gapX) / (pieceW + gapX));

  for (let hColsToUse = 1; hColsToUse < maxHCols; hColsToUse++) {
    const placements = [];
    const usedWidth = hColsToUse * (pieceW + gapX) - gapX;

    const hRows = Math.floor((sheetH + gapY) / (pieceH + gapY));
    for (let r = 0; r < hRows; r++) {
      for (let c = 0; c < hColsToUse; c++) {
        placements.push({
          x: c * (pieceW + gapX),
          y: r * (pieceH + gapY),
          width: pieceW,
          height: pieceH,
          rotation: 0,
          flip: c % 2 === 1,
        });
      }
    }

    const remainingWidth = sheetW - usedWidth - gapX;
    if (remainingWidth >= pieceH) {
      const vCols = Math.floor((remainingWidth + gapX) / (pieceH + gapX));
      const vRows = Math.floor((sheetH + gapY) / (pieceW + gapY));

      for (let r = 0; r < vRows; r++) {
        for (let c = 0; c < vCols; c++) {
          placements.push({
            x: usedWidth + gapX + c * (pieceH + gapX),
            y: r * (pieceW + gapY),
            width: pieceW,
            height: pieceH,
            rotation: 90,
            flip: (hColsToUse + c) % 2 === 1,
          });
        }
      }
    }

    if (placements.length > 0) {
      const pieceArea = placements.length * pieceW * pieceH;
      results.push({
        total: placements.length,
        placements,
        description: `Column-mixed (${hColsToUse} horiz + vert)`,
        utilization: pieceArea / (sheetW * sheetH),
      });
    }
  }

  return results;
}
