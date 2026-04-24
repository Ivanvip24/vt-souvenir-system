/**
 * Resize the selected design to a target size (in cm).
 * Reads targetWidth and targetHeight from /tmp/armado_input.json.
 * Scales uniformly to fit within the target dimensions while preserving aspect ratio.
 */

//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input || !input.targetWidth || !input.targetHeight) {
      writeJSON(ARMADO_OUTPUT, { error: 'No target dimensions provided.' });
      return;
    }

    var doc = app.activeDocument;

    if (doc.selection.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No design selected for resizing.' });
      return;
    }

    // Get current selection bounds
    var bounds = getSelectionBounds(doc.selection);
    var currentWidthPt = bounds[2] - bounds[0];
    var currentHeightPt = bounds[1] - bounds[3];
    var currentWidthCm = pointsToCm(currentWidthPt);
    var currentHeightCm = pointsToCm(currentHeightPt);

    var targetWidthCm = input.targetWidth;
    var targetHeightCm = input.targetHeight;

    // Calculate uniform scale factor to fit within target dimensions
    var scaleX = targetWidthCm / currentWidthCm;
    var scaleY = targetHeightCm / currentHeightCm;
    var scaleFactor = Math.min(scaleX, scaleY);

    // Apply scale as percentage
    var scalePercent = scaleFactor * 100;

    // Group selection if multiple items, then scale
    if (doc.selection.length > 1) {
      app.executeMenuCommand('group');
    }

    var item = doc.selection[0];
    item.resize(scalePercent, scalePercent);
    app.redraw();

    // Get new dimensions
    var newBounds = item.geometricBounds;
    var newWidthCm = pointsToCm(newBounds[2] - newBounds[0]);
    var newHeightCm = pointsToCm(newBounds[1] - newBounds[3]);

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      originalWidth: currentWidthCm,
      originalHeight: currentHeightCm,
      newWidth: newWidthCm,
      newHeight: newHeightCm,
      scaleFactor: scaleFactor
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'ResizeDesign error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
