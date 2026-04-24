/**
 * AXKAN Promotional Materials Generator - Acrylic & On-Top Printing
 * Creates multiple promo files with proper layers:
 *   - Layer 1: DISEÑO (artwork in CMYK)
 *   - Layer 2: CORTE (cut/die line - spot color)
 *   - Layer 3: BLANCO (white ink for clear acrylic)
 *   - Layer 4: BARNIZ / ON TOP (spot UV / raised elements)
 *
 * Reads config from /tmp/armado_input.json
 */

//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input || !input.logoPath) {
      writeJSON(ARMADO_OUTPUT, { error: 'No logoPath provided in input.' });
      return;
    }

    var logoFile = new File(input.logoPath);
    if (!logoFile.exists) {
      writeJSON(ARMADO_OUTPUT, { error: 'Logo file not found: ' + input.logoPath });
      return;
    }

    var outputDir = input.outputDir || '/Users/ivanvalenciaperez/Downloads/AXKAN/PROMO';
    var outputFolder = new Folder(outputDir);
    if (!outputFolder.exists) outputFolder.create();

    var items = input.items || [
      { name: 'LETRERO_ACRILICO', widthCm: 60, heightCm: 40, desc: 'Letrero Acrílico Grande' },
      { name: 'LETRERO_ESCRITORIO', widthCm: 25, heightCm: 15, desc: 'Letrero de Escritorio' },
      { name: 'LLAVERO', widthCm: 5, heightCm: 5, desc: 'Llavero Acrílico' },
      { name: 'PLACA_RECONOCIMIENTO', widthCm: 20, heightCm: 25, desc: 'Placa de Reconocimiento' },
      { name: 'EXHIBIDOR', widthCm: 30, heightCm: 40, desc: 'Exhibidor de Mesa' },
      { name: 'TARJETA_UV', widthCm: 9, heightCm: 5.5, desc: 'Tarjeta con UV On Top' }
    ];

    // First, open the logo file to grab the artwork
    var logoDoc = app.open(logoFile);
    $.sleep(2000);
    app.redraw();

    // Select all and copy the logo
    logoDoc.selection = null;
    for (var a = 0; a < logoDoc.layers.length; a++) {
      var lay = logoDoc.layers[a];
      if (!lay.locked && lay.visible) {
        for (var p = 0; p < lay.pageItems.length; p++) {
          lay.pageItems[p].selected = true;
        }
      }
    }
    app.executeMenuCommand('copy');

    // Get logo bounds for aspect ratio
    var logoBounds = null;
    if (logoDoc.selection && logoDoc.selection.length > 0) {
      logoBounds = getSelectionBounds(logoDoc.selection);
    }
    var logoW = logoBounds ? (logoBounds[2] - logoBounds[0]) : 200;
    var logoH = logoBounds ? (logoBounds[1] - logoBounds[3]) : 200;
    var logoRatio = logoW / logoH;

    var createdFiles = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var wPt = cmToPoints(item.widthCm);
      var hPt = cmToPoints(item.heightCm);

      // Create new CMYK document
      var preset = new DocumentPreset();
      preset.colorMode = DocumentColorSpace.CMYK;
      preset.width = wPt;
      preset.height = hPt;
      preset.units = RulerUnits.Centimeters;
      preset.title = 'AXKAN_' + item.name;

      var doc = app.documents.addDocument('Print', preset);
      $.sleep(500);

      // ===== LAYER SETUP =====

      // Rename default layer to DISEÑO
      var layerDiseno = doc.layers[0];
      layerDiseno.name = 'DISEÑO';

      // Create CORTE layer (cut line)
      var layerCorte = doc.layers.add();
      layerCorte.name = 'CORTE';

      // Create BLANCO layer (white ink)
      var layerBlanco = doc.layers.add();
      layerBlanco.name = 'BLANCO';

      // Create ON TOP / BARNIZ layer (spot UV)
      var layerOnTop = doc.layers.add();
      layerOnTop.name = 'ON TOP (BARNIZ UV)';

      // ===== SPOT COLORS =====

      // Create CutContour spot color
      var cutSpot;
      try {
        cutSpot = doc.spots.getByName('CutContour');
      } catch (e) {
        cutSpot = doc.spots.add();
        cutSpot.name = 'CutContour';
        var cutColor = new CMYKColor();
        cutColor.cyan = 0;
        cutColor.magenta = 100;
        cutColor.yellow = 0;
        cutColor.black = 0;
        cutSpot.color = cutColor;
        cutSpot.colorType = ColorModel.SPOT;
      }

      // Create White spot color
      var whiteSpot;
      try {
        whiteSpot = doc.spots.getByName('White');
      } catch (e) {
        whiteSpot = doc.spots.add();
        whiteSpot.name = 'White';
        var whiteColor = new CMYKColor();
        whiteColor.cyan = 0;
        whiteColor.magenta = 0;
        whiteColor.yellow = 0;
        whiteColor.black = 0;
        whiteSpot.color = whiteColor;
        whiteSpot.colorType = ColorModel.SPOT;
      }

      // Create SpotUV spot color
      var uvSpot;
      try {
        uvSpot = doc.spots.getByName('SpotUV');
      } catch (e) {
        uvSpot = doc.spots.add();
        uvSpot.name = 'SpotUV';
        var uvColor = new CMYKColor();
        uvColor.cyan = 100;
        uvColor.magenta = 0;
        uvColor.yellow = 100;
        uvColor.black = 0;
        uvSpot.color = uvColor;
        uvSpot.colorType = ColorModel.SPOT;
      }

      // ===== CORTE LAYER - Die/Cut line =====
      doc.activeLayer = layerCorte;

      var margin = cmToPoints(0.3); // 3mm bleed margin
      var cutRect = doc.pathItems.rectangle(
        hPt - margin,    // top (from top, negative down in AI coords)
        margin,           // left
        wPt - (margin * 2), // width
        hPt - (margin * 2)  // height
      );

      var cutSpotColor = new SpotColor();
      cutSpotColor.spot = cutSpot;
      cutSpotColor.tint = 100;

      cutRect.filled = false;
      cutRect.stroked = true;
      cutRect.strokeColor = cutSpotColor;
      cutRect.strokeWidth = 0.5;

      // ===== DISEÑO LAYER - Paste logo =====
      doc.activeLayer = layerDiseno;
      app.executeMenuCommand('paste');
      $.sleep(500);

      // Scale and center the logo
      if (doc.selection && doc.selection.length > 0) {
        var sel = doc.selection;
        var selBounds = getSelectionBounds(sel);
        var selW = selBounds[2] - selBounds[0];
        var selH = selBounds[1] - selBounds[3];

        // Target: logo at 60% of document area
        var targetW = wPt * 0.6;
        var targetH = hPt * 0.4;
        var scaleX = (targetW / selW) * 100;
        var scaleY = (targetH / selH) * 100;
        var scale = Math.min(scaleX, scaleY);

        // Group, scale, and center
        var grp = doc.groupItems.add();
        for (var s = sel.length - 1; s >= 0; s--) {
          sel[s].move(grp, ElementPlacement.PLACEATBEGINNING);
        }

        grp.resize(scale, scale, true, true, true, true, scale);

        // Center in document
        var grpBounds = grp.geometricBounds;
        var grpW = grpBounds[2] - grpBounds[0];
        var grpH = grpBounds[1] - grpBounds[3];

        grp.position = [
          (wPt - grpW) / 2,
          hPt - ((hPt - grpH) / 2)
        ];

        // ===== BLANCO LAYER - White underbase (copy of logo shape) =====
        doc.activeLayer = layerBlanco;
        var whiteCopy = grp.duplicate(layerBlanco, ElementPlacement.PLACEATBEGINNING);

        var whiteSpotColor = new SpotColor();
        whiteSpotColor.spot = whiteSpot;
        whiteSpotColor.tint = 100;

        // Set all paths in white copy to White spot color
        setGroupColor(whiteCopy, whiteSpotColor, true);

        // ===== ON TOP LAYER - Spot UV effect (copy logo for raised effect) =====
        doc.activeLayer = layerOnTop;
        var uvCopy = grp.duplicate(layerOnTop, ElementPlacement.PLACEATBEGINNING);

        var uvSpotColor = new SpotColor();
        uvSpotColor.spot = uvSpot;
        uvSpotColor.tint = 100;

        // Set all paths in UV copy to SpotUV color
        setGroupColor(uvCopy, uvSpotColor, true);
      }

      // Reorder layers: ON TOP on top, then BLANCO, then DISEÑO, then CORTE at bottom
      layerOnTop.zOrder(ZOrderMethod.BRINGTOFRONT);
      layerBlanco.zOrder(ZOrderMethod.BRINGTOFRONT);
      layerDiseno.zOrder(ZOrderMethod.BRINGTOFRONT);
      // Wait no - we want DISEÑO on top visually for editing, but print order matters
      // Standard print order (top to bottom): ON TOP > DISEÑO > BLANCO > CORTE
      layerCorte.zOrder(ZOrderMethod.SENDTOBACK);
      layerBlanco.zOrder(ZOrderMethod.SENDTOBACK);

      // Lock special layers to prevent accidental edits
      layerCorte.locked = true;
      layerBlanco.locked = true;
      layerOnTop.locked = true;

      // ===== SAVE =====
      var savePath = outputDir + '/AXKAN_' + item.name + '.ai';
      var saveFile = new File(savePath);
      var saveOpts = new IllustratorSaveOptions();
      saveOpts.compatibility = Compatibility.ILLUSTRATOR17;
      saveOpts.flattenOutput = OutputFlattening.PRESERVEAPPEARANCE;
      saveOpts.pdfCompatible = true;

      doc.saveAs(saveFile, saveOpts);
      createdFiles.push(savePath);

      // Close doc
      doc.close(SaveOptions.DONOTSAVECHANGES);
      $.sleep(300);
    }

    // Close the logo source doc
    try { logoDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      filesCreated: createdFiles.length,
      files: createdFiles,
      outputDir: outputDir
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, {
      error: 'PromoCreator error: ' + e.message + ' (line ' + e.line + ')',
      stack: e.toString()
    });
  }
})();

/**
 * Recursively set fill color on all path items in a group/item.
 */
function setGroupColor(item, color, fillOnly) {
  if (item.typename === 'GroupItem') {
    for (var i = 0; i < item.pageItems.length; i++) {
      setGroupColor(item.pageItems[i], color, fillOnly);
    }
  } else if (item.typename === 'CompoundPathItem') {
    for (var j = 0; j < item.pathItems.length; j++) {
      item.pathItems[j].fillColor = color;
      item.pathItems[j].filled = true;
      if (fillOnly) {
        item.pathItems[j].stroked = false;
      }
    }
  } else if (item.typename === 'PathItem') {
    item.fillColor = color;
    item.filled = true;
    if (fillOnly) {
      item.stroked = false;
    }
  } else if (item.typename === 'TextFrame') {
    try {
      for (var k = 0; k < item.textRange.characterAttributes.length; k++) {
        item.textRange.characterAttributes[k].fillColor = color;
      }
    } catch (e) {
      // Fallback: set on the whole text range
      try { item.textRange.fillColor = color; } catch (e2) {}
    }
  }
}
