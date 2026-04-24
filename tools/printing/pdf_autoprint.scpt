(*
PDF Auto-Print & Archive System
Main script for monitoring, previewing, and printing PDFs with ADHESIVO preset
Moves processed files to ARCHIVED folder automatically
*)

-- Configuration
set watchFolder to "/Volumes/TRABAJOS/2025/ARMADOS VT/TO_PRINT"
set archivedFolder to watchFolder & "/ARCHIVED"
set printPreset to "ADHESIVO"

-- Main monitoring loop
on run
	-- Check if folders exist
	if not folderExists(watchFolder) then
		display alert "Error" message "Watch folder does not exist: " & watchFolder buttons {"OK"} default button "OK"
		return
	end if

	-- Create archived folder if it doesn't exist
	createArchivedFolder()

	-- Start monitoring loop
	repeat
		try
			set pdfFiles to getPDFFiles(watchFolder)

			if length of pdfFiles > 0 then
				repeat with pdfFile in pdfFiles
					set filePath to watchFolder & "/" & pdfFile

					-- Show preview and get user confirmation
					if previewAndConfirm(filePath) then
						-- Get copy count from user
						set copyCount to getCopyCount()

						if copyCount > 0 then
							-- Print the file
							if printPDFFirstPage(filePath, copyCount) then
								-- Move to archived folder
								moveToArchived(filePath, pdfFile)
								display notification "Printed and archived: " & pdfFile with title "PDF Auto-Print"
							else
								display alert "Print Error" message "Failed to print: " & pdfFile buttons {"OK"} default button "OK"
							end if
						end if
					end if
				end repeat
			end if

			-- Wait 5 seconds before checking again
			delay 5

		on error errMsg
			display alert "Script Error" message errMsg buttons {"Continue", "Stop"} default button "Continue"
			if button returned of result is "Stop" then exit repeat
		end try
	end repeat
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
		display alert "Folder Creation Error" message "Could not create ARCHIVED folder: " & errMsg
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
on previewAndConfirm(filePath)
	try
		-- Open PDF in Preview
		tell application "Preview"
			open (filePath as POSIX file)
			activate
		end tell

		-- Wait a moment for Preview to load
		delay 2

		-- Ask user for confirmation
		set confirmResult to display dialog "Do you want to print this PDF?" & return & return & "File: " & (name of (info for (filePath as POSIX file))) buttons {"Skip", "Print"} default button "Print" with icon note

		-- Close the Preview window
		tell application "Preview"
			close front window
		end tell

		return button returned of confirmResult is "Print"

	on error
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
		display alert "Archive Error" message "Could not move file to archived folder: " & errMsg buttons {"OK"} default button "OK"
		return false
	end try
end moveToArchived