(*
PDF Auto-Print & Archive System - On-Demand Version
Triggered by keyboard shortcut to process all PDFs in TO_PRINT folder
Processes files one by one with preview confirmation and archival
*)

-- Configuration
set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
set archivedFolder to watchFolder & "/ARCHIVED"
set printPreset to "ADHESIVO"

on run
	try
		-- Check if folders exist
		if not folderExists(watchFolder) then
			display alert "Error" message "Watch folder does not exist: " & watchFolder buttons {"OK"} default button "OK"
			return
		end if

		-- Create archived folder if it doesn't exist
		createArchivedFolder()

		-- Get all PDF files in the folder
		set pdfFiles to getPDFFiles(watchFolder)

		if length of pdfFiles = 0 then
			display notification "No PDF files found in TO_PRINT folder" with title "PDF Auto-Print" sound name "Glass"
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

		set summaryMsg to summaryMsg & return & "Each file will be previewed before printing."

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
			if previewAndConfirm(filePath, pdfFile, processedCount + skippedCount + 1, fileCount) then
				-- Get copy count from user
				set copyCount to getCopyCount()

				if copyCount > 0 then
					-- Print the file
					if printPDFFirstPage(filePath, copyCount) then
						-- Move to archived folder
						if moveToArchived(filePath, pdfFile) then
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
		set finalMsg to finalMsg & return & "All processed files have been moved to ARCHIVED folder."

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
on previewAndConfirm(filePath, fileName, currentIndex, totalFiles)
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
		set confirmMsg to confirmMsg & "File: " & fileName

		set confirmResult to display dialog confirmMsg buttons {"Skip", "Skip All Remaining", "Print"} default button "Print" with icon note

		-- Close the Preview window
		tell application "Preview"
			close front window
		end tell

		set userChoice to button returned of confirmResult

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

-- Print PDF first page only with ADHESIVO preset
on printPDFFirstPage(filePath, copyCount)
	try
		-- Open PDF in Preview for printing
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		delay 1

		-- Access print dialog
		tell application "System Events"
			tell process "Preview"
				-- Open print dialog
				keystroke "p" using command down
				delay 2

				-- Look for print preset dropdown and select ADHESIVO
				try
					-- Click on preset dropdown (this may need adjustment based on macOS version)
					click pop up button "Presets:" of print panel 1
					delay 1

					-- Select ADHESIVO preset
					click menu item printPreset of menu 1 of pop up button "Presets:" of print panel 1
					delay 1
				on error
					-- If preset selection fails, continue with default settings
					log "Could not select ADHESIVO preset, using current settings"
				end try

				-- Set page range to first page only
				try
					click radio button "From:" of print panel 1
					delay 0.5

					-- Clear and set first page field
					tell text field 1 of print panel 1
						set focused to true
						keystroke "a" using command down
						keystroke "1"
					end tell

					-- Set to page field
					tell text field 2 of print panel 1
						set focused to true
						keystroke "a" using command down
						keystroke "1"
					end tell
				on error
					-- If page range setting fails, log and continue
					log "Could not set page range to first page only"
				end try

				-- Set copy count
				try
					tell text field "Copies:" of print panel 1
						set focused to true
						keystroke "a" using command down
						keystroke (copyCount as string)
					end tell
				on error
					log "Could not set copy count"
				end try

				delay 1

				-- Click Print button
				click button "Print" of print panel 1
			end tell
		end tell

		-- Wait for print job to start
		delay 3

		-- Close Preview
		tell application "Preview"
			close front window
		end tell

		return true

	on error errMsg
		log "Print error: " & errMsg
		-- Try to close Preview if it's still open
		try
			tell application "Preview"
				close front window
			end tell
		end try
		return false
	end try
end printPDFFirstPage

-- Move file to archived folder
on moveToArchived(filePath, fileName)
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