/**
 * PIPELINE — Combined JSX for maximum speed.
 * Does everything in ONE Illustrator call:
 *   1. Open file & select all
 *   2. Extract original dimensions
 *   3. Resize to target
 *   4. Run PREPARACION
 *   5. Extract post-prep cut line dimensions
 *   6. Extract shape info (fill ratio, contour)
 *
 * Reads: /tmp/armado_input.json { filePath, targetWidth, targetHeight }
 * Writes: /tmp/armado_output.json { all combined results }
 */

//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input) {
      writeJSON(ARMADO_OUTPUT, { error: 'No input data found.' });
      return;
    }

    // ============================================================
    // STEP 1: Open file if provided
    // ============================================================
    if (input.filePath) {
      var f = new File(input.filePath);
      if (f.exists) {
        app.open(f);
        app.activeDocument.activate();
      }
    }

    if (app.documents.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No document open in Illustrator.' });
      return;
    }

    var doc = app.activeDocument;

    // ============================================================
    // STEP 2: Select all & extract original dimensions
    // ============================================================
    doc.selection = null;
    var layer = doc.activeLayer;
    for (var i = 0; i < layer.pageItems.length; i++) {
      try { layer.pageItems[i].selected = true; } catch (e) {}
    }

    var sel = doc.selection;
    if (!sel || sel.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No objects found. Please open a design.' });
      return;
    }

    var origBounds = getSelectionBounds(sel);
    var origWidthCm = pointsToCm(origBounds[2] - origBounds[0]);
    var origHeightCm = pointsToCm(origBounds[1] - origBounds[3]);
    var origAR = origWidthCm / origHeightCm;

    // ============================================================
    // STEP 3: Resize to target
    // ============================================================
    if (input.targetWidth && input.targetHeight) {
      var currentW = origBounds[2] - origBounds[0];
      var currentH = origBounds[1] - origBounds[3];
      var targetWPt = cmToPoints(input.targetWidth);
      var targetHPt = cmToPoints(input.targetHeight);
      var scaleX = (targetWPt / currentW) * 100;
      var scaleY = (targetHPt / currentH) * 100;
      var uniformScale = Math.min(scaleX, scaleY);

      // Group, scale, ungroup
      if (sel.length > 1) {
        app.executeMenuCommand('group');
        sel = doc.selection;
      }
      sel[0].resize(uniformScale, uniformScale);
      if (sel[0].typename === 'GroupItem') {
        app.executeMenuCommand('ungroup');
      }
      doc.selection = null;
      for (var i = 0; i < layer.pageItems.length; i++) {
        try { layer.pageItems[i].selected = true; } catch (e) {}
      }
      sel = doc.selection;
    }

    // Copy selection for ARMADO later
    app.executeMenuCommand('copy');

    // ============================================================
    // STEP 4: Run PREPARACION inline
    // ============================================================
    // The preparacion_execute.jsx logic — run it inline to avoid another JSX call
    var prepInput = new File('/tmp/armado_input.json');
    // We need to run preparacion as a separate include since it has complex logic
    // But we can call it via #include if it exists
    try {
      // Save current state, run preparacion
      var prepScript = new File(input.jsxDir + '/preparacion_execute.jsx');
      if (prepScript.exists) {
        $.evalFile(prepScript);
      }
    } catch (prepErr) {
      // If preparacion fails, continue with what we have
    }

    // Re-select all after preparacion
    doc.selection = null;
    for (var i = 0; i < layer.pageItems.length; i++) {
      try { layer.pageItems[i].selected = true; } catch (e) {}
    }
    sel = doc.selection;

    // ============================================================
    // STEP 5: Extract post-prep dimensions
    // ============================================================
    var postBounds = getSelectionBounds(sel);
    var postOverallW = pointsToCm(postBounds[2] - postBounds[0]);
    var postOverallH = pointsToCm(postBounds[1] - postBounds[3]);

    var redBounds = findRedBoundary(sel);
    var hasRedLines = (redBounds !== null);
    var pieceW, pieceH;
    if (hasRedLines) {
      pieceW = pointsToCm(redBounds[2] - redBounds[0]);
      pieceH = pointsToCm(redBounds[1] - redBounds[3]);
    } else {
      pieceW = postOverallW;
      pieceH = postOverallH;
    }

    // ============================================================
    // STEP 6: Extract shape info
    // ============================================================
    var fillRatio = 0.80;
    var topBottomRatio = 1.0;
    var hSymmetry = 1.0;
    var vSymmetry = 1.0;
    var pointCount = 0;
    var samplePoints = [];

    if (hasRedLines) {
      // Find red paths for shape analysis
      var redPaths = [];
      function findRedPathsPipeline(container) {
        for (var i = 0; i < container.pathItems.length; i++) {
          var item = container.pathItems[i];
          if (item.stroked && isRedColor(item.strokeColor)) {
            redPaths.push(item);
          }
        }
        for (var i = 0; i < container.compoundPathItems.length; i++) {
          var cp = container.compoundPathItems[i];
          if (cp.pathItems.length > 0 && cp.pathItems[0].stroked && isRedColor(cp.pathItems[0].strokeColor)) {
            for (var j = 0; j < cp.pathItems.length; j++) {
              redPaths.push(cp.pathItems[j]);
            }
          }
        }
        for (var i = 0; i < container.groupItems.length; i++) {
          findRedPathsPipeline(container.groupItems[i]);
        }
      }
      findRedPathsPipeline(layer);

      if (redPaths.length > 0) {
        // Find largest red path
        var mainPath = redPaths[0];
        var mainArea = 0;
        for (var i = 0; i < redPaths.length; i++) {
          var a = Math.abs(redPaths[i].area);
          if (a > mainArea) {
            mainArea = a;
            mainPath = redPaths[i];
          }
        }

        var shapeBounds = mainPath.geometricBounds;
        var bboxW = shapeBounds[2] - shapeBounds[0];
        var bboxH = shapeBounds[1] - shapeBounds[3];
        var bboxArea = bboxW * bboxH;
        var shapeArea = Math.abs(mainPath.area);
        fillRatio = shapeArea / bboxArea;
        pointCount = mainPath.pathPoints.length;

        // Top/bottom width analysis
        var centerX = (shapeBounds[0] + shapeBounds[2]) / 2;
        var centerY = (shapeBounds[1] + shapeBounds[3]) / 2;
        var quadrants = { tl: 0, tr: 0, bl: 0, br: 0 };
        var extremes = {
          tlX: shapeBounds[2], trX: shapeBounds[0],
          blX: shapeBounds[2], brX: shapeBounds[0]
        };

        for (var i = 0; i < pointCount; i++) {
          var pt = mainPath.pathPoints[i];
          var px = pt.anchor[0], py = pt.anchor[1];
          if (py > centerY) {
            if (px < centerX) { quadrants.tl++; extremes.tlX = Math.min(extremes.tlX, px); }
            else { quadrants.tr++; extremes.trX = Math.max(extremes.trX, px); }
          } else {
            if (px < centerX) { quadrants.bl++; extremes.blX = Math.min(extremes.blX, px); }
            else { quadrants.br++; extremes.brX = Math.max(extremes.brX, px); }
          }
        }

        var topW = extremes.trX - extremes.tlX;
        var bottomW = extremes.brX - extremes.blX;
        topBottomRatio = topW / Math.max(bottomW, 0.01);
        var leftPts = quadrants.tl + quadrants.bl;
        var rightPts = quadrants.tr + quadrants.br;
        hSymmetry = Math.min(leftPts, rightPts) / Math.max(leftPts, rightPts, 1);
        var topPts = quadrants.tl + quadrants.tr;
        var bottomPts = quadrants.bl + quadrants.br;
        vSymmetry = Math.min(topPts, bottomPts) / Math.max(topPts, bottomPts, 1);

        // Sample points
        var step = Math.max(1, Math.floor(pointCount / 20));
        for (var i = 0; i < pointCount; i += step) {
          var pt = mainPath.pathPoints[i];
          var nx = Math.round(((pt.anchor[0] - shapeBounds[0]) / bboxW) * 100);
          var ny = Math.round(((shapeBounds[1] - pt.anchor[1]) / bboxH) * 100);
          samplePoints.push([nx, ny]);
        }
      }
    }

    // ============================================================
    // OUTPUT — Everything in one JSON
    // ============================================================
    writeJSON(ARMADO_OUTPUT, {
      success: true,
      // Original
      originalWidth: origWidthCm,
      originalHeight: origHeightCm,
      originalAR: origAR,
      // Post-prep
      overallWidth: postOverallW,
      overallHeight: postOverallH,
      pieceWidth: pieceW,
      pieceHeight: pieceH,
      hasRedLines: hasRedLines,
      // Shape
      fillRatio: fillRatio,
      topBottomRatio: topBottomRatio,
      hSymmetry: hSymmetry,
      vSymmetry: vSymmetry,
      pointCount: pointCount,
      samplePoints: samplePoints,
      documentName: doc.name
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'Pipeline error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
