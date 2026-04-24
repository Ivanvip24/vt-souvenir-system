/**
 * Extract design info from Illustrator selection.
 * Writes dimensions, aspect ratio, and red line presence to JSON.
 */

// Include utilities
//@include "utils.jsx"

(function() {
  try {
    if (app.documents.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No document open in Illustrator.' });
      return;
    }

    var doc = app.activeDocument;
    var sel = doc.selection;

    // Auto-select all items on active layer if nothing is selected
    if (!sel || sel.length === 0) {
      var layer = doc.activeLayer;
      for (var ai = 0; ai < layer.pageItems.length; ai++) {
        layer.pageItems[ai].selected = true;
      }
      sel = doc.selection;
    }

    if (!sel || sel.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No objects found in Illustrator. Please open a design first.' });
      return;
    }

    // Get overall bounds
    var overallBounds = getSelectionBounds(sel);
    if (!overallBounds) {
      writeJSON(ARMADO_OUTPUT, { error: 'Could not determine selection bounds.' });
      return;
    }

    var overallWidthPt = overallBounds[2] - overallBounds[0];
    var overallHeightPt = overallBounds[1] - overallBounds[3];

    // Find red cut line boundary
    var redBounds = findRedBoundary(sel);
    var hasRedLines = (redBounds !== null);

    var pieceWidthPt, pieceHeightPt;
    if (hasRedLines) {
      pieceWidthPt = redBounds[2] - redBounds[0];
      pieceHeightPt = redBounds[1] - redBounds[3];
    } else {
      pieceWidthPt = overallWidthPt;
      pieceHeightPt = overallHeightPt;
    }

    var pieceWidthCm = pointsToCm(pieceWidthPt);
    var pieceHeightCm = pointsToCm(pieceHeightPt);

    writeJSON(ARMADO_OUTPUT, {
      overallWidth: pointsToCm(overallWidthPt),
      overallHeight: pointsToCm(overallHeightPt),
      pieceWidth: pieceWidthCm,
      pieceHeight: pieceHeightCm,
      aspectRatio: pieceWidthCm / pieceHeightCm,
      hasRedLines: hasRedLines,
      selectionCount: sel.length,
      documentName: doc.name
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'ExtractInfo error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
