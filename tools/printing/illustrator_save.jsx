/*
Cross-Platform Illustrator Save Script
Works on both macOS and Windows
Dual save: User location + PDF copy to TO_PRINT folder
*/

// Configuration - MODIFY THESE PATHS FOR YOUR SYSTEM
var MAC_TO_PRINT_FOLDER = "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT";
var WIN_TO_PRINT_FOLDER = "D:\\TRABAJOS\\2025\\ARMADOS VT\\TO_PRINT"; // Adjust Windows path as needed

function main() {
    try {
        // Check if Illustrator is running and document is open
        if (app.documents.length === 0) {
            alert("No document is currently open in Illustrator.");
            return;
        }

        var doc = app.activeDocument;

        // Check if document has been saved before (has a valid path)
        var hasBeenSaved = true;
        try {
            var currentPath = doc.fullName;
        } catch (e) {
            hasBeenSaved = false;
        }

        // Part 1: Save to user-chosen location (native .ai format)
        var userSaveLocation = saveToUserLocation(doc, hasBeenSaved);

        if (userSaveLocation) {
            // Part 2: Export PDF copy to TO_PRINT folder
            exportPDFToToPrint(doc);

            alert("File saved successfully!\n\nNative file: " + userSaveLocation + "\nPDF copy: Created in TO_PRINT folder");
        } else {
            alert("Save operation was cancelled.");
        }

    } catch (error) {
        alert("Error: " + error.message);
    }
}

function saveToUserLocation(doc, hasBeenSaved) {
    try {
        var saveFile;

        if (hasBeenSaved) {
            // Document has been saved before, show Save As dialog
            saveFile = File.saveDialog("Save Illustrator file as:", "Adobe Illustrator Files:*.ai");
        } else {
            // New document, show save dialog
            saveFile = File.saveDialog("Save new Illustrator file:", "Adobe Illustrator Files:*.ai");
        }

        if (saveFile) {
            // Ensure .ai extension
            if (!saveFile.name.toLowerCase().match(/\.ai$/)) {
                saveFile = new File(saveFile.fsName + ".ai");
            }

            // Save as native Illustrator format
            var saveOptions = new IllustratorSaveOptions();
            saveOptions.compatibility = Compatibility.ILLUSTRATOR24; // CS6 compatibility
            saveOptions.flattenOutput = OutputFlattening.PRESERVEAPPEARANCE;
            saveOptions.fontSubsetThreshold = 100;

            doc.saveAs(saveFile, saveOptions);
            return saveFile.fsName;
        }

        return null;

    } catch (error) {
        throw new Error("Failed to save to user location: " + error.message);
    }
}

function exportPDFToToPrint(doc) {
    try {
        // Determine correct TO_PRINT folder path based on operating system
        var toPrintFolder = getToPrintFolderPath();

        if (!toPrintFolder.exists) {
            // Try to create the folder structure
            createFolderStructure(toPrintFolder);
        }

        if (!toPrintFolder.exists) {
            throw new Error("TO_PRINT folder does not exist and could not be created: " + toPrintFolder.fsName);
        }

        // Generate PDF filename based on document name
        var docName = doc.name;
        // Remove .ai extension if present
        if (docName.toLowerCase().match(/\.ai$/)) {
            docName = docName.substring(0, docName.length - 3);
        }

        // Create unique filename with timestamp if file already exists
        var pdfFileName = docName + ".pdf";
        var pdfFile = new File(toPrintFolder + "/" + pdfFileName);

        var counter = 1;
        while (pdfFile.exists) {
            pdfFileName = docName + "_" + counter + ".pdf";
            pdfFile = new File(toPrintFolder + "/" + pdfFileName);
            counter++;
        }

        // Set up PDF export options optimized for printing
        var pdfOptions = new ExportOptionsPDF();

        // Basic settings
        pdfOptions.compatibility = PDFCompatibility.ACROBAT5; // Wide compatibility
        pdfOptions.generateThumbnails = true;
        pdfOptions.preserveEditability = false;

        // Print optimization settings
        pdfOptions.pDFPreset = "[High Quality Print]"; // Use High Quality Print preset

        // Page settings
        pdfOptions.artboardRange = "1"; // Only first artboard/page

        // Font settings
        pdfOptions.fontSubsetThreshold = 100;

        // Color settings
        pdfOptions.colorConversionID = ColorConversion.None; // Preserve original colors
        pdfOptions.colorProfileID = ColorProfile.None;

        // Export the PDF
        doc.exportFile(pdfFile, ExportType.PDF, pdfOptions);

        return pdfFile.fsName;

    } catch (error) {
        throw new Error("Failed to export PDF to TO_PRINT folder: " + error.message);
    }
}

function getToPrintFolderPath() {
    try {
        // Detect operating system and return appropriate path
        if ($.os.match(/windows/i)) {
            // Windows
            return new Folder(WIN_TO_PRINT_FOLDER);
        } else {
            // macOS (and other Unix-like systems)
            return new Folder(MAC_TO_PRINT_FOLDER);
        }
    } catch (error) {
        throw new Error("Could not determine TO_PRINT folder path: " + error.message);
    }
}

function createFolderStructure(targetFolder) {
    try {
        // Try to create the folder and its parent directories
        var pathParts = targetFolder.fsName.split(Folder.fs === "/" ? "/" : "\\");
        var currentPath = "";

        for (var i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === "") continue;

            currentPath += pathParts[i];
            if (Folder.fs === "/") {
                currentPath += "/";
            } else {
                currentPath += "\\";
            }

            var folder = new Folder(currentPath);
            if (!folder.exists) {
                folder.create();
            }
        }

        return targetFolder.exists;

    } catch (error) {
        // Folder creation failed, but don't throw error - let the main function handle it
        return false;
    }
}

// Run the main function
main();