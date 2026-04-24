/**
 * Save the active Illustrator document to a specified path.
 * Reads save path from /tmp/armado_input.json.
 */

//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input || !input.savePath) {
      writeJSON(ARMADO_OUTPUT, { error: 'No save path provided.' });
      return;
    }

    var doc = app.activeDocument;
    var saveFile = new File(input.savePath);

    var saveOpts = new IllustratorSaveOptions();
    saveOpts.compatibility = Compatibility.ILLUSTRATOR17;
    saveOpts.flattenOutput = OutputFlattening.PRESERVEAPPEARANCE;

    doc.saveAs(saveFile, saveOpts);

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      savedTo: input.savePath
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'Save error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();
