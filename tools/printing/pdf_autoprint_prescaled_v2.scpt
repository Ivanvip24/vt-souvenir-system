(*
PDF Auto-Print & Archive System - Pre-Scaled Version
Based on working pdf_autoprint_ondemand.scpt
Scales PDFs to 100.2% before printing to compensate for printer scaling issue
*)

on run
	-- Configuration
	set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
	set archivedFolder to watchFolder & "/ARCHIVED"
	set printPreset to "ADHESIVO"
	set printerName to "SHARP_MX_6580N__8513615400_"
	set scalingPercent to "100.2"
	set scalingScript to "/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/PRINTING_PJ/scale_pdf.py"
	try
		-- Check if folders exist
		if not folderExists(watchFolder) then
			display alert "Error" message "Watch folder does not exist: " & watchFolder buttons {"OK"} default button "OK"
			return
		end if

		-- Check if scaling script exists
		if not fileExists(scalingScript) then
			display alert "Error" message "Scaling script not found: " & scalingScript buttons {"OK"} default button "OK"
			return
		end if

		-- Create archived folder if it doesn't exist
		createArchivedFolder()

		-- Get all PDF files in the folder
		set pdfFiles to getPDFFiles(watchFolder)

		if length of pdfFiles = 0 then
			display notification "No PDF files found in TO_PRINT folder" with title "PDF Auto-Print (Pre-Scaled)" sound name "Glass"
			return
		end if

		-- Show summary before starting
		set fileCount to length of pdfFiles
		set summaryMsg to "Found " & fileCount & " PDF file"
		if fileCount > 1 then set summaryMsg to summaryMsg & "s"
		set summaryMsg to summaryMsg & " ready to process:" & return & return

		repeat with i from 1 to length of pdfFiles
			set summaryMsg to summaryMsg & "• " & (item i of pdfFiles) & return
		end repeat

		set summaryMsg to summaryMsg & return & "PDFs will be scaled to " & scalingPercent & "% before printing."
		set summaryMsg to summaryMsg & return & "Original files remain unchanged."

		display dialog summaryMsg buttons {"Cancel", "Start Processing"} default button "Start Processing" with icon note

		if button returned of result is "Cancel" then return

		-- Process each PDF file
		set processedCount to 0
		set skippedCount to 0

		repeat with pdfFile in pdfFiles
			set filePath to watchFolder & "/" & pdfFile

			-- Show current progress
			display notification "Processing: " & pdfFile with title "PDF Auto-Print (" & ((processedCount + skippedCount + 1) as string) & "/" & (fileCount as string) & ")"

			-- Show preview and get user confirmation
			if my previewAndConfirm(filePath, pdfFile, processedCount + skippedCount + 1, fileCount, scalingPercent) then
				-- Get copy count from user
				set copyCount to my getCopyCount()

				if copyCount > 0 then
					-- Print the file with scaling
					if my printPDFScaled(filePath, copyCount, pdfFile, scalingScript, scalingPercent, printerName) then
						-- Move to archived folder
						if my moveToArchived(filePath, pdfFile, archivedFolder) then
							set processedCount to processedCount + 1
							display notification "✓ Printed and archived: " & pdfFile with title "PDF Auto-Print" sound name "Tink"
						else
							display alert "Archive Error" message "Printed but could not archive: " & pdfFile buttons {"Continue", "Stop"} default button "Continue"
							if button returned of result is "Stop" then exit repeat
						end if
					else
						display alert "Print Error" message "Failed to print: " & pdfFile buttons {"Skip", "Retry", "Stop"} default button "Skip"
						set userChoice to button returned of result
						if userChoice is "Stop" then
							exit repeat
						else if userChoice is "Retry" then
							-- Retry logic could be added here
							set skippedCount to skippedCount + 1
						else
							set skippedCount to skippedCount + 1
						end if
					end if
				else
					set skippedCount to skippedCount + 1
				end if
			else
				set skippedCount to skippedCount + 1
			end if
		end repeat

		-- Show final summary
		set finalMsg to "PDF Processing Complete!" & return & return
		set finalMsg to finalMsg & "✓ Processed: " & processedCount & " files" & return
		if skippedCount > 0 then
			set finalMsg to finalMsg & "⊘ Skipped: " & skippedCount & " files" & return
		end if
		set finalMsg to finalMsg & return & "All processed files (originals) have been moved to ARCHIVED folder."

		display dialog finalMsg buttons {"Open ARCHIVED Folder", "Done"} default button "Done" with icon note

		if button returned of result is "Open ARCHIVED Folder" then
			tell application "Finder"
				open (archivedFolder as POSIX file)
			end tell
		end if

	on error errMsg
		display alert "Script Error" message "An error occurred: " & errMsg buttons {"OK"} default button "OK"
	end try
end run

-- Check if file exists
on fileExists(filePath)
	try
		tell application "Finder"
			return exists file (filePath as POSIX file)
		end tell
	on error
		return false
	end try
end fileExists

-- Check if folder exists
on folderExists(folderPath)
	try
		tell application "Finder"
			return exists folder (folderPath as POSIX file)
		end tell
	on error
		return false
	end try
end folderExists

-- Create archived folder
on createArchivedFolder()
	try
		tell application "Finder"
			if not (exists folder (archivedFolder as POSIX file)) then
				make new folder at (watchFolder as POSIX file) with properties {name:"ARCHIVED"}
			end if
		end tell
	on error errMsg
		display alert "Folder Creation Error" message "Could not create ARCHIVED folder: " & errMsg buttons {"OK"} default button "OK"
	end try
end createArchivedFolder

-- Get list of PDF files in watch folder
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

-- Preview PDF and get user confirmation
on previewAndConfirm(filePath, fileName, currentIndex, totalFiles, scalingPercent)
	try
		-- Open PDF in Preview
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		-- Wait a moment for Preview to load
		delay 2

		-- Ask user for confirmation with progress info
		set confirmMsg to "File " & currentIndex & " of " & totalFiles & return & return
		set confirmMsg to confirmMsg & "Do you want to print this PDF?" & return & return
		set confirmMsg to confirmMsg & "File: " & fileName & return
		set confirmMsg to confirmMsg & "(Will be scaled to " & scalingPercent & "% for correct output)"

		set confirmResult to display dialog confirmMsg buttons {"Skip", "Skip All Remaining", "Print"} default button "Print" with icon note

		set userChoice to button returned of confirmResult

		-- Close the Preview window AFTER getting the user's choice
		tell application "Preview"
			close front window
		end tell

		-- Wait for Preview to fully close
		delay 1

		if userChoice is "Skip All Remaining" then
			display dialog "Stopping processing at user request." buttons {"OK"} default button "OK" with icon note
			error "User requested to skip all remaining files"
		end if

		return userChoice is "Print"

	on error errMsg
		-- Try to close Preview if it's still open
		try
			tell application "Preview"
				close front window
			end tell
		end try

		if errMsg contains "skip all remaining" then
			error errMsg
		end if

		return false
	end try
end previewAndConfirm

-- Get copy count from user
on getCopyCount()
	try
		set copyDialog to display dialog "How many copies do you need?" default answer "1" buttons {"Cancel", "Print"} default button "Print" with icon question

		if button returned of copyDialog is "Print" then
			set copyText to text returned of copyDialog
			try
				set copyCount to copyText as integer
				if copyCount > 0 and copyCount <= 99 then
					return copyCount
				else
					display alert "Invalid Copy Count" message "Please enter a number between 1 and 99" buttons {"OK"} default button "OK"
					return 0
				end if
			on error
				display alert "Invalid Input" message "Please enter a valid number" buttons {"OK"} default button "OK"
				return 0
			end try
		else
			return 0
		end if

	on error
		return 0
	end try
end getCopyCount

-- Print PDF with pre-scaling
on printPDFScaled(filePath, copyCount, fileName, scalingScript, scalingPercent, printerName)
	set scaledPDF to ""
	try
		-- Step 1: Create scaled PDF using Python script
		display notification "Scaling PDF to " & scalingPercent & "%..." with title "PDF Auto-Print"

		set scalingCommand to "python3 " & quoted form of scalingScript & " " & quoted form of filePath & " " & scalingPercent
		set scaledPDF to do shell script scalingCommand

		if scaledPDF is "" then
			error "Scaling script returned empty path"
		end if

		-- Step 2: Print the scaled PDF using command-line
		display notification "Printing scaled PDF..." with title "PDF Auto-Print"

		-- Build lp command
		set printCommand to "lp -d " & quoted form of printerName
		set printCommand to printCommand & " -n " & (copyCount as string)
		set printCommand to printCommand & " -o page-ranges=1"
		set printCommand to printCommand & " " & quoted form of scaledPDF

		-- Execute print command
		try
			do shell script printCommand
		on error printErr
			-- If command-line fails, show error but continue to cleanup
			log "Print command failed: " & printErr
		end try

		-- Wait for print job to start
		delay 2

		-- Step 3: Clean up temporary scaled PDF
		try
			do shell script "rm " & quoted form of scaledPDF
		on error cleanupErr
			log "Warning: Could not delete temporary file: " & cleanupErr
		end try

		return true

	on error errMsg
		log "Print error: " & errMsg

		-- Clean up temporary file if it exists
		if scaledPDF is not "" then
			try
				do shell script "rm " & quoted form of scaledPDF
			end try
		end if

		return false
	end try
end printPDFScaled

-- Move file to archived folder
on moveToArchived(filePath, fileName, archivedFolder)
	try
		tell application "Finder"
			set sourceFile to (filePath as POSIX file)
			set destinationFolder to (archivedFolder as POSIX file)
			move sourceFile to destinationFolder
		end tell
		return true
	on error errMsg
		log "Archive error: " & errMsg
		return false
	end try
end moveToArchived
