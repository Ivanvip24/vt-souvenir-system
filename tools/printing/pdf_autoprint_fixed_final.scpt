-- PDF Auto-Print with Manual Settings (Fixed Auto-Fit Version)
-- Configured to override auto-fit settings that cause scaling issues

property watchFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property archivedFolder : watchFolder & "/ARCHIVED"
property printerName : "SHARP_MX_6580N__8513615400_"

on run
    try
        -- Check if folders exist
        if not folderExists(watchFolder) then
            display alert "Error" message "Watch folder does not exist: " & watchFolder
            return
        end if

        -- Create archived folder if needed
        createArchivedFolder()

        -- Get PDF files
        set pdfFiles to getPDFFiles(watchFolder)

        if length of pdfFiles = 0 then
            display notification "No PDF files found in TO_PRINT folder" with title "PDF Auto-Print"
            return
        end if

        -- Show summary
        set fileCount to length of pdfFiles
        set summaryMsg to "Found " & fileCount & " PDF file"
        if fileCount > 1 then set summaryMsg to summaryMsg & "s"
        set summaryMsg to summaryMsg & " ready to process."

        display dialog summaryMsg buttons {"Cancel", "Start Processing"} default button "Start Processing"

        if button returned of result is "Cancel" then return

        -- Process files
        set processedCount to 0
        repeat with pdfFile in pdfFiles
            set filePath to watchFolder & "/" & pdfFile

            if previewAndConfirm(filePath, pdfFile) then
                set copyCount to getCopyCount()
                if copyCount > 0 then
                    if printPDF(filePath, copyCount) then
                        moveToArchived(filePath, pdfFile)
                        set processedCount to processedCount + 1
                    end if
                end if
            end if
        end repeat

        -- Final message
        display dialog "Processing complete! Processed " & processedCount & " files." buttons {"OK"}

    on error errMsg
        display alert "Error" message errMsg
    end try
end run

on folderExists(folderPath)
    try
        tell application "Finder"
            return exists folder (folderPath as POSIX file)
        end tell
    on error
        return false
    end try
end folderExists

on createArchivedFolder()
    try
        tell application "Finder"
            if not (exists folder (archivedFolder as POSIX file)) then
                make new folder at (watchFolder as POSIX file) with properties {name:"ARCHIVED"}
            end if
        end tell
    end try
end createArchivedFolder

on getPDFFiles(folderPath)
    try
        tell application "Finder"
            set pdfFiles to {}
            set allFiles to name of files of folder (folderPath as POSIX file)
            repeat with fileName in allFiles
                if fileName ends with ".pdf" or fileName ends with ".PDF" then
                    set end of pdfFiles to fileName
                end if
            end repeat
            return pdfFiles
        end tell
    on error
        return {}
    end try
end getPDFFiles

on previewAndConfirm(filePath, fileName)
    try
        -- Open in Preview
        tell application "Preview"
            open (filePath as POSIX file)
            activate
        end tell

        delay 2

        -- Ask for confirmation
        set confirmResult to display dialog "Do you want to print this PDF?" & return & return & "File: " & fileName buttons {"Skip", "Print"} default button "Print"

        -- Close Preview
        tell application "Preview"
            close front window
        end tell

        return button returned of confirmResult is "Print"

    on error
        return false
    end try
end previewAndConfirm

on getCopyCount()
    try
        set copyDialog to display dialog "How many copies do you need?" default answer "1" buttons {"Cancel", "Print"} default button "Print"

        if button returned of copyDialog is "Print" then
            set copyText to text returned of copyDialog
            try
                set copyCount to copyText as integer
                if copyCount > 0 and copyCount ≤ 99 then
                    return copyCount
                end if
            end try
        end if
        return 0
    on error
        return 0
    end try
end getCopyCount

on printPDF(filePath, copyCount)
    try
        -- Method 1: Try command line with explicit settings to override auto-fit
        set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.330x480mm -o fit-to-page=false -o nofit-to-page \"" & filePath & "\""

        do shell script shellCommand
        return true

    on error errMsg1
        -- Method 2: Try with ADHESIVO preset but with explicit no-fit options
        try
            set shellCommand2 to "lp -d \"ADHESIVO\" -n " & copyCount & " -o page-ranges=1 -o fit-to-page=false -o nofit-to-page \"" & filePath & "\""
            do shell script shellCommand2
            return true
        on error errMsg2
            -- Method 3: Show print dialog for manual verification (fallback)
            try
                -- Open in Preview to show print dialog for verification
                tell application "Preview"
                    open (filePath as POSIX file)
                    activate
                end tell

                delay 2

                -- Open print dialog
                tell application "System Events"
                    tell process "Preview"
                        keystroke "p" using command down
                        delay 3
                    end tell
                end tell

                -- Show detailed instructions about auto-fit settings
                display dialog "IMPORTANT - Print dialog is open. Please check these settings:" & return & return & "1. Preset: ADHESIVE" & return & "2. Paper Size: ADHESIVE (330 x 480 mm)" & return & "3. Pages: Range from 1 to 1" & return & return & "CRITICAL - Look for these AUTO-FIT options and TURN THEM OFF:" & return & "• Layout → 'Scale to fit paper size' (UNCHECK)" & return & "• Paper Handling → 'Scale to fit paper size' (UNCHECK)" & return & "• Preview → Scale: 100.2% (NOT 'Scale to Fit')" & return & "• Preview → Auto Rotate: OFF" & return & return & "Only click OK here after you've verified ALL settings!" buttons {"OK"} default button "OK"

                -- Wait for printing completion
                display dialog "Did the print complete successfully?" buttons {"Yes - Continue", "No - Skip"} default button "Yes - Continue"

                -- Close Preview
                tell application "Preview"
                    close front window
                end tell

                return button returned of result is "Yes - Continue"

            on error errMsg3
                -- Close Preview if open
                try
                    tell application "Preview"
                        close front window
                    end tell
                end try
                return false
            end try
        end try
    end try
end printPDF

on moveToArchived(filePath, fileName)
    try
        tell application "Finder"
            move (filePath as POSIX file) to (archivedFolder as POSIX file)
        end tell
        return true
    on error
        return false
    end try
end moveToArchived