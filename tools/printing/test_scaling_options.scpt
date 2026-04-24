-- Test Script for SHARP Scaling Options
-- Tests different combinations of scaling-related parameters

property testPDFPath : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property printerName : "SHARP_MX_6580N__8513615400_"

on run
    -- Get a test PDF file
    set testFiles to getPDFFiles(testPDFPath)

    if length of testFiles = 0 then
        display alert "No PDF files found in TO_PRINT folder for testing"
        return
    end if

    set testFile to item 1 of testFiles
    set testFilePath to testPDFPath & "/" & testFile

    display dialog "Testing scaling options with file: " & testFile & return & return & "This will test different parameter combinations. Continue?" buttons {"Cancel", "Test"} default button "Test"

    if button returned of result is "Cancel" then return

    -- Test 1: Image Type = COTGraphics
    display dialog "Test 1: Setting Image Type to COTGraphics" & return & "This might handle PDF scaling differently." buttons {"Skip", "Test"} default button "Test"

    if button returned of result is "Test" then
        try
            set cmd1 to "lp -d \"" & printerName & "\" -n 1 -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.330x480mm -o ARCOType=COTGraphics \"" & testFilePath & "\""
            do shell script cmd1
            display dialog "Test 1 sent. Check the output size!" buttons {"OK"}
        on error
            display dialog "Test 1 failed" buttons {"OK"}
        end try
    end if

    -- Test 2: Simulation Profile = ISEScale
    display dialog "Test 2: Setting Simulation Profile to ISEScale" & return & "This has 'Scale' in the name!" buttons {"Skip", "Test"} default button "Test"

    if button returned of result is "Test" then
        try
            set cmd2 to "lp -d \"" & printerName & "\" -n 1 -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.330x480mm -o ARCSimProfile=ISEScale \"" & testFilePath & "\""
            do shell script cmd2
            display dialog "Test 2 sent. Check the output size!" buttons {"OK"}
        on error
            display dialog "Test 2 failed" buttons {"OK"}
        end try
    end if

    -- Test 3: Image Type = COTCustom
    display dialog "Test 3: Setting Image Type to COTCustom" & return & "Custom settings might allow proper scaling." buttons {"Skip", "Test"} default button "Test"

    if button returned of result is "Test" then
        try
            set cmd3 to "lp -d \"" & printerName & "\" -n 1 -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.330x480mm -o ARCOType=COTCustom \"" & testFilePath & "\""
            do shell script cmd3
            display dialog "Test 3 sent. Check the output size!" buttons {"OK"}
        on error
            display dialog "Test 3 failed" buttons {"OK"}
        end try
    end if

    display dialog "All 3 tests complete! These are the options that worked for you previously:" & return & return & "Test 1: COTGraphics (Image Type = Graphics)" & return & "Test 2: ISEScale (Simulation Profile = Scale)" & return & "Test 3: COTCustom (Image Type = Custom)" & return & return & "Measure each output to confirm they give you the correct 30cm x 39cm size!" buttons {"OK"}

end run

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