// Illustrator Script: Copy, Move, Rasterize, Apply SILUETA, Vectorize, Remove White, Add Stroke/Fill & Expand
// Workflow:
// 1. Original vector stays in place (0mm)
// 2. Copy → Move 100mm → Rasterize (300 PPI, original colors)
// 3. Copy of rasterized (stays at 100mm) → SILUETA action → Image Trace →
//    Remove white fills → Apply 6pt red stroke + red fill + round corners →
//    Expand Appearance → Expand → Pathfinder Unite → Remove red fill (keep only 1pt red stroke) →
//    Duplicate → Apply 9pt black stroke + black fill + round corners → Send to VERY BACK (behind all objects) →
//    Final at 100mm: 1pt red stroke outline on top, black filled shape with 9pt stroke at the very back

// Check if there's an active document
if (app.documents.length === 0) {
    alert("Please open a document first.");
} else {
    var doc = app.activeDocument;

    // Check if there's a selection
    if (doc.selection.length === 0) {
        alert("Please select an object first.");
    } else {
        // Get the selected item (original vector)
        var selectedItem = doc.selection[0];

        // Save current user interaction level
        var originalInteractionLevel = app.userInteractionLevel;

        // Disable dialogs and warnings
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        try {
            // Step 1: Duplicate and paste in front (same position as original)
            var copiedItem = selectedItem.duplicate();

            // STEP 0: Extract and remove red-filled elements (#e52722) from the COPY before workflow
            // This way the original stays intact at 0mm with all red elements
            var redElements = extractAndRemoveRedElements(copiedItem);

            // CRITICAL FIX for grouped objects: Ungroup and regroup to force update
            // This ensures Illustrator doesn't use cached group representation
            var wasGroup = false;
            var newGroup = copiedItem;

            if (copiedItem.typename === "GroupItem") {
                wasGroup = true;
                // Select all remaining items in the group
                doc.selection = null;

                // Collect all items before ungrouping
                var itemsToRegroup = [];
                for (var idx = 0; idx < copiedItem.pageItems.length; idx++) {
                    itemsToRegroup.push(copiedItem.pageItems[idx]);
                }

                // Ungroup to force Illustrator to update
                var ungroupedItems = copiedItem.pageItems;
                for (var idx = ungroupedItems.length - 1; idx >= 0; idx--) {
                    ungroupedItems[idx].selected = true;
                }

                // Create new group with only non-red items
                if (doc.selection.length > 0) {
                    newGroup = doc.groupItems.add();
                    for (var idx = doc.selection.length - 1; idx >= 0; idx--) {
                        doc.selection[idx].moveToBeginning(newGroup);
                    }
                }

                // Remove the old group shell
                try {
                    copiedItem.remove();
                } catch(e) {}

                copiedItem = newGroup;
            }

            doc.selection = null;
            app.redraw();

        // Step 2: Move the copy 100mm to the right
        // Convert 100mm to points (1mm = 2.83465 points)
        var moveDistance = 100 * 2.83465; // 100mm in points
        copiedItem.translate(moveDistance, 0);

        // Step 3: NOW rasterize the moved copy
        // Get FRESH bounds AFTER removal and movement
        app.redraw();  // Ensure translation is applied
        var clipBounds = copiedItem.visibleBounds;

        // Set up rasterize options
        var options = new RasterizeOptions();
        options.resolution = 300; // 300 PPI
        options.transparency = true;
        options.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;

        // Rasterize the copied item
        // Syntax: doc.rasterize(sourceArt, clipBounds, options)
        var rasterizedItem = doc.rasterize(copiedItem, clipBounds, options);

        // Step 4: Create a copy of the RASTERIZED item (stays at same position - 100mm)
        var secondCopy = rasterizedItem.duplicate();

        // Select only the second copy to apply the SILUETA action
        doc.selection = null;
        secondCopy.selected = true;

        // Apply the SILUETA action from ACCIONES VT set
        try {
            app.doScript("SILUETA", "ACCIONES VT");
        } catch (e) {
            alert("Error: SILUETA action not found in ACCIONES VT set.\n\nPlease make sure:\n1. The action exists in your Actions panel\n2. It's in the 'ACCIONES VT' set\n3. The name is exactly 'SILUETA'");
        }

        // Apply Image Trace (Calco de Imagen) to convert the black silhouette to vector
        // The secondCopy should now be a raster item with black silhouette from SILUETA action

        // Get the current selection (which should be the result of SILUETA action)
        var tracedItem = doc.selection[0];

        // Trace the raster image
        var pluginItem = tracedItem.trace();

        // Configure tracing options for black and white silhouette
        var traceOptions = pluginItem.tracing.tracingOptions;
        traceOptions.tracingMode = TracingModeType.TRACINGMODEBLACKANDWHITE;  // Black and white mode
        traceOptions.threshold = 128;  // Mid-point threshold for black/white
        traceOptions.ignoreWhite = true;  // Ignore white areas
        traceOptions.fills = true;  // Create filled paths
        traceOptions.strokes = false;  // Don't create strokes

        // Force redraw to apply the tracing settings
        app.redraw();

        // Expand the tracing to convert it to vector paths
        var vectorGroup = pluginItem.tracing.expandTracing();

        // Remove white fills (ffffff) from the traced vector group
        // We need to iterate through all pathItems in the group and remove white ones
        if (vectorGroup && vectorGroup.typename === "GroupItem") {
            removeWhiteFills(vectorGroup);
        }

        // Apply 6pt stroke with color #e31018 (red), red fill, and round corners
        applyStrokeToGroup(vectorGroup);

        // Select the group to expand appearance
        doc.selection = null;
        vectorGroup.selected = true;

        // Expand Appearance (converts stroke + fill to filled paths with round corners)
        app.executeMenuCommand('expandStyle');

        // Expand object (final expand from Object > Expand menu)
        app.executeMenuCommand('Expand3');

        // Make sure the object is still selected
        // Get the current selection after expand
        var currentSelection = doc.selection;

        // If it's a group, we need to select all its contents
        if (currentSelection.length > 0 && currentSelection[0].typename === "GroupItem") {
            // Select all paths in the group
            doc.selection = null;
            currentSelection[0].selected = true;
        }

        // Apply Pathfinder Unite to merge all paths into one unified shape
        // Wrap in try-catch because this can fail with complex shapes
        var unifiedShape;
        try {
            app.redraw(); // Give Illustrator time to process before unite
            app.executeMenuCommand('Live Pathfinder Add');

            app.redraw(); // Give Illustrator time to process the unite
            // Expand the pathfinder effect to make it permanent
            app.executeMenuCommand('expandStyle');

            app.redraw(); // Final redraw after expand
            // Get the unified red shape
            unifiedShape = doc.selection[0];
        } catch (e) {
            // If Pathfinder fails, use the current selection as-is
            // This allows the script to continue even if unite fails
            unifiedShape = doc.selection[0];
        }

        // Remove fill from the red shape (keep only red stroke)
        var redColor = new RGBColor();
        redColor.red = 227;
        redColor.green = 16;
        redColor.blue = 24;

        removeRedFillKeepStroke(unifiedShape, redColor);

        // Create a copy of the unified shape for the black outline
        var blackCopy = unifiedShape.duplicate();

        // Apply black fill and stroke to the copy FIRST
        var blackColor = new RGBColor();
        blackColor.red = 0;
        blackColor.green = 0;
        blackColor.blue = 0;

        // Apply black to all paths in the black copy
        applyBlackStrokeToItem(blackCopy, blackColor);

            // Send the black copy to the very back (behind ALL objects)
            blackCopy.zOrder(ZOrderMethod.SENDTOBACK);

            // FINAL STEP: Add red-filled elements on top at 100mm position
            // Copy them from the ORIGINAL selectedItem (at 0mm), not the removed ones
            addRedElementsOnTop(selectedItem, rasterizedItem);

        } catch (e) {
            alert("Error:\n\n" + e.message + "\n\nLine: " + e.line);
        } finally {
            // Restore original user interaction level
            app.userInteractionLevel = originalInteractionLevel;
        }
    }
}

// Function to remove fill from red shape (keep only 1pt red stroke)
function removeRedFillKeepStroke(item, redColor) {
    // If it's a GroupItem, process all paths inside
    if (item.typename === "GroupItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            paths[i].filled = false;  // Remove fill
            paths[i].stroked = true;
            paths[i].strokeColor = redColor;
            paths[i].strokeWidth = 1;  // 1pt stroke
            paths[i].strokeJoin = StrokeJoin.ROUNDENDJOIN;
            paths[i].strokeCap = StrokeCap.ROUNDENDCAP;
        }

        // Recursively process nested groups
        var subGroups = item.groupItems;
        for (var j = 0; j < subGroups.length; j++) {
            removeRedFillKeepStroke(subGroups[j], redColor);
        }
    }
    // If it's a CompoundPathItem, process its pathItems
    else if (item.typename === "CompoundPathItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            paths[i].filled = false;  // Remove fill
            paths[i].stroked = true;
            paths[i].strokeColor = redColor;
            paths[i].strokeWidth = 1;  // 1pt stroke
            paths[i].strokeJoin = StrokeJoin.ROUNDENDJOIN;
            paths[i].strokeCap = StrokeCap.ROUNDENDCAP;
        }
    }
    // If it's a PathItem, apply directly
    else if (item.typename === "PathItem") {
        item.filled = false;  // Remove fill
        item.stroked = true;
        item.strokeColor = redColor;
        item.strokeWidth = 1;  // 1pt stroke
        item.strokeJoin = StrokeJoin.ROUNDENDJOIN;
        item.strokeCap = StrokeCap.ROUNDENDCAP;
    }
}

// Function to apply black fill and 9pt black stroke with round corners
function applyBlackStrokeToItem(item, blackColor) {
    // If it's a GroupItem, process all paths inside
    if (item.typename === "GroupItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            applyBlackStrokeToPath(paths[i], blackColor);
        }

        // Recursively process nested groups
        var subGroups = item.groupItems;
        for (var j = 0; j < subGroups.length; j++) {
            applyBlackStrokeToItem(subGroups[j], blackColor);
        }
    }
    // If it's a CompoundPathItem, process its pathItems
    else if (item.typename === "CompoundPathItem") {
        var paths = item.pathItems;
        for (var i = 0; i < paths.length; i++) {
            applyBlackStrokeToPath(paths[i], blackColor);
        }
    }
    // If it's a PathItem, apply directly
    else if (item.typename === "PathItem") {
        applyBlackStrokeToPath(item, blackColor);
    }
}

// Helper function to apply black stroke to a single path
function applyBlackStrokeToPath(path, blackColor) {
    // Apply black fill
    path.filled = true;
    path.fillColor = blackColor;

    // Apply 9pt black stroke with round corners
    path.stroked = true;
    path.strokeWidth = 9;  // 9 points
    path.strokeColor = blackColor;

    // Set stroke to round corners and caps
    path.strokeJoin = StrokeJoin.ROUNDENDJOIN;
    path.strokeCap = StrokeCap.ROUNDENDCAP;
}

// Function to remove white fills from a group and its children
function removeWhiteFills(group) {
    // Set threshold for detecting white (RGB values close to 255)
    var threshold = 250;

    // Process all pathItems in the group (loop backwards to safely remove items)
    var paths = group.pathItems;
    for (var i = paths.length - 1; i >= 0; i--) {
        var path = paths[i];

        // Check if the path has a fill
        if (path.filled) {
            var fillColor = path.fillColor;

            // Check different color types
            var isWhite = false;

            // RGB Color
            if (fillColor.typename === "RGBColor") {
                if (fillColor.red > threshold &&
                    fillColor.green > threshold &&
                    fillColor.blue > threshold) {
                    isWhite = true;
                }
            }
            // CMYK Color
            else if (fillColor.typename === "CMYKColor") {
                if (fillColor.cyan < 5 &&
                    fillColor.magenta < 5 &&
                    fillColor.yellow < 5 &&
                    fillColor.black < 5) {
                    isWhite = true;
                }
            }
            // GrayColor
            else if (fillColor.typename === "GrayColor") {
                if (fillColor.gray < 5) {
                    isWhite = true;
                }
            }

            // Remove white paths
            if (isWhite) {
                path.remove();
            }
        }
    }

    // Recursively process nested groups
    var subGroups = group.groupItems;
    for (var j = 0; j < subGroups.length; j++) {
        removeWhiteFills(subGroups[j]);
    }
}

// Function to apply 6pt stroke with color #e31018, red fill, and round corners
function applyStrokeToGroup(group) {
    // Create the red color (#e31018)
    var redColor = new RGBColor();
    redColor.red = 227;    // e3 in hex = 227 in decimal
    redColor.green = 16;   // 10 in hex = 16 in decimal
    redColor.blue = 24;    // 18 in hex = 24 in decimal

    // Process all pathItems in the group
    var paths = group.pathItems;
    for (var i = 0; i < paths.length; i++) {
        var path = paths[i];

        // Apply red fill
        path.filled = true;
        path.fillColor = redColor;

        // Apply 6pt stroke with red color
        path.stroked = true;
        path.strokeWidth = 6;  // 6 points
        path.strokeColor = redColor;

        // Set stroke to round corners (StrokeJoin.ROUNDENDJOIN)
        path.strokeJoin = StrokeJoin.ROUNDENDJOIN;

        // Set stroke caps to round as well
        path.strokeCap = StrokeCap.ROUNDENDCAP;
    }

    // Recursively process nested groups
    var subGroups = group.groupItems;
    for (var j = 0; j < subGroups.length; j++) {
        applyStrokeToGroup(subGroups[j]);
    }
}

// Function to extract and remove red-filled elements (#e52722)
function extractAndRemoveRedElements(item) {
    var redElements = [];
    var targetColor = {r: 229, g: 39, b: 34}; // #e52722
    var tolerance = 3; // Stricter matching for exact red color

    function isRedColor(color) {
        if (color && color.typename === "RGBColor") {
            return (Math.abs(color.red - targetColor.r) <= tolerance &&
                    Math.abs(color.green - targetColor.g) <= tolerance &&
                    Math.abs(color.blue - targetColor.b) <= tolerance);
        }
        return false;
    }

    function extractFromItem(currentItem, parentItem) {
        if (currentItem.typename === "GroupItem") {
            // Process paths in the group (backwards to handle removal)
            var paths = currentItem.pathItems;
            for (var i = paths.length - 1; i >= 0; i--) {
                var path = paths[i];
                var isRed = false;

                // Check BOTH fill and stroke for red color
                if (path.filled && isRedColor(path.fillColor)) {
                    isRed = true;
                }
                if (path.stroked && isRedColor(path.strokeColor)) {
                    isRed = true;
                }

                if (isRed) {
                    // Store path info and remove it
                    redElements.push({
                        item: path,
                        parent: currentItem,
                        index: i
                    });
                }
            }

            // Process compound paths
            var compoundPaths = currentItem.compoundPathItems;
            for (var j = compoundPaths.length - 1; j >= 0; j--) {
                var compPath = compoundPaths[j];
                var hasRedColor = false;

                // Check if any subpath has red fill or stroke
                for (var k = 0; k < compPath.pathItems.length; k++) {
                    var subPath = compPath.pathItems[k];
                    if (subPath.filled && isRedColor(subPath.fillColor)) {
                        hasRedColor = true;
                        break;
                    }
                    if (subPath.stroked && isRedColor(subPath.strokeColor)) {
                        hasRedColor = true;
                        break;
                    }
                }

                if (hasRedColor) {
                    redElements.push({
                        item: compPath,
                        parent: currentItem,
                        index: j
                    });
                }
            }

            // Recursively process nested groups
            var subGroups = currentItem.groupItems;
            for (var m = subGroups.length - 1; m >= 0; m--) {
                extractFromItem(subGroups[m], currentItem);
            }
        } else if (currentItem.typename === "PathItem") {
            var isRed = false;
            if (currentItem.filled && isRedColor(currentItem.fillColor)) {
                isRed = true;
            }
            if (currentItem.stroked && isRedColor(currentItem.strokeColor)) {
                isRed = true;
            }

            if (isRed) {
                redElements.push({
                    item: currentItem,
                    parent: parentItem,
                    index: -1
                });
            }
        } else if (currentItem.typename === "CompoundPathItem") {
            var hasRedColor = false;
            for (var k = 0; k < currentItem.pathItems.length; k++) {
                var subPath = currentItem.pathItems[k];
                if (subPath.filled && isRedColor(subPath.fillColor)) {
                    hasRedColor = true;
                    break;
                }
                if (subPath.stroked && isRedColor(subPath.strokeColor)) {
                    hasRedColor = true;
                    break;
                }
            }

            if (hasRedColor) {
                redElements.push({
                    item: currentItem,
                    parent: parentItem,
                    index: -1
                });
            }
        }
    }

    // Extract red elements from the item
    extractFromItem(item, null);

    // Now remove the red elements from the document
    for (var i = 0; i < redElements.length; i++) {
        try {
            var itemToRemove = redElements[i].item;
            // Select it first to ensure Illustrator tracks the removal
            itemToRemove.selected = true;
            itemToRemove.remove();
        } catch (e) {
            // Element might already be removed if it was part of a parent
        }
    }

    // Clear selection after removal
    try {
        app.activeDocument.selection = null;
    } catch (e) {}

    return redElements;
}

// Function to add red-filled elements on top at 100mm position
function addRedElementsOnTop(originalItem, targetItem) {
    var targetColor = {r: 229, g: 39, b: 34}; // #e52722
    var tolerance = 3;
    var moveDistance = 100 * 2.83465; // 100mm in points

    function isRedColor(color) {
        if (color && color.typename === "RGBColor") {
            return (Math.abs(color.red - targetColor.r) <= tolerance &&
                    Math.abs(color.green - targetColor.g) <= tolerance &&
                    Math.abs(color.blue - targetColor.b) <= tolerance);
        }
        return false;
    }

    function copyRedItemsFrom(currentItem) {
        if (currentItem.typename === "GroupItem") {
            // Process paths in the group
            var paths = currentItem.pathItems;
            for (var i = 0; i < paths.length; i++) {
                var path = paths[i];
                var isRed = false;

                if (path.filled && isRedColor(path.fillColor)) {
                    isRed = true;
                }
                if (path.stroked && isRedColor(path.strokeColor)) {
                    isRed = true;
                }

                if (isRed) {
                    // Duplicate this red item
                    var redCopy = path.duplicate();

                    // Move it OUT of its parent group to the top level layer
                    redCopy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);

                    // Now translate 100mm
                    redCopy.translate(moveDistance, 0);

                    // Bring to front
                    redCopy.zOrder(ZOrderMethod.BRINGTOFRONT);
                }
            }

            // Process compound paths
            var compoundPaths = currentItem.compoundPathItems;
            for (var j = 0; j < compoundPaths.length; j++) {
                var compPath = compoundPaths[j];
                var hasRedColor = false;

                for (var k = 0; k < compPath.pathItems.length; k++) {
                    var subPath = compPath.pathItems[k];
                    if (subPath.filled && isRedColor(subPath.fillColor)) {
                        hasRedColor = true;
                        break;
                    }
                    if (subPath.stroked && isRedColor(subPath.strokeColor)) {
                        hasRedColor = true;
                        break;
                    }
                }

                if (hasRedColor) {
                    var redCopy = compPath.duplicate();

                    // Move it OUT of its parent group to the top level layer
                    redCopy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);

                    // Now translate 100mm
                    redCopy.translate(moveDistance, 0);

                    // Bring to front
                    redCopy.zOrder(ZOrderMethod.BRINGTOFRONT);
                }
            }

            // Process ALL text frames (copy all text regardless of color)
            var textFrames = currentItem.textFrames;
            for (var t = 0; t < textFrames.length; t++) {
                var textFrame = textFrames[t];

                // Duplicate this text item
                var textCopy = textFrame.duplicate();

                // Move it OUT of its parent group to the top level layer
                textCopy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);

                // Now translate 100mm
                textCopy.translate(moveDistance, 0);

                // Bring to front
                textCopy.zOrder(ZOrderMethod.BRINGTOFRONT);
            }

            // Recursively process nested groups
            var subGroups = currentItem.groupItems;
            for (var m = 0; m < subGroups.length; m++) {
                copyRedItemsFrom(subGroups[m]);
            }
        } else if (currentItem.typename === "PathItem") {
            var isRed = false;
            if (currentItem.filled && isRedColor(currentItem.fillColor)) {
                isRed = true;
            }
            if (currentItem.stroked && isRedColor(currentItem.strokeColor)) {
                isRed = true;
            }

            if (isRed) {
                var redCopy = currentItem.duplicate();

                // Move it OUT of its parent group to the top level layer
                redCopy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);

                // Now translate 100mm
                redCopy.translate(moveDistance, 0);

                // Bring to front
                redCopy.zOrder(ZOrderMethod.BRINGTOFRONT);
            }
        } else if (currentItem.typename === "CompoundPathItem") {
            var hasRedColor = false;
            for (var k = 0; k < currentItem.pathItems.length; k++) {
                var subPath = currentItem.pathItems[k];
                if (subPath.filled && isRedColor(subPath.fillColor)) {
                    hasRedColor = true;
                    break;
                }
                if (subPath.stroked && isRedColor(subPath.strokeColor)) {
                    hasRedColor = true;
                    break;
                }
            }

            if (hasRedColor) {
                var redCopy = currentItem.duplicate();

                // Move it OUT of its parent group to the top level layer
                redCopy.move(app.activeDocument.activeLayer, ElementPlacement.PLACEATEND);

                // Now translate 100mm
                redCopy.translate(moveDistance, 0);

                // Bring to front
                redCopy.zOrder(ZOrderMethod.BRINGTOFRONT);
            }
        }
    }

    // Copy red items from the original item (at 0mm)
    copyRedItemsFrom(originalItem);
}
