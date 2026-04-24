/**
 * Extract shape analysis data from the red cut line (suaje) after PREPARACION.
 * Returns metrics the AI uses for flip/rotation/vertical nesting recommendations.
 * NOTE: Horizontal overlap is measured separately by test_overlap.jsx using Pathfinder.
 */

//@include "utils.jsx"

(function() {
  try {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;

    // Find red cut line paths
    var redPaths = [];

    function findRedPaths(container) {
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
        findRedPaths(container.groupItems[i]);
      }
    }

    findRedPaths(layer);

    if (redPaths.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No red cut line paths found.' });
      return;
    }

    // Find the largest red path (the main cut line silhouette)
    var mainPath = redPaths[0];
    var mainArea = 0;
    for (var i = 0; i < redPaths.length; i++) {
      var a = Math.abs(redPaths[i].area);
      if (a > mainArea) {
        mainArea = a;
        mainPath = redPaths[i];
      }
    }

    // Bounding box
    var bounds = mainPath.geometricBounds;
    var bboxW = bounds[2] - bounds[0];
    var bboxH = bounds[1] - bounds[3];
    var bboxArea = bboxW * bboxH;

    // Shape area (pathItem.area returns negative for clockwise)
    var shapeArea = Math.abs(mainPath.area);
    var fillRatio = shapeArea / bboxArea;

    // Anchor point count
    var pointCount = mainPath.pathPoints.length;

    // Analyze shape profile: divide into quadrants to detect concavities
    var centerX = (bounds[0] + bounds[2]) / 2;
    var centerY = (bounds[1] + bounds[3]) / 2;

    // Sample points along the path to understand shape profile
    // Count points in each quadrant to detect asymmetry
    var quadrants = { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 };
    var extremes = {
      topLeftX: bounds[2], topRightX: bounds[0],
      bottomLeftX: bounds[2], bottomRightX: bounds[0]
    };

    for (var i = 0; i < pointCount; i++) {
      var pt = mainPath.pathPoints[i];
      var px = pt.anchor[0];
      var py = pt.anchor[1];

      if (py > centerY) {
        // Top half
        if (px < centerX) {
          quadrants.topLeft++;
          extremes.topLeftX = Math.min(extremes.topLeftX, px);
        } else {
          quadrants.topRight++;
          extremes.topRightX = Math.max(extremes.topRightX, px);
        }
      } else {
        // Bottom half
        if (px < centerX) {
          quadrants.bottomLeft++;
          extremes.bottomLeftX = Math.min(extremes.bottomLeftX, px);
        } else {
          quadrants.bottomRight++;
          extremes.bottomRightX = Math.max(extremes.bottomRightX, px);
        }
      }
    }

    // Width of shape at top vs bottom (detect tapering)
    var topWidth = extremes.topRightX - extremes.topLeftX;
    var bottomWidth = extremes.bottomRightX - extremes.bottomLeftX;
    var topBottomRatio = topWidth / Math.max(bottomWidth, 0.01);

    // Horizontal symmetry: compare left and right point distribution
    var leftPoints = quadrants.topLeft + quadrants.bottomLeft;
    var rightPoints = quadrants.topRight + quadrants.bottomRight;
    var hSymmetry = Math.min(leftPoints, rightPoints) / Math.max(leftPoints, rightPoints, 1);

    // Vertical symmetry: compare top and bottom
    var topPoints = quadrants.topLeft + quadrants.topRight;
    var bottomPoints = quadrants.bottomLeft + quadrants.bottomRight;
    var vSymmetry = Math.min(topPoints, bottomPoints) / Math.max(topPoints, bottomPoints, 1);

    // Extract simplified path outline (every Nth point for AI analysis)
    var step = Math.max(1, Math.floor(pointCount / 20)); // max 20 sample points
    var samplePoints = [];
    for (var i = 0; i < pointCount; i += step) {
      var pt = mainPath.pathPoints[i];
      // Normalize to 0-100 range relative to bounding box
      var nx = Math.round(((pt.anchor[0] - bounds[0]) / bboxW) * 100);
      var ny = Math.round(((bounds[1] - pt.anchor[1]) / bboxH) * 100);
      samplePoints.push([nx, ny]);
    }

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      widthPt: bboxW,
      heightPt: bboxH,
      widthCm: pointsToCm(bboxW),
      heightCm: pointsToCm(bboxH),
      shapeArea: shapeArea,
      bboxArea: bboxArea,
      fillRatio: fillRatio,
      pointCount: pointCount,
      topBottomRatio: topBottomRatio,
      hSymmetry: hSymmetry,
      vSymmetry: vSymmetry,
      samplePoints: samplePoints,
      totalRedPaths: redPaths.length
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'ExtractShape error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
