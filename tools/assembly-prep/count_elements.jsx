// Illustrator Script: Count Selected Elements
// ============================================
// Shows detailed breakdown of all selected items

if (app.documents.length === 0) {
    alert("Please open a document first.");
} else {
    var doc = app.activeDocument;

    if (doc.selection.length === 0) {
        alert("No objects selected.");
    } else {
        var counts = {
            total: 0,
            groups: 0,
            paths: 0,
            compoundPaths: 0,
            textFrames: 0,
            placedItems: 0,
            rasterItems: 0,
            pluginItems: 0,
            meshItems: 0,
            symbolItems: 0,
            other: 0
        };

        // Count top-level selected items
        var topLevel = doc.selection.length;

        // Recursively count all items
        function countItems(item) {
            counts.total++;

            switch (item.typename) {
                case "GroupItem":
                    counts.groups++;
                    // Count children
                    for (var i = 0; i < item.pageItems.length; i++) {
                        countItems(item.pageItems[i]);
                    }
                    break;
                case "PathItem":
                    counts.paths++;
                    break;
                case "CompoundPathItem":
                    counts.compoundPaths++;
                    break;
                case "TextFrame":
                    counts.textFrames++;
                    break;
                case "PlacedItem":
                    counts.placedItems++;
                    break;
                case "RasterItem":
                    counts.rasterItems++;
                    break;
                case "PluginItem":
                    counts.pluginItems++;
                    break;
                case "MeshItem":
                    counts.meshItems++;
                    break;
                case "SymbolItem":
                    counts.symbolItems++;
                    break;
                default:
                    counts.other++;
                    break;
            }
        }

        // Process all selected items
        for (var i = 0; i < doc.selection.length; i++) {
            countItems(doc.selection[i]);
        }

        // Build result message
        var msg = "SELECTED ELEMENTS BREAKDOWN\n";
        msg += "================================\n\n";
        msg += "Top-level selected: " + topLevel + "\n";
        msg += "Total elements: " + counts.total + "\n\n";
        msg += "--- By Type ---\n";

        if (counts.groups > 0) msg += "Groups: " + counts.groups + "\n";
        if (counts.paths > 0) msg += "Paths: " + counts.paths + "\n";
        if (counts.compoundPaths > 0) msg += "Compound Paths: " + counts.compoundPaths + "\n";
        if (counts.textFrames > 0) msg += "Text Frames: " + counts.textFrames + "\n";
        if (counts.placedItems > 0) msg += "Placed Items: " + counts.placedItems + "\n";
        if (counts.rasterItems > 0) msg += "Raster Items: " + counts.rasterItems + "\n";
        if (counts.pluginItems > 0) msg += "Plugin Items: " + counts.pluginItems + "\n";
        if (counts.meshItems > 0) msg += "Mesh Items: " + counts.meshItems + "\n";
        if (counts.symbolItems > 0) msg += "Symbol Items: " + counts.symbolItems + "\n";
        if (counts.other > 0) msg += "Other: " + counts.other + "\n";

        alert(msg);
    }
}
