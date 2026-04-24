/**
 * Select all items on the active layer of the active document.
 */

//@include "utils.jsx"

(function() {
  try {
    if (app.documents.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No document open.' });
      return;
    }

    var doc = app.activeDocument;
    doc.selection = null;
    var layer = doc.activeLayer;

    for (var i = 0; i < layer.pageItems.length; i++) {
      try {
        layer.pageItems[i].selected = true;
      } catch (e) {} // skip locked/hidden items
    }

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      documentName: doc.name,
      itemCount: layer.pageItems.length
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'SelectAll error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
