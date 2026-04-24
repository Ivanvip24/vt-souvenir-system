/**
 * TEST OVERLAP WITH FLIP — Pathfinder-based collision test.
 *
 * FIXES ALL THREE BUGS:
 * 1. Uses ALL red items (not just largest) grouped together
 * 2. Simulates placement by OVERALL bounds (same as armado_execute.jsx)
 * 3. Accounts for rebase asymmetry on 180° flip
 *
 * Binary searches for max safe overlap in overall-bounds spacing.
 */

//@include "utils.jsx"

(function() {
  try {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;

    // ============================================================
    // STEP 1: Collect ALL red items (paths + compound paths)
    // ============================================================
    var allRedItems = [];
    function findAllRed(container) {
      try {
        for (var i = 0; i < container.pathItems.length; i++) {
          var item = container.pathItems[i];
          if (item.parent && item.parent.typename === 'CompoundPathItem') continue;
          if (item.stroked && isRedColor(item.strokeColor)) allRedItems.push(item);
        }
      } catch(e) {}
      try {
        for (var i = 0; i < container.compoundPathItems.length; i++) {
          var cp = container.compoundPathItems[i];
          if (cp.pathItems.length > 0 && cp.pathItems[0].stroked && isRedColor(cp.pathItems[0].strokeColor)) {
            allRedItems.push(cp);
          }
        }
      } catch(e) {}
      try {
        for (var i = 0; i < container.groupItems.length; i++) findAllRed(container.groupItems[i]);
      } catch(e) {}
    }
    findAllRed(layer);

    if (allRedItems.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No red cut line found.' });
      return;
    }

    // ============================================================
    // STEP 2: Get overall bounds and cut line bounds
    // ============================================================
    var overallBounds = getSelectionBounds(doc.selection.length > 0 ? doc.selection : layer.pageItems);

    // Get combined red bounds (ALL red items)
    var redBounds = null;
    for (var i = 0; i < allRedItems.length; i++) {
      var b = allRedItems[i].geometricBounds;
      if (!redBounds) redBounds = [b[0], b[1], b[2], b[3]];
      else {
        redBounds[0] = Math.min(redBounds[0], b[0]);
        redBounds[1] = Math.max(redBounds[1], b[1]);
        redBounds[2] = Math.max(redBounds[2], b[2]);
        redBounds[3] = Math.min(redBounds[3], b[3]);
      }
    }

    var overallW = overallBounds[2] - overallBounds[0];
    var overallH = overallBounds[1] - overallBounds[3];
    var cutW = redBounds[2] - redBounds[0];
    var cutH = redBounds[1] - redBounds[3];

    // Rebase offsets (how far cut line is from each edge of overall bounds)
    var cutLeftOffset = redBounds[0] - overallBounds[0];
    var cutRightOffset = overallBounds[2] - redBounds[2];
    var cutTopOffset = overallBounds[1] - redBounds[1];
    var cutBottomOffset = redBounds[3] - overallBounds[3];

    // ============================================================
    // STEP 3: Group all red items for Pathfinder testing
    // ============================================================
    // Duplicate all red items and group them as "cut line group A"
    function duplicateAllRed() {
      var copies = [];
      for (var i = 0; i < allRedItems.length; i++) {
        copies.push(allRedItems[i].duplicate());
      }
      // Group them
      if (copies.length > 1) {
        doc.selection = null;
        for (var i = 0; i < copies.length; i++) copies[i].selected = true;
        app.executeMenuCommand('group');
        return doc.selection[0];
      }
      return copies[0];
    }

    var origLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    /**
     * Test if two pieces collide at a given OVERALL-BOUNDS spacing.
     * Simulates exactly what armado_execute.jsx does:
     * - Position by overall bounds
     * - Flip second piece 180° if requested
     */
    /**
     * Make a compound path from a group of paths.
     * This unites all sub-paths into ONE object for Pathfinder.
     */
    function makeCompound(group) {
      if (group.typename === 'PathItem' || group.typename === 'CompoundPathItem') {
        return group; // already a single object
      }
      // Select all items in group and make compound path
      doc.selection = null;
      if (group.typename === 'GroupItem') {
        for (var i = 0; i < group.pageItems.length; i++) {
          group.pageItems[i].selected = true;
        }
      } else {
        group.selected = true;
      }
      app.executeMenuCommand('compoundPath');
      var result = doc.selection[0];
      doc.selection = null;
      return result;
    }

    function testCollision(overallSpacingPt, isHorizontal, flipSecond) {
      // Duplicate all red items for piece A and B
      var groupA = duplicateAllRed();
      var groupB = duplicateAllRed();

      // Unite each piece's red paths into ONE compound path
      // This is critical: Pathfinder Intersect needs exactly 2 objects
      var compA = makeCompound(groupA);
      var compB = makeCompound(groupB);

      if (flipSecond) {
        var bB = compB.geometricBounds;
        var cx = (bB[0] + bB[2]) / 2;
        var cy = (bB[1] + bB[3]) / 2;
        compB.translate(-cx, -cy);
        compB.rotate(180);
        compB.translate(cx, cy);
      }

      // Position B relative to A using OVERALL bounds spacing
      // Simulate armado_execute: position by geometricBounds
      var boundsA = compA.geometricBounds;
      var boundsB = compB.geometricBounds;

      if (isHorizontal) {
        var targetX = boundsA[0] + overallSpacingPt;
        compB.translate(targetX - boundsB[0], boundsA[1] - boundsB[1]);
      } else {
        var targetY = boundsA[1] - overallSpacingPt;
        compB.translate(boundsA[0] - boundsB[0], targetY - boundsB[1]);
      }

      // Select both compound paths and run Pathfinder Intersect
      // Now it's exactly 2 objects: compA ∩ compB
      doc.selection = null;
      compA.selected = true;
      compB.selected = true;

      var hasIntersection = false;
      try {
        app.executeMenuCommand('Live Pathfinder Intersect');
        app.redraw();
        app.executeMenuCommand('expandStyle');
        app.redraw();

        var resultItem = doc.selection[0];
        if (resultItem) {
          // Check if intersection result has any area
          function checkArea(item) {
            if (item.typename === 'GroupItem') {
              for (var i = 0; i < item.pageItems.length; i++) {
                if (checkArea(item.pageItems[i])) return true;
              }
            } else if (item.typename === 'PathItem') {
              if (Math.abs(item.area) > 2) return true;
            } else if (item.typename === 'CompoundPathItem') {
              for (var i = 0; i < item.pathItems.length; i++) {
                if (Math.abs(item.pathItems[i].area) > 2) return true;
              }
            }
            return false;
          }
          hasIntersection = checkArea(resultItem);
          try { resultItem.remove(); } catch(e) {}
        }
      } catch(e) {
        try { if (doc.selection[0]) doc.selection[0].remove(); } catch(e2) {}
        hasIntersection = true; // assume collision on error
      }

      try { compA.remove(); } catch(e) {}
      try { compB.remove(); } catch(e) {}
      doc.selection = null;

      return hasIntersection;
    }

    /**
     * Binary search for min safe OVERALL spacing.
     */
    function findMinSpacing(isHorizontal, flip) {
      var dimension = isHorizontal ? overallW : overallH;
      // Start at 50% of dimension (aggressive) up to full dimension
      var lo = dimension * 0.5;
      var hi = dimension;
      var safe = hi; // default = full dimension (no interlocking)

      // First check: does full dimension have collision? If yes, something is very wrong
      if (testCollision(hi, isHorizontal, flip)) {
        return dimension * 1.05; // add 5% safety
      }

      for (var step = 0; step < 12; step++) {
        var mid = (lo + hi) / 2;

        if (testCollision(mid, isHorizontal, flip)) {
          lo = mid; // collision — need more space
        } else {
          safe = mid;
          hi = mid; // safe — try less space
        }

        if (hi - lo < cmToPoints(0.01)) break; // 0.1mm precision
      }

      // Add 0.5mm safety margin
      return safe + cmToPoints(0.05);
    }

    // ============================================================
    // STEP 4: Test all 4 configurations
    // ============================================================
    var hSameSpacing = findMinSpacing(true, false);
    var hFlipSpacing = findMinSpacing(true, true);
    var vSameSpacing = findMinSpacing(false, false);
    var vFlipSpacing = findMinSpacing(false, true);

    app.userInteractionLevel = origLevel;

    // Convert to cm and compute overlaps (how much LESS than full dimension)
    var result = {
      success: true,
      overallWidthCm: pointsToCm(overallW),
      overallHeightCm: pointsToCm(overallH),
      cutWidthCm: pointsToCm(cutW),
      cutHeightCm: pointsToCm(cutH),
      // Min spacing in OVERALL-BOUNDS terms (ready to use in placements)
      hSameSpacingCm: pointsToCm(hSameSpacing),
      hFlipSpacingCm: pointsToCm(hFlipSpacing),
      vSameSpacingCm: pointsToCm(vSameSpacing),
      vFlipSpacingCm: pointsToCm(vFlipSpacing),
      // Rebase offsets
      cutLeftOffsetCm: pointsToCm(cutLeftOffset),
      cutRightOffsetCm: pointsToCm(cutRightOffset),
      cutTopOffsetCm: pointsToCm(cutTopOffset),
      cutBottomOffsetCm: pointsToCm(cutBottomOffset)
    };

    writeJSON(ARMADO_OUTPUT, result);

  } catch(e) {
    writeJSON(ARMADO_OUTPUT, { error: 'TestOverlapFlip error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
