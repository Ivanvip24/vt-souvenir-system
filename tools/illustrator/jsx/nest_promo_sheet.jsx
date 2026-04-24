/**
 * AXKAN Promo Nesting - Fit all promo pieces on a single 61x122 cm acrylic sheet.
 * Opens each promo file, copies artwork, and arranges on the master sheet.
 * Maintains all 4 layers per piece (DISEÑO, CORTE, BLANCO, ON TOP).
 *
 * Reads config from /tmp/armado_input.json
 */

//@include "utils.jsx"

(function() {
  try {
    var input = readJSON(ARMADO_INPUT);
    if (!input) {
      writeJSON(ARMADO_OUTPUT, { error: 'No input provided.' });
      return;
    }

    var sheetW_cm = input.sheetWidth || 61;
    var sheetH_cm = input.sheetHeight || 122;
    var sheetW = cmToPoints(sheetW_cm);
    var sheetH = cmToPoints(sheetH_cm);
    var gap = cmToPoints(input.gapCm || 1.5); // 1.5 cm gap between pieces
    var margin = cmToPoints(input.marginCm || 1); // 1 cm margin from edges
    var outputPath = input.outputPath || '/Users/ivanvalenciaperez/Downloads/AXKAN/PROMO/AXKAN_SHEET_61x122.ai';
    var promoDir = input.promoDir || '/Users/ivanvalenciaperez/Downloads/AXKAN/PROMO';

    // Pieces with their dimensions (cm) - ordered largest to smallest for better packing
    var pieces = [
      { name: 'LETRERO_ACRILICO_60x40', w: 60, h: 40, qty: 1 },
      { name: 'EXHIBIDOR_30x40', w: 30, h: 40, qty: 1 },
      { name: 'PLACA_20x25', w: 20, h: 25, qty: 1 },
      { name: 'LETRERO_ESCRITORIO_25x15', w: 25, h: 15, qty: 1 },
      { name: 'TARJETA_UV_9x5.5', w: 9, h: 5.5, qty: 2 },
      { name: 'LLAVERO_5x5', w: 5, h: 5, qty: 4 }
    ];

    // ===== LAYOUT ALGORITHM =====
    // Simple shelf-based packing for the 61x122 sheet
    // Sheet is tall (portrait), so we pack rows from top to bottom

    var layout = [];
    var cursorY = sheetH - margin; // Start from top (AI coords: top = high Y)
    var cursorX = margin;
    var rowHeight = 0;

    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      for (var q = 0; q < piece.qty; q++) {
        var pw = cmToPoints(piece.w);
        var ph = cmToPoints(piece.h);

        // Check if piece fits in current row
        if (cursorX + pw > sheetW - margin) {
          // Move to next row
          cursorY -= (rowHeight + gap);
          cursorX = margin;
          rowHeight = 0;
        }

        // Check if piece fits rotated better
        var rotated = false;
        if (cursorX + pw > sheetW - margin && cursorX + ph <= sheetW - margin) {
          // Rotate 90 degrees
          var tmp = pw;
          pw = ph;
          ph = tmp;
          rotated = true;
        }

        // Check if still fits vertically
        if (cursorY - ph < margin) {
          // Won't fit, skip (should not happen with our sizes)
          continue;
        }

        layout.push({
          file: promoDir + '/AXKAN_' + piece.name + '.ai',
          name: piece.name + (q > 0 ? '_' + (q + 1) : ''),
          x: cursorX,
          y: cursorY,
          w: pw,
          h: ph,
          rotated: rotated
        });

        cursorX += pw + gap;
        if (ph > rowHeight) rowHeight = ph;
      }
    }

    // ===== CREATE MASTER SHEET =====
    var preset = new DocumentPreset();
    preset.colorMode = DocumentColorSpace.CMYK;
    preset.width = sheetW;
    preset.height = sheetH;
    preset.units = RulerUnits.Centimeters;
    preset.title = 'AXKAN_SHEET_61x122';

    var masterDoc = app.documents.addDocument('Print', preset);
    $.sleep(500);

    // Setup layers on master
    var masterDiseno = masterDoc.layers[0];
    masterDiseno.name = 'DISEÑO';

    var masterCorte = masterDoc.layers.add();
    masterCorte.name = 'CORTE';

    var masterBlanco = masterDoc.layers.add();
    masterBlanco.name = 'BLANCO';

    var masterOnTop = masterDoc.layers.add();
    masterOnTop.name = 'ON TOP (BARNIZ UV)';

    // ===== SPOT COLORS =====
    var cutSpot;
    try { cutSpot = masterDoc.spots.getByName('CutContour'); } catch (e) {
      cutSpot = masterDoc.spots.add();
      cutSpot.name = 'CutContour';
      var cc = new CMYKColor(); cc.cyan = 0; cc.magenta = 100; cc.yellow = 0; cc.black = 0;
      cutSpot.color = cc; cutSpot.colorType = ColorModel.SPOT;
    }

    // Add sheet border cut line on CORTE layer
    masterDoc.activeLayer = masterCorte;
    var sheetCut = masterDoc.pathItems.rectangle(sheetH, 0, sheetW, sheetH);
    var cutSpotColor = new SpotColor();
    cutSpotColor.spot = cutSpot;
    cutSpotColor.tint = 100;
    sheetCut.filled = false;
    sheetCut.stroked = true;
    sheetCut.strokeColor = cutSpotColor;
    sheetCut.strokeWidth = 0.25;

    // ===== PLACE EACH PIECE =====
    var placed = [];

    for (var p = 0; p < layout.length; p++) {
      var slot = layout[p];
      var srcFile = new File(slot.file);

      if (!srcFile.exists) {
        placed.push({ name: slot.name, error: 'File not found' });
        continue;
      }

      // Open source file
      var srcDoc = app.open(srcFile);
      $.sleep(800);
      app.redraw();

      // For each layer in source, copy items to corresponding master layer
      var layerMap = {
        'DISEÑO': masterDiseno,
        'CORTE': masterCorte,
        'BLANCO': masterBlanco,
        'ON TOP (BARNIZ UV)': masterOnTop
      };

      for (var layerName in layerMap) {
        var srcLayer;
        try { srcLayer = srcDoc.layers.getByName(layerName); } catch (e) { continue; }

        // Unlock if needed
        var wasLocked = srcLayer.locked;
        if (wasLocked) srcLayer.locked = false;

        if (srcLayer.pageItems.length === 0) {
          if (wasLocked) srcLayer.locked = true;
          continue;
        }

        // Select all items on this layer
        srcDoc.selection = null;
        srcDoc.activeLayer = srcLayer;
        for (var si = 0; si < srcLayer.pageItems.length; si++) {
          srcLayer.pageItems[si].selected = true;
        }

        if (srcDoc.selection.length === 0) {
          if (wasLocked) srcLayer.locked = true;
          continue;
        }

        // Group and copy
        app.executeMenuCommand('copy');

        if (wasLocked) srcLayer.locked = true;

        // Switch to master doc and paste on correct layer
        app.activeDocument = masterDoc;
        var targetLayer = layerMap[layerName];
        var wasTargetLocked = targetLayer.locked;
        if (wasTargetLocked) targetLayer.locked = false;
        masterDoc.activeLayer = targetLayer;

        app.executeMenuCommand('paste');
        $.sleep(300);

        if (masterDoc.selection && masterDoc.selection.length > 0) {
          var sel = masterDoc.selection;

          // Group the pasted items
          var grp = masterDoc.groupItems.add();
          grp.name = slot.name + '_' + layerName;
          grp.move(targetLayer, ElementPlacement.PLACEATBEGINNING);

          for (var g = sel.length - 1; g >= 0; g--) {
            sel[g].move(grp, ElementPlacement.PLACEATBEGINNING);
          }

          // Get current bounds
          var grpBounds = grp.geometricBounds;
          var grpW = grpBounds[2] - grpBounds[0];
          var grpH = grpBounds[1] - grpBounds[3];

          // Position to slot location
          // slot.x = left edge, slot.y = top edge (AI coordinates)
          grp.position = [slot.x, slot.y];

          if (slot.rotated) {
            // Rotate 90 degrees around center
            grp.rotate(90, true, true, true, true);
            // Reposition after rotation
            grp.position = [slot.x, slot.y];
          }
        }

        if (wasTargetLocked) targetLayer.locked = true;

        // Switch back to source doc for next layer
        app.activeDocument = srcDoc;
      }

      // Close source doc
      srcDoc.close(SaveOptions.DONOTSAVECHANGES);
      $.sleep(300);

      placed.push({
        name: slot.name,
        x_cm: pointsToCm(slot.x).toFixed(1),
        y_cm: pointsToCm(slot.y).toFixed(1),
        w_cm: pointsToCm(slot.w).toFixed(1),
        h_cm: pointsToCm(slot.h).toFixed(1),
        rotated: slot.rotated
      });
    }

    // Reorder layers properly
    masterCorte.locked = false;
    masterBlanco.locked = false;
    masterOnTop.locked = false;

    // Order: DISEÑO (top) > ON TOP > BLANCO > CORTE (bottom)
    masterDiseno.zOrder(ZOrderMethod.BRINGTOFRONT);

    // Lock production layers
    masterCorte.locked = true;
    masterBlanco.locked = true;
    masterOnTop.locked = true;

    // ===== SAVE MASTER SHEET =====
    app.activeDocument = masterDoc;
    var saveFile = new File(outputPath);
    var saveOpts = new IllustratorSaveOptions();
    saveOpts.compatibility = Compatibility.ILLUSTRATOR17;
    saveOpts.flattenOutput = OutputFlattening.PRESERVEAPPEARANCE;
    saveOpts.pdfCompatible = true;

    masterDoc.saveAs(saveFile, saveOpts);

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      sheetSize: sheetW_cm + 'x' + sheetH_cm + ' cm',
      piecesPlaced: placed.length,
      pieces: placed,
      savedTo: outputPath
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, {
      error: 'NestSheet error: ' + e.message + ' (line ' + e.line + ')',
      stack: e.toString()
    });
  }
})();
