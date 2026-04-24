/**
 * PREPARACION Execute - Auto-runs the preparation workflow.
 * Creates silhouette cut lines from a design.
 * Ported from PREPARACION_ARM.jsx.
 */

// Include utilities
//@include "utils.jsx"

(function() {
  try {
    var doc = app.activeDocument;

    if (doc.selection.length === 0) {
      writeJSON(ARMADO_OUTPUT, { error: 'No design selected for preparation.' });
      return;
    }

    var originalInteractionLevel = app.userInteractionLevel;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

    try {
      // STEP 1: Group all selected items
      var selectedItems = doc.selection;
      var originalGroup;

      if (selectedItems.length === 1 && selectedItems[0].typename === 'GroupItem') {
        originalGroup = selectedItems[0];
      } else {
        originalGroup = doc.groupItems.add();
        for (var i = selectedItems.length - 1; i >= 0; i--) {
          selectedItems[i].moveToBeginning(originalGroup);
        }
      }

      var originalRef = originalGroup;

      // STEP 2: Duplicate
      var workingCopy = originalGroup.duplicate();

      // STEP 3: Move 100mm to the right
      var moveDistance = 100 * 2.83465;
      workingCopy.translate(moveDistance, 0);

      // STEP 4: Calculate bounds with padding
      app.redraw();
      var bounds = workingCopy.visibleBounds;
      var padding = 10;
      var clipBounds = [
        bounds[0] - padding, bounds[1] + padding,
        bounds[2] + padding, bounds[3] - padding
      ];

      // STEP 5: Rasterize
      var options = new RasterizeOptions();
      options.resolution = 300;
      options.transparency = true;
      options.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;
      options.padding = padding;
      var rasterizedItem = doc.rasterize(workingCopy, clipBounds, options);

      // STEP 6: Duplicate for silhouette (keep rasterizedItem as the colored design)
      var silhouetteCopy = rasterizedItem.duplicate();
      doc.selection = null;
      silhouetteCopy.selected = true;

      // STEP 7: Apply SILUETA action
      try {
        app.doScript('SILUETA', 'ACCIONES VT');
        app.redraw();
      } catch (e) {
        writeJSON(ARMADO_OUTPUT, {
          error: 'SILUETA action not found. Make sure the action exists in "ACCIONES VT" action set. (' + e.message + ')'
        });
        app.userInteractionLevel = originalInteractionLevel;
        return;
      }

      // STEP 8: Image Trace — always ensure ignoreWhite is set
      var tracedItem = doc.selection[0];
      var vectorGroup;

      if (tracedItem.typename === 'PluginItem') {
        // Live trace — update options with ignoreWhite and expand
        try {
          var traceOpts = tracedItem.tracing.tracingOptions;
          traceOpts.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE;
          traceOpts.threshold = 128;
          traceOpts.ignoreWhite = true;
          traceOpts.fills = true;
          traceOpts.strokes = false;
          app.redraw();
          vectorGroup = tracedItem.tracing.expandTracing();
        } catch (e2) {
          app.executeMenuCommand('expandStyle');
          app.redraw();
          vectorGroup = doc.selection[0];
        }
      } else if (tracedItem.typename === 'GroupItem') {
        // SILUETA already traced + expanded — re-rasterize and re-trace with ignoreWhite
        doc.selection = null;
        tracedItem.selected = true;
        var reBounds = tracedItem.visibleBounds;
        var rePadding = 5;
        var reClip = [reBounds[0] - rePadding, reBounds[1] + rePadding, reBounds[2] + rePadding, reBounds[3] - rePadding];
        var reOpts = new RasterizeOptions();
        reOpts.resolution = 300;
        reOpts.transparency = true;
        reOpts.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;
        var reRaster = doc.rasterize(tracedItem, reClip, reOpts);
        doc.selection = null;
        reRaster.selected = true;
        var rePlugin = reRaster.trace();
        var reTraceOpts = rePlugin.tracing.tracingOptions;
        reTraceOpts.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE;
        reTraceOpts.threshold = 128;
        reTraceOpts.ignoreWhite = true;
        reTraceOpts.fills = true;
        reTraceOpts.strokes = false;
        app.redraw();
        vectorGroup = rePlugin.tracing.expandTracing();
      } else {
        // RasterItem — trace from scratch with proper options
        var pluginItem = tracedItem.trace();
        var traceOptions = pluginItem.tracing.tracingOptions;
        traceOptions.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE;
        traceOptions.threshold = 128;
        traceOptions.ignoreWhite = true;
        traceOptions.fills = true;
        traceOptions.strokes = false;
        app.redraw();
        vectorGroup = pluginItem.tracing.expandTracing();
      }

      // STEP 9: Remove white fills
      if (vectorGroup && vectorGroup.typename === 'GroupItem') {
        removeWhiteFills(vectorGroup);
      }

      // STEP 10: Apply red color
      var redColor = new RGBColor();
      redColor.red = 227; redColor.green = 16; redColor.blue = 24;
      applyColorToAll(vectorGroup, redColor, 6);

      // STEP 11: Expand and Pathfinder Unite
      doc.selection = null;
      vectorGroup.selected = true;
      app.executeMenuCommand('expandStyle');
      app.executeMenuCommand('Expand3');

      try {
        app.redraw();
        app.executeMenuCommand('Live Pathfinder Add');
        app.redraw();
        app.executeMenuCommand('expandStyle');
        app.redraw();
      } catch (e) {}

      var unifiedShape = doc.selection[0];

      // STEP 11b: Remove internal residues — keep only the largest outer path
      removeInternalPaths(unifiedShape);

      // STEP 12: Set red outline only
      setOutlineOnly(unifiedShape, redColor, 1);

      // STEP 13: Create black background copy
      var blackCopy = unifiedShape.duplicate();
      var blackColor = new RGBColor();
      blackColor.red = 0; blackColor.green = 0; blackColor.blue = 0;
      applyColorToAll(blackCopy, blackColor, 9);
      blackCopy.zOrder(ZOrderMethod.SENDTOBACK);

      // STEP 14: Copy special elements on top
      copySpecialElements(originalRef, moveDistance);

      // STEP 15: Remove original design (no longer needed for ARMADO)
      try { originalRef.remove(); } catch (e) {}

      // Select ALL remaining items (only the silhouette result remains)
      doc.selection = null;
      var layer = doc.activeLayer;
      for (var si = 0; si < layer.pageItems.length; si++) {
        layer.pageItems[si].selected = true;
      }

      writeJSON(ARMADO_OUTPUT, {
        success: true,
        selectedCount: doc.selection ? doc.selection.length : 0
      });

    } finally {
      app.userInteractionLevel = originalInteractionLevel;
    }

  } catch (e) {
    writeJSON(ARMADO_OUTPUT, { error: 'Preparacion error: ' + e.message + ' (line ' + e.line + ')' });
  }
})();

// Helper functions
function removeWhiteFills(item) {
  if (item.typename === 'GroupItem') {
    for (var i = item.pathItems.length - 1; i >= 0; i--) {
      if (isWhite(item.pathItems[i])) item.pathItems[i].remove();
    }
    for (var j = item.groupItems.length - 1; j >= 0; j--) {
      removeWhiteFills(item.groupItems[j]);
    }
  }
}

function isWhite(path) {
  if (!path.filled) return false;
  var c = path.fillColor;
  if (c.typename === 'RGBColor') return (c.red > 250 && c.green > 250 && c.blue > 250);
  if (c.typename === 'CMYKColor') return (c.cyan < 5 && c.magenta < 5 && c.yellow < 5 && c.black < 5);
  if (c.typename === 'GrayColor') return (c.gray < 5);
  return false;
}

function applyColorToAll(item, color, strokeWidth) {
  if (item.typename === 'GroupItem') {
    for (var i = 0; i < item.pathItems.length; i++) applyToPath(item.pathItems[i], color, strokeWidth);
    for (var j = 0; j < item.groupItems.length; j++) applyColorToAll(item.groupItems[j], color, strokeWidth);
    for (var k = 0; k < item.compoundPathItems.length; k++) applyColorToAll(item.compoundPathItems[k], color, strokeWidth);
  } else if (item.typename === 'CompoundPathItem') {
    for (var i = 0; i < item.pathItems.length; i++) applyToPath(item.pathItems[i], color, strokeWidth);
  } else if (item.typename === 'PathItem') {
    applyToPath(item, color, strokeWidth);
  }
}

function applyToPath(path, color, sw) {
  path.filled = true; path.fillColor = color;
  path.stroked = true; path.strokeWidth = sw; path.strokeColor = color;
  path.strokeJoin = StrokeJoin.ROUNDENDJOIN;
  path.strokeCap = StrokeCap.ROUNDENDCAP;
}

function setOutlineOnly(item, color, sw) {
  if (item.typename === 'GroupItem') {
    for (var i = 0; i < item.pathItems.length; i++) {
      var p = item.pathItems[i];
      p.filled = false; p.stroked = true; p.strokeColor = color; p.strokeWidth = sw;
      p.strokeJoin = StrokeJoin.ROUNDENDJOIN; p.strokeCap = StrokeCap.ROUNDENDCAP;
    }
    for (var j = 0; j < item.groupItems.length; j++) setOutlineOnly(item.groupItems[j], color, sw);
    for (var k = 0; k < item.compoundPathItems.length; k++) setOutlineOnly(item.compoundPathItems[k], color, sw);
  } else if (item.typename === 'CompoundPathItem') {
    for (var i = 0; i < item.pathItems.length; i++) {
      var p = item.pathItems[i];
      p.filled = false; p.stroked = true; p.strokeColor = color; p.strokeWidth = sw;
      p.strokeJoin = StrokeJoin.ROUNDENDJOIN; p.strokeCap = StrokeCap.ROUNDENDCAP;
    }
  } else if (item.typename === 'PathItem') {
    item.filled = false; item.stroked = true; item.strokeColor = color; item.strokeWidth = sw;
    item.strokeJoin = StrokeJoin.ROUNDENDJOIN; item.strokeCap = StrokeCap.ROUNDENDCAP;
  }
}

function copySpecialElements(originalItem, moveDistance) {
  var targetRed = { r: 229, g: 39, b: 34 };
  var tolerance = 5;

  function isTargetRed(color) {
    if (color && color.typename === 'RGBColor') {
      return (Math.abs(color.red - targetRed.r) <= tolerance &&
              Math.abs(color.green - targetRed.g) <= tolerance &&
              Math.abs(color.blue - targetRed.b) <= tolerance);
    }
    return false;
  }

  function copyAndMove(item) {
    var copy = item.duplicate();
    copy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);
    copy.translate(moveDistance, 0);
    copy.zOrder(ZOrderMethod.BRINGTOFRONT);
  }

  function shouldCopy(item) {
    if (item.typename === 'TextFrame') return true;
    if (item.typename === 'PathItem') {
      if (item.filled && isTargetRed(item.fillColor)) return true;
      if (item.stroked && isTargetRed(item.strokeColor)) return true;
    }
    if (item.typename === 'CompoundPathItem') {
      for (var i = 0; i < item.pathItems.length; i++) {
        if (item.pathItems[i].filled && isTargetRed(item.pathItems[i].fillColor)) return true;
        if (item.pathItems[i].stroked && isTargetRed(item.pathItems[i].strokeColor)) return true;
      }
    }
    return false;
  }

  function processItem(item) {
    if (item.typename === 'GroupItem') {
      for (var i = 0; i < item.pageItems.length; i++) {
        var pi = item.pageItems[i];
        if (shouldCopy(pi)) copyAndMove(pi);
        else if (pi.typename === 'GroupItem') processItem(pi);
      }
    } else if (shouldCopy(item)) {
      copyAndMove(item);
    }
  }

  processItem(originalItem);
}

function removeInternalPaths(item) {
  // Collect all individual paths (from groups, compound paths, etc.)
  var allPaths = [];

  function collectPaths(obj) {
    if (obj.typename === 'PathItem') {
      allPaths.push(obj);
    } else if (obj.typename === 'CompoundPathItem') {
      for (var i = 0; i < obj.pathItems.length; i++) {
        allPaths.push(obj.pathItems[i]);
      }
    } else if (obj.typename === 'GroupItem') {
      for (var i = 0; i < obj.pageItems.length; i++) {
        collectPaths(obj.pageItems[i]);
      }
    }
  }

  collectPaths(item);
  if (allPaths.length <= 1) return;

  // Find the largest path by bounding box area
  var largestIdx = 0;
  var largestArea = 0;
  for (var i = 0; i < allPaths.length; i++) {
    var b = allPaths[i].geometricBounds;
    var area = (b[2] - b[0]) * (b[1] - b[3]);
    if (area > largestArea) {
      largestArea = area;
      largestIdx = i;
    }
  }

  // Remove all paths except the largest (iterate backwards for safe removal)
  for (var i = allPaths.length - 1; i >= 0; i--) {
    if (i !== largestIdx) {
      try { allPaths[i].remove(); } catch (e) {}
    }
  }

  // Also remove empty compound paths and groups left behind
  if (item.typename === 'GroupItem') {
    for (var i = item.compoundPathItems.length - 1; i >= 0; i--) {
      if (item.compoundPathItems[i].pathItems.length === 0) {
        try { item.compoundPathItems[i].remove(); } catch (e) {}
      }
    }
    for (var i = item.groupItems.length - 1; i >= 0; i--) {
      if (item.groupItems[i].pageItems.length === 0) {
        try { item.groupItems[i].remove(); } catch (e) {}
      }
    }
  }
}
