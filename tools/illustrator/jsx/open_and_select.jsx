/**
 * Open a file in Illustrator and select all items.
 * Reads file path from /tmp/armado_input.json.
 */

// Include utilities
//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input || !input.filePath) {
      writeJSON(ARMADO_OUTPUT, { error: 'No file path provided.' });
      return;
    }

    var filePath = input.filePath;
    var file = new File(filePath);

    if (!file.exists) {
      writeJSON(ARMADO_OUTPUT, { error: 'File not found: ' + filePath });
      return;
    }

    // Close any document with the same name (avoid working on stale data)
    var targetName = file.name;
    for (var d = app.documents.length - 1; d >= 0; d--) {
      try {
        if (app.documents[d].name === targetName) {
          app.documents[d].close(SaveOptions.DONOTSAVECHANGES);
          $.sleep(1000);
        }
      } catch (e) {}
    }

    // Open the file with retry
    var doc = null;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        doc = app.open(file);
        break;
      } catch (openErr) {
        $.sleep(2000);
      }
    }

    // Wait for document to fully load
    var waitCount = 0;
    while (app.documents.length === 0 && waitCount < 30) {
      $.sleep(500);
      waitCount++;
    }
    if (app.documents.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'Document failed to open after waiting.' });
      return;
    }
    doc = app.activeDocument;
    try { app.redraw(); } catch (e) { $.sleep(1000); app.redraw(); }

    // Select all items on the active layer
    doc.selection = null;
    var layer = doc.activeLayer;

    for (var i = 0; i < layer.pageItems.length; i++) {
      layer.pageItems[i].selected = true;
    }

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      documentName: doc.name,
      itemCount: layer.pageItems.length
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'OpenAndSelect error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
