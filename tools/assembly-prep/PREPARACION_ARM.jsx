// Illustrator Script: ARMADO PREPARATION - Rewritten Version
// ============================================================
// Workflow:
// 1. Original stays at 0mm
// 2. Copy ALL selected items → Group them → Move 100mm → Rasterize
// 3. Apply SILUETA action → Image Trace → Create red/black outlines
// 4. Copy special elements (red #e52722 and text) on top
//
// FIXES:
// - Handles ALL selected items (not just first one)
// - Preserves nested group structure
// - Proper bounds calculation with padding
// - Handles TextFrames, PlacedItems, and all object types

// ============================================================
// MAIN SCRIPT
// ============================================================

if (app.documents.length === 0) {
    alert("Please open a document first.");
} else {
    var doc = app.activeDocument;

    if (doc.selection.length === 0) {
        alert("Please select at least one object.");
    } else {
        var originalInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        try {
            // ============================================================
            // STEP 1: Group ALL selected items into a single group
            // ============================================================
            var selectedItems = doc.selection;
            var originalGroup;

            // If only one item selected and it's already a group, use it directly
            if (selectedItems.length === 1 && selectedItems[0].typename === "GroupItem") {
                originalGroup = selectedItems[0];
            } else {
                // Create a new group containing all selected items
                originalGroup = doc.groupItems.add();

                // Move all selected items into the group (backwards to preserve order)
                for (var i = selectedItems.length - 1; i >= 0; i--) {
                    selectedItems[i].moveToBeginning(originalGroup);
                }
            }

            // Store reference to original for later
            var originalRef = originalGroup;

            // ============================================================
            // STEP 2: Duplicate the entire group (preserves structure)
            // ============================================================
            var workingCopy = originalGroup.duplicate();

            // ============================================================
            // STEP 3: Move the copy 100mm to the right
            // ============================================================
            var moveDistance = 100 * 2.83465; // 100mm in points
            workingCopy.translate(moveDistance, 0);

            // ============================================================
            // STEP 4: Calculate bounds WITH PADDING to prevent clipping
            // ============================================================
            app.redraw();
            var bounds = workingCopy.visibleBounds;
            var padding = 10; // 10 points padding on all sides

            var clipBounds = [
                bounds[0] - padding,  // left
                bounds[1] + padding,  // top
                bounds[2] + padding,  // right
                bounds[3] - padding   // bottom
            ];

            // ============================================================
            // STEP 5: Rasterize the working copy
            // ============================================================
            var options = new RasterizeOptions();
            options.resolution = 300;
            options.transparency = true;
            options.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;
            options.padding = padding;

            var rasterizedItem = doc.rasterize(workingCopy, clipBounds, options);

            // ============================================================
            // STEP 6: Duplicate rasterized for silhouette processing
            // ============================================================
            var silhouetteCopy = rasterizedItem.duplicate();

            // Select and apply SILUETA action
            doc.selection = null;
            silhouetteCopy.selected = true;

            try {
                app.doScript("SILUETA", "ACCIONES VT");
            } catch (e) {
                alert("Error: SILUETA action not found.\n\nMake sure:\n1. Action exists in 'ACCIONES VT' set\n2. Name is exactly 'SILUETA'");
                throw e;
            }

            // ============================================================
            // STEP 7: Image Trace the silhouette
            // ============================================================
            var tracedItem = doc.selection[0];
            var pluginItem = tracedItem.trace();

            var traceOptions = pluginItem.tracing.tracingOptions;
            traceOptions.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE;
            traceOptions.threshold = 128;
            traceOptions.ignoreWhite = true;
            traceOptions.fills = true;
            traceOptions.strokes = false;

            app.redraw();

            // Expand tracing to vector
            var vectorGroup = pluginItem.tracing.expandTracing();

            // ============================================================
            // STEP 8: Remove white fills from traced result
            // ============================================================
            if (vectorGroup && vectorGroup.typename === "GroupItem") {
                removeWhiteFillsRecursive(vectorGroup);
            }

            // ============================================================
            // STEP 9: Apply red stroke and fill
            // ============================================================
            var redColor = new RGBColor();
            redColor.red = 227;
            redColor.green = 16;
            redColor.blue = 24;

            applyColorToAllPaths(vectorGroup, redColor, 6);

            // ============================================================
            // STEP 10: Expand Appearance and Object
            // ============================================================
            doc.selection = null;
            vectorGroup.selected = true;

            app.executeMenuCommand('expandStyle');
            app.executeMenuCommand('Expand3');

            // ============================================================
            // STEP 11: Pathfinder Unite
            // ============================================================
            var unifiedShape;
            try {
                app.redraw();
                app.executeMenuCommand('Live Pathfinder Add');
                app.redraw();
                app.executeMenuCommand('expandStyle');
                app.redraw();
                unifiedShape = doc.selection[0];
            } catch (e) {
                unifiedShape = doc.selection[0];
            }

            // ============================================================
            // STEP 12: Set red outline (remove fill, keep 1pt stroke)
            // ============================================================
            setOutlineOnly(unifiedShape, redColor, 1);

            // ============================================================
            // STEP 13: Create black background copy
            // ============================================================
            var blackCopy = unifiedShape.duplicate();

            var blackColor = new RGBColor();
            blackColor.red = 0;
            blackColor.green = 0;
            blackColor.blue = 0;

            applyColorToAllPaths(blackCopy, blackColor, 9);

            // Send black copy to very back
            blackCopy.zOrder(ZOrderMethod.SENDTOBACK);

            // ============================================================
            // STEP 14: Copy special elements on top (red #e52722 + text + all pageItems)
            // ============================================================
            copySpecialElementsOnTop(originalRef, moveDistance);

            // Clear selection
            doc.selection = null;

        } catch (e) {
            alert("Error:\n\n" + e.message + "\n\nLine: " + e.line);
        } finally {
            app.userInteractionLevel = originalInteractionLevel;
        }
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Remove white fills recursively from all nested groups
function removeWhiteFillsRecursive(item) {
    var threshold = 250;

    if (item.typename === "GroupItem") {
        // Process paths backwards for safe removal
        var paths = item.pathItems;
        for (var i = paths.length - 1; i >= 0; i--) {
            if (isWhiteColor(paths[i], threshold)) {
                paths[i].remove();
            }
        }

        // Process nested groups
        var groups = item.groupItems;
        for (var j = groups.length - 1; j >= 0; j--) {
            removeWhiteFillsRecursive(groups[j]);
        }
    }
}

// Check if a path has white fill
function isWhiteColor(path, threshold) {
    if (!path.filled) return false;

    var color = path.fillColor;

    if (color.typename === "RGBColor") {
        return (color.red > threshold && color.green > threshold && color.blue > threshold);
    } else if (color.typename === "CMYKColor") {
        return (color.cyan < 5 && color.magenta < 5 && color.yellow < 5 && color.black < 5);
    } else if (color.typename === "GrayColor") {
        return (color.gray < 5);
    }

    return false;
}

// Apply color (fill and stroke) to all paths in an item
function applyColorToAllPaths(item, color, strokeWidth) {
    if (item.typename === "GroupItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            applyColorToPath(paths[i], color, strokeWidth);
        }

        var groups = item.groupItems;
        for (var j = 0; j < groups.length; j++) {
            applyColorToAllPaths(groups[j], color, strokeWidth);
        }

        var compounds = item.compoundPathItems;
        for (var k = 0; k < compounds.length; k++) {
            applyColorToAllPaths(compounds[k], color, strokeWidth);
        }
    } else if (item.typename === "CompoundPathItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            applyColorToPath(paths[i], color, strokeWidth);
        }
    } else if (item.typename === "PathItem") {
        applyColorToPath(item, color, strokeWidth);
    }
}

// Apply color to a single path
function applyColorToPath(path, color, strokeWidth) {
    path.filled = true;
    path.fillColor = color;
    path.stroked = true;
    path.strokeWidth = strokeWidth;
    path.strokeColor = color;
    path.strokeJoin = StrokeJoin.ROUNDENDJOIN;
    path.strokeCap = StrokeCap.ROUNDENDCAP;
}

// Set outline only (no fill, just stroke)
function setOutlineOnly(item, color, strokeWidth) {
    if (item.typename === "GroupItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            paths[i].filled = false;
            paths[i].stroked = true;
            paths[i].strokeColor = color;
            paths[i].strokeWidth = strokeWidth;
            paths[i].strokeJoin = StrokeJoin.ROUNDENDJOIN;
            paths[i].strokeCap = StrokeCap.ROUNDENDCAP;
        }

        var groups = item.groupItems;
        for (var j = 0; j < groups.length; j++) {
            setOutlineOnly(groups[j], color, strokeWidth);
        }

        var compounds = item.compoundPathItems;
        for (var k = 0; k < compounds.length; k++) {
            setOutlineOnly(compounds[k], color, strokeWidth);
        }
    } else if (item.typename === "CompoundPathItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            paths[i].filled = false;
            paths[i].stroked = true;
            paths[i].strokeColor = color;
            paths[i].strokeWidth = strokeWidth;
            paths[i].strokeJoin = StrokeJoin.ROUNDENDJOIN;
            paths[i].strokeCap = StrokeCap.ROUNDENDCAP;
        }
    } else if (item.typename === "PathItem") {
        item.filled = false;
        item.stroked = true;
        item.strokeColor = color;
        item.strokeWidth = strokeWidth;
        item.strokeJoin = StrokeJoin.ROUNDENDJOIN;
        item.strokeCap = StrokeCap.ROUNDENDCAP;
    }
}

// Copy special elements (red #e52722, text, and other items) on top at 100mm
function copySpecialElementsOnTop(originalItem, moveDistance) {
    var targetRed = {r: 229, g: 39, b: 34}; // #e52722
    var tolerance = 5;

    function isTargetRed(color) {
        if (color && color.typename === "RGBColor") {
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
        return copy;
    }

    function processItem(item) {
        if (item.typename === "GroupItem") {
            // Process ALL pageItems in the group (this catches everything)
            var pageItems = item.pageItems;
            for (var i = 0; i < pageItems.length; i++) {
                var pageItem = pageItems[i];

                // Check if it's a special item that needs to be copied on top
                if (shouldCopyOnTop(pageItem)) {
                    copyAndMove(pageItem);
                } else if (pageItem.typename === "GroupItem") {
                    // Recursively process nested groups
                    processItem(pageItem);
                }
            }
        } else {
            // Single item at top level
            if (shouldCopyOnTop(item)) {
                copyAndMove(item);
            }
        }
    }

    function shouldCopyOnTop(item) {
        // Always copy text frames
        if (item.typename === "TextFrame") {
            return true;
        }

        // Check paths for red color
        if (item.typename === "PathItem") {
            if (item.filled && isTargetRed(item.fillColor)) return true;
            if (item.stroked && isTargetRed(item.strokeColor)) return true;
        }

        // Check compound paths for red color
        if (item.typename === "CompoundPathItem") {
            var paths = item.pathItems;
            for (var i = 0; i < paths.length; i++) {
                if (paths[i].filled && isTargetRed(paths[i].fillColor)) return true;
                if (paths[i].stroked && isTargetRed(paths[i].strokeColor)) return true;
            }
        }

        // Check if it's a placed item (linked image)
        if (item.typename === "PlacedItem") {
            return false; // Don't duplicate placed items, they're already rasterized
        }

        // Check if it's a raster item
        if (item.typename === "RasterItem") {
            return false; // Don't duplicate raster items, they're already rasterized
        }

        return false;
    }

    // Start processing from original item
    processItem(originalItem);
}
