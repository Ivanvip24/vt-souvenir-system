/**
 * Profile-based nesting — exact geometry for maximum piece size.
 *
 * Takes raw bezier contour data from Illustrator, builds horizontal profiles
 * (leftmost/rightmost X at each Y level), computes minimum spacings for
 * grid and tête-bêche configurations, then finds the exact maximum scale
 * factor for a target piece count.
 */

const PTS_PER_CM = 28.3465;
const SAFETY_MARGIN_CM = 0.1; // 1mm physical tolerance (laser kerf + material flex)

// ============================================================
// CUBIC BEZIER MATH
// ============================================================

/**
 * Evaluate cubic bezier at parameter t.
 */
function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Find all t values where cubic bezier Y = targetY.
 * Uses iterative subdivision for robustness.
 */
function bezierYRoots(y0, y1, y2, y3, targetY, epsilon = 0.001) {
  const roots = [];

  function search(tLo, tHi, yLo, yHi) {
    if (Math.abs(tHi - tLo) < 0.0001) {
      roots.push((tLo + tHi) / 2);
      return;
    }

    // Check if target is in range
    const yMin = Math.min(yLo, yHi);
    const yMax = Math.max(yLo, yHi);

    // Also check midpoint to catch curves that dip out and back
    const tMid = (tLo + tHi) / 2;
    const yMid = bezierPoint(y0, y1, y2, y3, tMid);

    const overallMin = Math.min(yMin, yMid);
    const overallMax = Math.max(yMax, yMid);

    if (targetY < overallMin - epsilon || targetY > overallMax + epsilon) return;

    if (Math.abs(yHi - yLo) < epsilon && Math.abs(yMid - targetY) < epsilon) {
      roots.push(tMid);
      return;
    }

    // Subdivide
    search(tLo, tMid, yLo, yMid);
    search(tMid, tHi, yMid, yHi);
  }

  const yStart = bezierPoint(y0, y1, y2, y3, 0);
  const yEnd = bezierPoint(y0, y1, y2, y3, 1);
  search(0, 1, yStart, yEnd);

  return roots;
}

// ============================================================
// PROFILE BUILDER
// ============================================================

/**
 * Build horizontal profiles from bezier contour data.
 * Scans at stepCm resolution, returns left/right X at each Y level.
 *
 * @param {Object} contourData - Output from extract_contour.jsx
 * @param {number} stepCm - Vertical scan resolution (default 0.05 = 0.5mm)
 * @returns {Object} { leftProfile, rightProfile, bboxW, bboxH, stepCm, yCount }
 */
export function buildProfiles(contourData, stepCm = 0.05) {
  const { pathData, bounds, bboxW, bboxH, closed } = contourData;

  // Convert points to cm, normalize to origin at bottom-left
  const bLeft = bounds[0] / PTS_PER_CM;
  const bTop = bounds[1] / PTS_PER_CM;
  const bBottom = bounds[3] / PTS_PER_CM;

  const segments = [];
  for (let i = 0; i < pathData.length; i++) {
    const next = (i + 1) % pathData.length;
    if (!closed && next === 0) break;

    const p0 = pathData[i];
    const p1 = pathData[next];

    segments.push({
      x0: p0.a[0] / PTS_PER_CM - bLeft,
      y0: p0.a[1] / PTS_PER_CM - bBottom,
      cx0: p0.r[0] / PTS_PER_CM - bLeft, // rightDirection = outgoing handle
      cy0: p0.r[1] / PTS_PER_CM - bBottom,
      cx1: p1.l[0] / PTS_PER_CM - bLeft,  // leftDirection = incoming handle
      cy1: p1.l[1] / PTS_PER_CM - bBottom,
      x1: p1.a[0] / PTS_PER_CM - bLeft,
      y1: p1.a[1] / PTS_PER_CM - bBottom,
    });
  }

  const yCount = Math.ceil(bboxH / stepCm) + 1;
  const leftProfile = new Array(yCount).fill(bboxW);
  const rightProfile = new Array(yCount).fill(0);

  // Dense bezier sampling — more robust than Y-root finding
  // Sample each segment at 200 points and update profiles
  const SAMPLES_PER_SEGMENT = 200;
  for (const seg of segments) {
    for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT;
      const x = bezierPoint(seg.x0, seg.cx0, seg.cx1, seg.x1, t);
      const y = bezierPoint(seg.y0, seg.cy0, seg.cy1, seg.y1, t);

      // Map y to profile index
      const yi = Math.round(y / stepCm);
      if (yi < 0 || yi >= yCount) continue;

      if (x < leftProfile[yi]) leftProfile[yi] = x;
      if (x > rightProfile[yi]) rightProfile[yi] = x;

      // Also fill adjacent Y bins for robustness
      if (yi > 0) {
        if (x < leftProfile[yi - 1]) leftProfile[yi - 1] = x;
        if (x > rightProfile[yi - 1]) rightProfile[yi - 1] = x;
      }
      if (yi < yCount - 1) {
        if (x < leftProfile[yi + 1]) leftProfile[yi + 1] = x;
        if (x > rightProfile[yi + 1]) rightProfile[yi + 1] = x;
      }
    }
  }

  // Fill any unscanned rows (where no intersections found) with neighbors
  for (let yi = 0; yi < yCount; yi++) {
    if (rightProfile[yi] <= 0 || leftProfile[yi] >= bboxW) {
      // Find nearest valid row
      for (let d = 1; d < yCount; d++) {
        const above = yi + d < yCount ? yi + d : -1;
        const below = yi - d >= 0 ? yi - d : -1;
        if (above >= 0 && rightProfile[above] > 0) {
          leftProfile[yi] = leftProfile[above];
          rightProfile[yi] = rightProfile[above];
          break;
        }
        if (below >= 0 && rightProfile[below] > 0) {
          leftProfile[yi] = leftProfile[below];
          rightProfile[yi] = rightProfile[below];
          break;
        }
      }
    }
  }

  return { leftProfile, rightProfile, bboxW, bboxH, stepCm, yCount };
}

// ============================================================
// SPACING COMPUTATION
// ============================================================

/**
 * Compute minimum column and row spacings for all configurations.
 *
 * @param {Object} profiles - Output from buildProfiles
 * @param {number} safetyMargin - Safety margin in cm (default 0.03 = 0.3mm)
 * @returns {Object} Spacings for grid, tbCols, tbRows, tbChecker
 */
export function computeSpacings(profiles, safetyMargin = SAFETY_MARGIN_CM) {
  const { leftProfile, rightProfile, bboxW, bboxH, yCount } = profiles;

  // --- Horizontal spacings ---

  // Grid: same orientation side by side → spacing = max width at any Y
  let gridColSpacing = 0;
  for (let yi = 0; yi < yCount; yi++) {
    const w = rightProfile[yi] - leftProfile[yi];
    if (w > gridColSpacing) gridColSpacing = w;
  }
  // Actually for same-orientation: piece B's left edge must clear piece A's right edge
  // Since both have same profile: spacing = max(rightProfile) - min(leftProfile) = bboxW
  gridColSpacing = bboxW;

  // Tête-bêche columns: adjacent column is flipped 180°
  // Flipped piece at Y has profile from the OPPOSITE end of the shape
  // min spacing S where: S + bboxW - rightProfile[H-y] >= rightProfile[y] for all y
  // → S >= rightProfile[y] + rightProfile[H-y] - bboxW for all y
  let tbColSpacing = 0;
  for (let yi = 0; yi < yCount; yi++) {
    const mirrorYi = yCount - 1 - yi;
    const needed = rightProfile[yi] + rightProfile[mirrorYi] - bboxW;
    if (needed > tbColSpacing) tbColSpacing = needed;
  }

  // --- Vertical spacings ---

  // Build vertical profiles (top/bottom at each X level)
  const xCount = Math.ceil(bboxW / profiles.stepCm) + 1;
  const topProfile = new Array(xCount).fill(0);
  const bottomProfile = new Array(xCount).fill(bboxH);

  // Scan from horizontal profiles
  for (let yi = 0; yi < yCount; yi++) {
    const y = yi * profiles.stepCm;
    const xLeft = leftProfile[yi];
    const xRight = rightProfile[yi];

    const xiLeft = Math.floor(xLeft / profiles.stepCm);
    const xiRight = Math.ceil(xRight / profiles.stepCm);

    for (let xi = Math.max(0, xiLeft); xi <= Math.min(xCount - 1, xiRight); xi++) {
      if (y > topProfile[xi]) topProfile[xi] = y;
      if (y < bottomProfile[xi]) bottomProfile[xi] = y;
    }
  }

  // Grid vertical: spacing = bboxH
  let gridRowSpacing = bboxH;

  // Tête-bêche rows: adjacent row flipped 180°
  // min spacing S where: S + bboxH - topProfile[W-x] >= topProfile[x] for all x
  // → S >= topProfile[x] + topProfile[W-x] - bboxH for all x
  let tbRowSpacing = 0;
  for (let xi = 0; xi < xCount; xi++) {
    const mirrorXi = xCount - 1 - xi;
    const needed = topProfile[xi] + topProfile[mirrorXi] - bboxH;
    if (needed > tbRowSpacing) tbRowSpacing = needed;
  }

  // Add safety margin
  gridColSpacing += safetyMargin;
  tbColSpacing += safetyMargin;
  gridRowSpacing += safetyMargin;
  tbRowSpacing += safetyMargin;

  return {
    grid: { colSpacing: gridColSpacing, rowSpacing: gridRowSpacing },
    tbCols: { colSpacing: tbColSpacing, rowSpacing: gridRowSpacing },
    tbRows: { colSpacing: gridColSpacing, rowSpacing: tbRowSpacing },
    tbChecker: { colSpacing: tbColSpacing, rowSpacing: tbRowSpacing },
    bboxW,
    bboxH,
  };
}

// ============================================================
// OPTIMAL SCALE FINDER
// ============================================================

/**
 * Find the maximum scale factor that fits targetCount pieces on the sheet.
 * Tests all configurations and (cols × rows) combinations.
 *
 * @param {Object} spacings - Output from computeSpacings
 * @param {number} targetCount - Target number of pieces
 * @param {number} sheetW - Usable sheet width in cm (default 29.9)
 * @param {number} sheetH - Usable sheet height in cm (default 38.9)
 * @returns {Object} Best arrangement with scaleFactor, placements, etc.
 */
export function findOptimalScale(spacings, targetCount, sheetW = 29.9, sheetH = 38.9, overallW = null, overallH = null) {
  const configs = ['grid', 'tbCols', 'tbRows', 'tbChecker'];
  let best = null;

  // Use overall bounds for total sheet calculation (includes rebase)
  // Spacings are cut-line-based, but the physical width includes the rebase overhang
  const physicalW = overallW || spacings.bboxW;
  const physicalH = overallH || spacings.bboxH;

  const { bboxW, bboxH } = spacings;

  for (const configName of configs) {
    const { colSpacing, rowSpacing } = spacings[configName];

    // Try different (cols, rows) combinations
    for (let cols = 1; cols <= 10; cols++) {
      const minRows = Math.ceil(targetCount / cols);
      for (let rows = minRows; rows <= minRows + 2; rows++) {
        if (cols * rows < targetCount) continue;

        // Total dimensions at scale=1 using OVERALL bounds for edge pieces
        // Inner spacings use cut-line spacing, but first+last piece use full overall width
        const totalW = (cols - 1) * colSpacing + physicalW;
        const totalH = (rows - 1) * rowSpacing + physicalH;

        if (totalW <= 0 || totalH <= 0) continue;

        const scale = Math.min(sheetW / totalW, sheetH / totalH);

        if (!best || scale > best.scaleFactor) {
          best = {
            scaleFactor: scale,
            cols,
            rows,
            colSpacing,
            rowSpacing,
            configName,
            totalPieces: cols * rows,
            bboxW,
            bboxH,
          };
        }
      }
    }
  }

  if (!best) {
    return { error: true, message: 'Cannot fit pieces on sheet.' };
  }

  // Generate placements at SCALED spacing
  const sColSpacing = best.colSpacing * best.scaleFactor;
  const sRowSpacing = best.rowSpacing * best.scaleFactor;
  const placements = [];

  for (let r = 0; r < best.rows; r++) {
    for (let c = 0; c < best.cols; c++) {
      if (placements.length >= targetCount) break;

      let flip = false;
      if (best.configName === 'tbCols') flip = c % 2 === 1;
      else if (best.configName === 'tbRows') flip = r % 2 === 1;
      else if (best.configName === 'tbChecker') flip = (r + c) % 2 === 1;

      placements.push({
        x: c * sColSpacing,
        y: r * sRowSpacing,
        width: best.bboxW,
        height: best.bboxH,
        rotation: 0,
        flip,
      });
    }
  }

  const scaledW = best.bboxW * best.scaleFactor;
  const scaledH = best.bboxH * best.scaleFactor;

  console.log(`[PROFILER] Best: ${best.configName} ${best.cols}x${best.rows} scale=${best.scaleFactor.toFixed(4)} → ${scaledW.toFixed(1)}x${scaledH.toFixed(1)}cm`);
  console.log(`[PROFILER] Spacings at scale=1: col=${best.colSpacing.toFixed(2)} row=${best.rowSpacing.toFixed(2)} (bbox: ${best.bboxW.toFixed(2)}x${best.bboxH.toFixed(2)})`);
  console.log(`[PROFILER] Col saving: ${((1 - best.colSpacing / best.bboxW) * 100).toFixed(1)}% | Row saving: ${((1 - best.rowSpacing / best.bboxH) * 100).toFixed(1)}%`);

  return {
    scaleFactor: best.scaleFactor,
    cols: best.cols,
    rows: best.rows,
    colSpacing: best.colSpacing,
    rowSpacing: best.rowSpacing,
    configName: best.configName,
    totalPieces: Math.min(best.totalPieces, targetCount),
    placements,
    scaledBboxW: scaledW,
    scaledBboxH: scaledH,
  };
}
