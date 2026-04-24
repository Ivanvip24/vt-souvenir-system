-- PDF Auto-Print with Pre-Scaling to 100.2%
-- Scales PDFs before printing to compensate for printer scaling issue
-- Original files remain unchanged in ARCHIVED folder

property watchFolder : "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
property archivedFolder : watchFolder & "/ARCHIVED"
property printerName : "SHARP_MX_6580N__8513615400_"
property scalingPercent : "103.2"
property scalingScript : "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/scale_pdf_v2.py"

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
					if printPDFWithScaling(filePath, copyCount) then
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
				if copyCount > 0 and copyCount <= 99 then
					return copyCount
				end if
			end try
		end if
		return 0
	on error
		return 0
	end try
end getCopyCount

on printPDFWithScaling(filePath, copyCount)
	set scaledPDF to ""
	try
		-- Step 1: Scale PDF to 100.2% using Python script
		display notification "Scaling PDF to " & scalingPercent & "%..." with title "PDF Auto-Print"

		set scalingCommand to "python3 " & quoted form of scalingScript & " " & quoted form of filePath & " " & scalingPercent
		set scaledPDF to do shell script scalingCommand

		if scaledPDF is "" then
			error "Scaling failed"
		end if

		-- DEBUGGING: Save a copy of the scaled PDF to check it
		set debugCopy to "/Users/ivanvalenciaperez/Downloads/STUFF/scaled_debug.pdf"
		do shell script "cp " & quoted form of scaledPDF & " " & quoted form of debugCopy

		-- Step 2: Print the scaled PDF
		display notification "Printing scaled PDF..." with title "PDF Auto-Print"

		-- Use COTGraphics (Image Type = Graphics) - The working solution!
		set shellCommand to "lp -d \"" & printerName & "\" -n " & copyCount & " -o page-ranges=1 -o InputSlot=Bypass -o PageSize=Custom.330x480mm -o ARCOType=COTGraphics \"" & scaledPDF & "\""

		do shell script shellCommand

		-- Step 3: Clean up temporary scaled PDF
		delay 2
		try
			do shell script "rm " & quoted form of scaledPDF
		end try

		display notification "Scaled PDF saved to STUFF folder for verification" with title "PDF Auto-Print"

		return true

	on error errMsg
		-- Clean up temp file if exists
		if scaledPDF is not "" then
			try
				do shell script "rm " & quoted form of scaledPDF
			end try
		end if

		-- Fallback: ADHESIVO preset only if scaling fails
		try
			set shellCommand2 to "lp -d \"ADHESIVO\" -n " & copyCount & " -o page-ranges=1 \"" & filePath & "\""
			do shell script shellCommand2
			return true
		on error
			return false
		end try
	end try
end printPDFWithScaling

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