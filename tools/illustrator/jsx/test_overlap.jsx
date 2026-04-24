/**
 * Test if two adjacent pieces overlap at a given horizontal offset.
 * Duplicates the red cut line, positions it at an offset, runs Pathfinder Intersect.
 * If intersection has area > 0, they overlap.
 * Binary searches for the maximum safe overlap.
 *
 * Reads: { pieceWidthPt } from /tmp/armado_input.json (the cut line bounding box width)
 * Returns: { safeOverlapCm, testedSteps }
 */

//@include "utils.jsx"

(function() {
  try {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;

    // Find the main red cut line path (largest area) — search recursively
    var redPaths = [];
    function findRed(container) {
      try {
        for (var i = 0; i < container.pathItems.length; i++) {
          var item = container.pathItems[i];
          if (item.stroked && isRedColor(item.strokeColor)) {
            redPaths.push(item);
          }
        }
      } catch (e) {}
      try {
        for (var i = 0; i < container.compoundPathItems.length; i++) {
          var cp = container.compoundPathItems[i];
          if (cp.pathItems.length > 0 && cp.pathItems[0].stroked && isRedColor(cp.pathItems[0].strokeColor)) {
            redPaths.push(cp);
          }
        }
      } catch (e) {}
      try {
        for (var i = 0; i < container.groupItems.length; i++) {
          findRed(container.groupItems[i]);
        }
      } catch (e) {}
    }
    findRed(layer);

    if (redPaths.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No red cut line found.' });
      return;
    }

    // Find largest red path
    var mainPath = redPaths[0];
    var mainArea = 0;
    for (var i = 0; i < redPaths.length; i++) {
      var a = Math.abs(redPaths[i].area || 0);
      // For compound paths, sum sub-path areas
      if (redPaths[i].typename === 'CompoundPathItem') {
        a = 0;
        for (var j = 0; j < redPaths[i].pathItems.length; j++) {
          a += Math.abs(redPaths[i].pathItems[j].area);
        }
      }
      if (a > mainArea) {
        mainArea = a;
        mainPath = redPaths[i];
      }
    }

    var bounds = mainPath.geometricBounds;
    var pieceWidthPt = bounds[2] - bounds[0];
    var pieceWidthCm = pointsToCm(pieceWidthPt);

    // Binary search for max safe horizontal overlap
    var loOverlap = 0;           // cm, known safe
    var hiOverlap = pieceWidthCm * 0.15; // cm, max to test (15% of width)
    var safeOverlap = 0;
    var steps = 0;
    var maxSteps = 10;

    // Suppress alerts
    var origLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    try {
      while (steps < maxSteps && (hiOverlap - loOverlap) > 0.01) {
        var testOverlap = (loOverlap + hiOverlap) / 2;
        var testOffsetPt = pieceWidthPt - cmToPoints(testOverlap);

        // Duplicate the cut line
        var copy1 = mainPath.duplicate();
        var copy2 = mainPath.duplicate();

        // Position copy2 at the test offset
        copy2.translate(testOffsetPt, 0);

        // Select both and run Pathfinder Intersect
        doc.selection = null;
        copy1.selected = true;
        copy2.selected = true;

        // Group for pathfinder
        app.executeMenuCommand('group');
        var grouped = doc.selection[0];

        // Pathfinder Intersect
        try {
          app.executeMenuCommand('Live Pathfinder Intersect');
          app.redraw();
          app.executeMenuCommand('expandStyle');
          app.redraw();

          // Check if result has any area
          var resultItem = doc.selection[0];
          var hasIntersection = false;

          if (resultItem) {
            if (resultItem.typename === 'GroupItem') {
              for (var i = 0; i < resultItem.pathItems.length; i++) {
                if (Math.abs(resultItem.pathItems[i].area) > 1) {
                  hasIntersection = true;
                  break;
                }
              }
            } else if (resultItem.typename === 'PathItem') {
              hasIntersection = Math.abs(resultItem.area) > 1;
            } else if (resultItem.typename === 'CompoundPathItem') {
              for (var i = 0; i < resultItem.pathItems.length; i++) {
                if (Math.abs(resultItem.pathItems[i].area) > 1) {
                  hasIntersection = true;
                  break;
                }
              }
            }
            // Clean up
            try { resultItem.remove(); } catch (e) {}
          }

          if (hasIntersection) {
            // Overlaps — try less
            hiOverlap = testOverlap;
          } else {
            // No overlap — safe, try more
            safeOverlap = testOverlap;
            loOverlap = testOverlap;
          }
        } catch (e) {
          // Pathfinder failed — clean up and assume overlap
          try {
            if (doc.selection[0]) doc.selection[0].remove();
          } catch (e2) {}
          hiOverlap = testOverlap;
        }

        // Clean up any leftovers
        try { copy1.remove(); } catch (e) {}
        try { copy2.remove(); } catch (e) {}

        steps++;
      }
    } finally {
      app.userInteractionLevel = origLevel;
    }

    safeOverlap = Math.round(safeOverlap * 100) / 100;

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      safeOverlapCm: safeOverlap,
      pieceWidthCm: pieceWidthCm,
      testedSteps: steps,
      maxTestedCm: hiOverlap
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'TestOverlap error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
