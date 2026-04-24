/**
 * ARMADO Execute - Takes a pre-computed arrangement plan and places pieces.
 * Reads plan from /tmp/armado_input.json, executes in Illustrator.
 * Ported from ARMADO.jsx with all placement, badge, and cut line logic.
 */

// Include utilities
//@include "utils.jsx"

(function() {
  try {
    var plan = readJSON(ARMADO_INPUT);
    if (!plan || !plan.placements) {
      writeJSON(ARMADO_OUTPUT, { error: 'No valid arrangement plan found.' });
      return;
    }

    var sourceDoc = app.activeDocument;

    if (sourceDoc.selection.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No design selected. Please select your design first.' });
      return;
    }

    // Copy the selection
    app.executeMenuCommand('copy');

    // Open template or create document
    var newDoc;
    var sheetWidthCm = plan.sheetWidth;
    var sheetHeightCm = plan.sheetHeight;
    var marginCm = plan.margin;

    if (plan.useLibretaTemplate) {
      // LIBRETA: create document programmatically
      var docPreset = new DocumentPreset();
      docPreset.width = cmToPoints(sheetWidthCm);
      docPreset.height = cmToPoints(sheetHeightCm);
      docPreset.units = RulerUnits.Centimeters;
      docPreset.colorMode = DocumentColorSpace.CMYK;

      newDoc = app.documents.addDocument('Print', docPreset);
      newDoc.activate();

      var artboard = newDoc.artboards[0];
      artboard.artboardRect = [0, cmToPoints(sheetHeightCm), cmToPoints(sheetWidthCm), 0];
    } else {
      // Standard template
      var templateFile = new File(plan.templatePath);
      if (!templateFile.exists) {
        writeJSON(ARMADO_OUTPUT, { error: 'Template not found: ' + plan.templatePath });
        return;
      }
      newDoc = app.open(templateFile);
      newDoc.activate();
    }

    var marginPt = cmToPoints(marginCm);
    var placedItems = [];

    // Place each piece according to plan
    // Grid spacing uses OVERALL dimensions, ARMADO positions by overall bounds — they match.
    for (var i = 0; i < plan.placements.length; i++) {
      var p = plan.placements[i];

      app.executeMenuCommand('paste');

      if (newDoc.selection.length > 0) {
        var placed = newDoc.selection[0];

        // Group if multiple items pasted
        if (newDoc.selection.length > 1) {
          app.executeMenuCommand('group');
          placed = newDoc.selection[0];
        }

        // Scale if needed
        if (plan.scaleFactor && plan.scaleFactor !== 1.0) {
          placed.resize(plan.scaleFactor * 100, plan.scaleFactor * 100);
        }

        // Rotation
        if (p.rotation === 90) {
          placed.rotate(90);
        }

        // Tête-bêche flip
        if (p.flip) {
          placed.rotate(180);
        }

        // Position by overall bounds
        var xPos = cmToPoints(p.x);
        var yPos = -cmToPoints(p.y);
        var bounds = placed.geometricBounds;
        placed.translate(xPos - bounds[0], yPos - bounds[1]);

        placedItems.push(placed);
      }

      newDoc.selection = null;
    }

    // Group all pieces and center
    if (placedItems.length > 0) {
      for (var i = 0; i < placedItems.length; i++) {
        placedItems[i].selected = true;
      }

      if (newDoc.selection.length > 0) {
        app.executeMenuCommand('group');
        var allPieces = newDoc.selection[0];

        // Center in usable area
        var artboard = newDoc.artboards[0];
        var abRect = artboard.artboardRect;
        var usableLeft = abRect[0] + marginPt;
        var usableTop = abRect[1] - marginPt;
        var usableRight = abRect[2] - marginPt;
        var usableBottom = abRect[3] + marginPt;
        var usableWidth = usableRight - usableLeft;
        var usableHeight = usableTop - usableBottom;

        var gBounds = allPieces.geometricBounds;
        var groupWidth = gBounds[2] - gBounds[0];
        var groupHeight = gBounds[1] - gBounds[3];

        var targetLeft = usableLeft + (usableWidth - groupWidth) / 2;
        var targetTop = usableTop - (usableHeight - groupHeight) / 2;

        allPieces.translate(targetLeft - gBounds[0], targetTop - gBounds[1]);

        // PORTALLAVES: create bars
        if (plan.portallavesBars) {
          var finalBounds = allPieces.geometricBounds;
          var barStartX = finalBounds[2] + cmToPoints(0.5);
          var barStartY = finalBounds[1];
          createPortallavesBars(newDoc, barStartX, barStartY, plan.portallavesBars);
        }

        newDoc.selection = null;
      }
    }

    // Fix z-order
    fixZOrder(newDoc);

    // Badge and cut line artboard (skip for LIBRETA)
    if (plan.createBadge) {
      // Get the final bounds of placed pieces for badge positioning
      var pieceBounds = null;
      for (var pi = 0; pi < newDoc.layers[0].pageItems.length; pi++) {
        var item = newDoc.layers[0].pageItems[pi];
        if (item.name === 'Product Badge') continue;
        var b = item.geometricBounds;
        if (!pieceBounds) pieceBounds = [b[0], b[1], b[2], b[3]];
        else {
          pieceBounds[0] = Math.min(pieceBounds[0], b[0]);
          pieceBounds[1] = Math.max(pieceBounds[1], b[1]);
          pieceBounds[2] = Math.max(pieceBounds[2], b[2]);
          pieceBounds[3] = Math.min(pieceBounds[3], b[3]);
        }
      }
      createProductBadge(newDoc, plan.productType, plan.total, 0, pieceBounds);
    }

    if (plan.createCutLineArtboard) {
      createCutLineArtboard(newDoc);
    }

    // Cleanup: ensure only 2 artboards exist (pieces + cut lines)
    while (newDoc.artboards.length > 2) {
      newDoc.artboards.remove(newDoc.artboards.length - 1);
    }

    writeJSON(ARMADO_OUTPUT, {
      success: true,
      total: plan.total,
      description: plan.description
    });

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'ArmadoExecute error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();

// ============================================================
// HELPER FUNCTIONS (ported from ARMADO.jsx)
// ============================================================

function createPortallavesBars(doc, startX, startY, barConfig) {
  var barWidthPt = cmToPoints(barConfig.width);
  var barHeightPt = cmToPoints(barConfig.height);
  var holeDiameterPt = cmToPoints(barConfig.hole.diameter);
  var gapX = cmToPoints(0.09);
  var holeSpacing = barHeightPt / (barConfig.hole.count + 1);

  for (var i = 0; i < barConfig.count; i++) {
    var barX = startX + i * (barWidthPt + gapX);
    var barY = startY;

    var bar = doc.pathItems.rectangle(barY, barX, barWidthPt, barHeightPt);
    bar.filled = false;
    bar.stroked = true;
    bar.strokeColor = makeRedColor();
    bar.strokeWidth = 1;

    var holeCenterX = barX + barWidthPt / 2;

    for (var h = 0; h < barConfig.hole.count; h++) {
      var holeCenterY = barY - holeSpacing * (h + 1);
      var hole = doc.pathItems.ellipse(
        holeCenterY + holeDiameterPt / 2,
        holeCenterX - holeDiameterPt / 2,
        holeDiameterPt, holeDiameterPt
      );
      hole.filled = false;
      hole.stroked = true;
      hole.strokeColor = makeRedColor();
      hole.strokeWidth = 1;
    }
  }
}

function fixZOrder(doc) {
  // Ungroup all (except badges)
  var maxIter = 50;
  var iter = 0;
  var hasGroups = true;

  while (hasGroups && iter < maxIter) {
    hasGroups = false;
    iter++;
    for (var i = doc.groupItems.length - 1; i >= 0; i--) {
      var group = doc.groupItems[i];
      if (group.name === 'Product Badge') continue;
      try {
        while (group.pageItems.length > 0) {
          group.pageItems[0].move(doc.layers[0], ElementPlacement.PLACEATBEGINNING);
        }
        group.remove();
        hasGroups = true;
      } catch (e) {}
    }
  }

  // Send filled items to back, red strokes to front
  var filledItems = [];
  var redStrokeItems = [];

  for (var i = 0; i < doc.pathItems.length; i++) {
    var item = doc.pathItems[i];
    if (item.stroked && isRedColor(item.strokeColor)) {
      redStrokeItems.push(item);
    } else if (item.filled) {
      filledItems.push(item);
    }
  }

  for (var i = 0; i < doc.compoundPathItems.length; i++) {
    var item = doc.compoundPathItems[i];
    if (item.pathItems.length > 0) {
      var fp = item.pathItems[0];
      if (fp.stroked && isRedColor(fp.strokeColor)) {
        redStrokeItems.push(item);
      } else if (fp.filled) {
        filledItems.push(item);
      }
    }
  }

  for (var i = 0; i < filledItems.length; i++) {
    try { filledItems[i].zOrder(ZOrderMethod.SENDTOBACK); } catch (e) {}
  }
  for (var i = 0; i < redStrokeItems.length; i++) {
    try { redStrokeItems[i].zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e) {}
  }
}

function createProductBadge(doc, productType, pieceCount, artboardIndex, pieceBounds) {
  doc.artboards.setActiveArtboardIndex(artboardIndex);
  var artboard = doc.artboards[artboardIndex];
  var abRect = artboard.artboardRect;

  var badgeSize = cmToPoints(0.6);
  // The template artboard is larger than the 30x39cm frame.
  // Compute the frame rect (30x39cm centered on the artboard)
  var artboardW = abRect[2] - abRect[0];
  var artboardH = abRect[1] - abRect[3];
  var sheetW = cmToPoints(30);
  var sheetH = cmToPoints(39);
  var frameLeft = abRect[0] + (artboardW - sheetW) / 2;
  var frameTop = abRect[1] - (artboardH - sheetH) / 2;
  var frameRight = frameLeft + sheetW;
  var frameBottom = frameTop - sheetH;
  // Position badge at bottom-right INSIDE the 30x39 frame
  var badgeLeft = frameRight - cmToPoints(0.3) - badgeSize;
  var badgeTop = frameBottom + cmToPoints(0.3) + badgeSize;

  var bgShape, outlineShape;

  if (productType === 'IMANES') {
    bgShape = doc.pathItems.ellipse(badgeTop, badgeLeft, badgeSize, badgeSize);
    var smallSize = badgeSize / 1.4;
    var offset = (badgeSize - smallSize) / 2;
    outlineShape = doc.pathItems.ellipse(badgeTop - offset, badgeLeft + offset, smallSize, smallSize);
  } else if (productType === 'LLAVEROS') {
    var cx = badgeLeft + badgeSize / 2;
    var cy = badgeTop - badgeSize / 2;
    bgShape = createTriangle(doc, cx, cy, badgeSize);
    outlineShape = createTriangle(doc, cx, cy, badgeSize / 1.4);
  } else if (productType === 'PORTALLAVES') {
    var cx = badgeLeft + badgeSize / 2;
    var cy = badgeTop - badgeSize / 2;
    bgShape = createHexagon(doc, cx, cy, badgeSize);
    outlineShape = createHexagon(doc, cx, cy, badgeSize / 1.4);
  } else {
    // DESTAPADOR: rectangle
    bgShape = doc.pathItems.rectangle(badgeTop, badgeLeft, badgeSize, badgeSize);
    var smallSize = badgeSize / 1.4;
    var offset = (badgeSize - smallSize) / 2;
    outlineShape = doc.pathItems.rectangle(badgeTop - offset, badgeLeft + offset, smallSize, smallSize);
  }

  bgShape.filled = true;
  bgShape.fillColor = makeBlackColor();
  bgShape.stroked = false;

  outlineShape.filled = false;
  outlineShape.stroked = true;
  outlineShape.strokeColor = makeRedColor();
  outlineShape.strokeWidth = 2;

  var textFrame = doc.textFrames.add();
  textFrame.contents = pieceCount.toString();
  textFrame.textRange.characterAttributes.size = 14;
  textFrame.textRange.characterAttributes.fillColor = makeWhiteColor();
  textFrame.textRange.paragraphAttributes.justification = Justification.CENTER;

  var cx = badgeLeft + badgeSize / 2;
  var cy = badgeTop - badgeSize / 2;
  var tb = textFrame.geometricBounds;
  var tw = tb[2] - tb[0];
  var th = tb[1] - tb[3];
  textFrame.position = [cx - tw / 2, cy + th / 2];

  // Duplicate small red outline for artboard 2 (just the circle, no text/bg)
  var badgeSuaje = outlineShape.duplicate(doc.layers[0], ElementPlacement.PLACEATBEGINNING);

  // Group badge on artboard 1
  var badge = doc.groupItems.add();
  badge.name = 'Product Badge';
  bgShape.moveToBeginning(badge);
  outlineShape.moveToBeginning(badge);
  textFrame.moveToBeginning(badge);
}

function createTriangle(doc, cx, cy, size) {
  var tri = doc.pathItems.add();
  tri.setEntirePath([
    [cx, cy + size * 0.6],
    [cx - size * 0.5, cy - size * 0.3],
    [cx + size * 0.5, cy - size * 0.3]
  ]);
  tri.closed = true;
  return tri;
}

function createHexagon(doc, cx, cy, size) {
  var hex = doc.pathItems.add();
  var r = size * 0.5;
  var pts = [];
  for (var i = 0; i < 6; i++) {
    var angle = (i * 60 - 90) * Math.PI / 180;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  hex.setEntirePath(pts);
  hex.closed = true;
  return hex;
}

function createCutLineArtboard(doc) {
  var redLines = [];
  var firstRect = doc.artboards[0].artboardRect;

  // Find all red stroked items (skip sub-paths inside CompoundPathItems to avoid double-move)
  for (var i = 0; i < doc.pathItems.length; i++) {
    var item = doc.pathItems[i];
    if (item.parent && (item.parent.typename === 'GroupItem' || item.parent.typename === 'CompoundPathItem')) continue;
    if (item.stroked && isRedColor(item.strokeColor)) {
      var b = item.geometricBounds;
      if (b[0] < firstRect[2] && b[2] > firstRect[0] && b[3] < firstRect[1] && b[1] > firstRect[3]) {
        redLines.push(item);
      }
    }
  }

  for (var i = 0; i < doc.compoundPathItems.length; i++) {
    var item = doc.compoundPathItems[i];
    if (item.parent && item.parent.typename === 'GroupItem') continue;
    if (item.pathItems.length > 0 && item.pathItems[0].stroked && isRedColor(item.pathItems[0].strokeColor)) {
      var b = item.geometricBounds;
      if (b[0] < firstRect[2] && b[2] > firstRect[0] && b[3] < firstRect[1] && b[1] > firstRect[3]) {
        redLines.push(item);
      }
    }
  }

  if (redLines.length === 0) return;

  // Create second artboard
  if (doc.artboards.length < 2) {
    var abWidth = firstRect[2] - firstRect[0];
    var newRect = [
      firstRect[2] + 20, firstRect[1],
      firstRect[2] + 20 + abWidth, firstRect[3]
    ];
    doc.artboards.add(newRect);
  }

  var secondRect = doc.artboards[1].artboardRect;
  var offsetX = secondRect[0] - firstRect[0];
  var offsetY = secondRect[1] - firstRect[1];

  for (var i = 0; i < redLines.length; i++) {
    redLines[i].translate(offsetX, offsetY);
  }
}

function findRedBoundaryInItem(item) {
  var bounds = null;
  function check(obj) {
    if (obj.typename === 'PathItem' && obj.stroked && isRedColor(obj.strokeColor)) {
      var b = obj.geometricBounds;
      if (!bounds) bounds = [b[0], b[1], b[2], b[3]];
      else {
        bounds[0] = Math.min(bounds[0], b[0]);
        bounds[1] = Math.max(bounds[1], b[1]);
        bounds[2] = Math.max(bounds[2], b[2]);
        bounds[3] = Math.min(bounds[3], b[3]);
      }
    } else if (obj.typename === 'CompoundPathItem' && obj.pathItems.length > 0) {
      if (obj.pathItems[0].stroked && isRedColor(obj.pathItems[0].strokeColor)) {
        var b = obj.geometricBounds;
        if (!bounds) bounds = [b[0], b[1], b[2], b[3]];
        else {
          bounds[0] = Math.min(bounds[0], b[0]);
          bounds[1] = Math.max(bounds[1], b[1]);
          bounds[2] = Math.max(bounds[2], b[2]);
          bounds[3] = Math.min(bounds[3], b[3]);
        }
      }
    } else if (obj.typename === 'GroupItem') {
      for (var i = 0; i < obj.pageItems.length; i++) check(obj.pageItems[i]);
    }
  }
  check(item);
  return bounds;
}

function makeRedColor() {
  var c = new RGBColor();
  c.red = 227; c.green = 19; c.blue = 27;
  return c;
}

function makeBlackColor() {
  var c = new RGBColor();
  c.red = 0; c.green = 0; c.blue = 0;
  return c;
}

function makeWhiteColor() {
  var c = new RGBColor();
  c.red = 255; c.green = 255; c.blue = 255;
  return c;
}
