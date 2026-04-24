/**
 * Extract full bezier contour from the red cut line path.
 * Outputs all anchor points + bezier handles for profile computation in Node.js.
 */

//@include "utils.jsx"

(function() {
  try {
    var doc = app.activeDocument;
    var layer = doc.activeLayer;

    // Find red paths
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
            // For compound paths, use sub-paths
            for (var j = 0; j < cp.pathItems.length; j++) {
              redPaths.push(cp.pathItems[j]);
            }
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

    // Find largest red path (main contour)
    var mainPath = redPaths[0];
    var mainArea = 0;
    for (var i = 0; i < redPaths.length; i++) {
      var a = Math.abs(redPaths[i].area);
      if (a > mainArea) {
        mainArea = a;
        mainPath = redPaths[i];
      }
    }

    var bounds = mainPath.geometricBounds;
    var pts = mainPath.pathPoints;
    var pointCount = pts.length;

    // Extract all path points with bezier handles
    var pathData = [];
    for (var i = 0; i < pointCount; i++) {
      var pt = pts[i];
      pathData.push({
        a: [pt.anchor[0], pt.anchor[1]],
        l: [pt.leftDirection[0], pt.leftDirection[1]],
        r: [pt.rightDirection[0], pt.rightDirection[1]]
      });
    }

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      bounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
      bboxW: pointsToCm(bounds[2] - bounds[0]),
      bboxH: pointsToCm(bounds[1] - bounds[3]),
      closed: mainPath.closed,
      pointCount: pointCount,
      pathData: pathData
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'ExtractContour error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
