/**
 * TEST PLACEMENT — Places 2-4 test pieces at computed spacing.
 * Used for visual verification BEFORE placing all pieces.
 *
 * Reads: /tmp/armado_input.json { placements (first 4), scaleFactor }
 * Opens template, pastes pieces at positions, does NOT create badge or cut artboard.
 */

//@include "utils.jsx"

(function() {
  try {
    var plan = readJSON(ARMADO_INPUT);
    if (!plan || !plan.placements) {
      writeJSON(ARMADO_OUTPUT, { error: 'No test placement data found.' });
      return;
    }

    var sourceDoc = app.activeDocument;

    if (sourceDoc.selection.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No design selected.' });
      return;
    }

    app.executeMenuCommand('copy');

    // Open template
    var templateFile = new File(plan.templatePath);
    if (!templateFile.exists) {
      writeJSON(ARMADO_OUTPUT, { error: 'Template not found: ' + plan.templatePath });
      return;
    }
    var newDoc = app.open(templateFile);
    newDoc.activate();

    var marginPt = cmToPoints(plan.margin || 0.05);

    // Place only the test pieces (first 2-4)
    var count = Math.min(plan.placements.length, 4);
    for (var i = 0; i < count; i++) {
      var p = plan.placements[i];

      app.executeMenuCommand('paste');

      if (newDoc.selection.length > 0) {
        var placed = newDoc.selection[0];

        if (newDoc.selection.length > 1) {
          app.executeMenuCommand('group');
          placed = newDoc.selection[0];
        }

        if (plan.scaleFactor && plan.scaleFactor !== 1.0) {
          placed.resize(plan.scaleFactor * 100, plan.scaleFactor * 100);
        }

        if (p.rotation === 90) placed.rotate(90);
        if (p.flip) placed.rotate(180);

        var xPos = cmToPoints(p.x);
        var yPos = -cmToPoints(p.y);
        var bounds = placed.geometricBounds;
        placed.translate(xPos - bounds[0], yPos - bounds[1]);
      }

      newDoc.selection = null;
    }

    // Zoom to fit
    app.executeMenuCommand('fitall');

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      placedCount: count,
      description: 'Test placement for visual verification'
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'TestPlacement error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
