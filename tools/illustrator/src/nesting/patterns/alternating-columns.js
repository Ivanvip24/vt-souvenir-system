/**
 * Alternating column rotation pattern.
 * Columns alternate: normal (0°), rotated (90°), normal, rotated...
 * Ported from ARMADO.jsx testAlternatingColumnPattern() lines 637-695.
 */

export function alternatingColumnPattern(pieceW, pieceH, sheetW, sheetH, gapX, gapY) {
  const results = [];

  // Test starting with normal (0°) and starting with rotated (90°)
  for (const startRotated of [false, true]) {
    const placements = [];
    const columnConfigs = [];
    let x = 0;
    let colIndex = 0;

    while (x < sheetW) {
      const isRotated = startRotated ? (colIndex % 2 === 0) : (colIndex % 2 === 1);
      const colWidth = isRotated ? pieceH : pieceW;

      if (x + colWidth > sheetW + 0.001) break;

      columnConfigs.push({
        x,
        rotation: isRotated ? 90 : 0,
        width: colWidth,
        height: isRotated ? pieceW : pieceH,
      });

      x += colWidth + gapX;
      colIndex++;
    }

    if (columnConfigs.length === 0) continue;

    for (let c = 0; c < columnConfigs.length; c++) {
      const col = columnConfigs[c];
      const rows = Math.floor((sheetH + gapY) / (col.height + gapY));
      const flip = c % 2 === 1;

      for (let r = 0; r < rows; r++) {
        placements.push({
          x: col.x,
          y: r * (col.height + gapY),
          width: pieceW,
          height: pieceH,
          rotation: col.rotation,
          flip,
        });
      }
    }

    if (placements.length > 0) {
      const pieceArea = placements.length * pieceW * pieceH;
      const sheetArea = sheetW * sheetH;
      const startDesc = startRotated ? '90° start' : '0° start';

      results.push({
        total: placements.length,
        placements,
        description: `Alternating columns (${columnConfigs.length} cols, ${startDesc})`,
        utilization: pieceArea / sheetArea,
      });
    }
  }

  return results;
}
